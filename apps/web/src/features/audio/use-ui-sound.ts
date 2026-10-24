import { useEffect, type RefObject } from 'react';
import clickSrc from '../../assets/audio/sfx/click.wav';
import whooshSrc from '../../assets/audio/sfx/whoosh.wav';
import { useSettingsStore } from '../../stores/settings-store';
import { createSfxEngine, type SfxEngine } from './sfx';
import { menuMusic } from './use-menu-music';

/** Music level under the transition whoosh. */
const DUCK = 0.7;

let shared: SfxEngine | null = null;
let unduck: ReturnType<typeof setTimeout> | null = null;

/** The app-wide effects engine (created lazily; nothing is fetched until `useUiSoundPreload`). */
export function sfxEngine(): SfxEngine {
  if (!shared) {
    shared = createSfxEngine({
      sources: { click: clickSrc, whoosh: whooshSrc },
      onStart: (name, ms) => {
        if (name !== 'whoosh') return;
        const music = menuMusic();
        music.duck(DUCK);
        if (unduck) clearTimeout(unduck);
        unduck = setTimeout(() => music.duck(1, 600), ms);
      },
    });
    const { sound, effectsVolume } = useSettingsStore.getState();
    shared.setEnabled(sound);
    shared.setVolume(effectsVolume);
    useSettingsStore.subscribe((s, prev) => {
      if (s.sound !== prev.sound) shared?.setEnabled(s.sound);
      if (s.effectsVolume !== prev.effectsVolume) shared?.setVolume(s.effectsVolume);
    });
  }
  return shared;
}

/**
 * UI sounds. `click` is the quiet feedback for cursor moves, confirms and back (throttled);
 * `whoosh` is only for the two big transitions: title → menu, and entering a career.
 */
export const uiSound = {
  click: () => sfxEngine().play('click'),
  whoosh: () => sfxEngine().play('whoosh'),
  /** Call inside the start gesture, alongside `menuMusic().unlock()`. */
  unlock: () => sfxEngine().unlock(),
};

/** Fetch the click now and the whoosh just after first paint. Mount on the menu/title. */
export function useUiSoundPreload() {
  useEffect(() => {
    const engine = sfxEngine();
    engine.prepare(['click']);
    const t = setTimeout(() => engine.prepare(['whoosh']), 250);
    return () => clearTimeout(t);
  }, []);
}

const CLICKABLE = 'button, a[href], [role="radio"], [role="menuitem"], [role="tab"]';

/**
 * One delegated listener: any button, link or radio clicked inside `ref` plays the click
 * (Enter/Space on a native button fires `click` too). Opt out with `data-sfx="off"` on the element
 * or an ancestor, e.g. where the action plays the whoosh instead. Disabled controls stay silent.
 */
export function useClickSounds(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(CLICKABLE);
      if (!el || !root.contains(el) || el.closest('[data-sfx="off"]')) return;
      if (el.getAttribute('aria-disabled') === 'true' || (el as HTMLButtonElement).disabled) return;
      uiSound.click();
    };
    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [ref]);
}
