import { useEffect, type RefObject } from 'react';
import clickSrc from '../../assets/audio/sfx/click.mp3?no-inline';
import divisionBellSrc from '../../assets/audio/sfx/division-bell.mp3?no-inline';
import pageTurnSrc from '../../assets/audio/sfx/page-turn.mp3?no-inline';
import stampHeavySrc from '../../assets/audio/sfx/stamp-heavy.mp3?no-inline';
import stampSrc from '../../assets/audio/sfx/stamp.mp3?no-inline';
import whooshSrc from '../../assets/audio/sfx/whoosh.mp3?no-inline';
import { useSettingsStore } from '../../stores/settings-store';
import { createSfxEngine, type SfxEngine, type SfxName } from './sfx';
import { duckMusic } from './use-menu-music';

// `?no-inline`: always a same-origin file, never a data: URI (the desktop CSP's connect-src has no
// data:, and the engine fetches its samples).

/** Music level under a sound that ducks it: the whoosh dips it, the bell rings over it. */
export const DUCK: Partial<Record<SfxName, number>> = { whoosh: 0.7, 'division-bell': 0.55 };

let shared: SfxEngine | null = null;
let unduck: ReturnType<typeof setTimeout> | null = null;
let duckedUntil = 0;
let duckedTo = 1;

/** Duck the music for `ms`, keeping the deeper of two overlapping ducks until the later ends. */
function duckFor(factor: number, ms: number) {
  const now = Date.now();
  const active = now < duckedUntil;
  duckedTo = active ? Math.min(duckedTo, factor) : factor;
  duckedUntil = Math.max(active ? duckedUntil : 0, now + ms);
  duckMusic(duckedTo);
  if (unduck) clearTimeout(unduck);
  unduck = setTimeout(() => {
    duckedTo = 1;
    duckMusic(1, 600);
  }, duckedUntil - now);
}

/** The app-wide effects engine (created lazily; nothing is fetched until `useUiSoundPreload`). */
export function sfxEngine(): SfxEngine {
  if (!shared) {
    shared = createSfxEngine({
      sources: {
        click: clickSrc,
        whoosh: whooshSrc,
        'stamp-heavy': stampHeavySrc,
        stamp: stampSrc,
        'page-turn': pageTurnSrc,
        'division-bell': divisionBellSrc,
      },
      onStart: (name, ms) => {
        const factor = DUCK[name];
        if (factor !== undefined) duckFor(factor, ms);
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
 * UI sounds (docs/architecture/09-game-ui.md §10 has the full map).
 * - `click`: quiet feedback for cursor moves, confirms and back (throttled).
 * - `whoosh`: only the big transitions: title → menu, entering a career, END WEEK.
 * - `stampHeavy`: the week actually ending, and a division's verdict.
 * - `stamp`: outcome stamps landing in the turn report (capped, see `stampCues`).
 * - `pageTurn`: the paper arriving, and a new induction step.
 * - `divisionBell`: a division being called in the turn report.
 */
export const uiSound = {
  click: () => sfxEngine().play('click'),
  whoosh: () => sfxEngine().play('whoosh'),
  stampHeavy: () => sfxEngine().play('stamp-heavy'),
  stamp: () => sfxEngine().play('stamp'),
  pageTurn: () => sfxEngine().play('page-turn'),
  divisionBell: () => sfxEngine().play('division-bell'),
  /** Call inside the start gesture, alongside `menuMusic().unlock()`. */
  unlock: () => sfxEngine().unlock(),
};

/** Sounds the front end needs (no bell or stamps on the title screen). */
const MENU_SOUNDS: SfxName[] = ['whoosh'];
/** Everything else, fetched once a career is open. */
const GAME_SOUNDS: SfxName[] = ['whoosh', 'stamp-heavy', 'page-turn', 'stamp', 'division-bell'];

/**
 * Fetch the click now and the rest just after first paint: on the menu/title only the whoosh, in
 * a career (`'game'`) the stamps, page turn and bell too.
 */
export function useUiSoundPreload(scope: 'menu' | 'game' = 'menu') {
  useEffect(() => {
    const engine = sfxEngine();
    engine.prepare(['click']);
    const t = setTimeout(() => engine.prepare(scope === 'game' ? GAME_SOUNDS : MENU_SOUNDS), 250);
    return () => clearTimeout(t);
  }, [scope]);
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
