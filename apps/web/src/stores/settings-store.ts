import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

/** UI-only preferences, kept in this browser. */
export interface Settings {
  /** 'system' follows prefers-reduced-motion. */
  motion: 'system' | 'reduced' | 'full';
  textSize: 'standard' | 'large';
  /** Master switch for game audio (the HUD mute toggle and M key flip it). */
  sound: boolean;
  /** Menu music volume, 0–1. */
  musicVolume: number;
  /** UI sound effects volume (clicks, transitions), 0–1. */
  effectsVolume: number;
}

const STORAGE_KEY = 'whip.settings';
const DEFAULTS: Settings = {
  motion: 'system',
  textSize: 'standard',
  sound: true,
  musicVolume: 0.6,
  effectsVolume: 0.5,
};

const volume = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      motion: ['system', 'reduced', 'full'].includes(parsed.motion ?? '')
        ? (parsed.motion as Settings['motion'])
        : DEFAULTS.motion,
      textSize: parsed.textSize === 'large' ? 'large' : 'standard',
      sound: typeof parsed.sound === 'boolean' ? parsed.sound : DEFAULTS.sound,
      musicVolume: volume(parsed.musicVolume, DEFAULTS.musicVolume),
      effectsVolume: volume(parsed.effectsVolume, DEFAULTS.effectsVolume),
    };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Private mode or blocked storage: the setting still applies for this visit.
  }
}

/** Reflect settings on <html>: styles.css reads data-motion, rem sizes follow font-size. */
export function applySettings(s: Pick<Settings, 'motion' | 'textSize'>) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (s.motion === 'system') delete root.dataset.motion;
  else root.dataset.motion = s.motion;
  root.style.fontSize = s.textSize === 'large' ? '112.5%' : '';
}

interface SettingsState extends Settings {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  ...load(),
  set: (key, value) => {
    set({ [key]: value } as Pick<Settings, typeof key>);
    const { motion, textSize, sound, musicVolume, effectsVolume } = get();
    save({ motion, textSize, sound, musicVolume, effectsVolume });
    applySettings({ motion, textSize });
  },
}));

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribeSystem(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

const systemReduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

/** True when motion should be minimal: the player's setting, else the OS preference. */
export function useReducedMotion(): boolean {
  const motion = useSettingsStore((s) => s.motion);
  const system = useSyncExternalStore(subscribeSystem, systemReduced, () => false);
  return motion === 'reduced' || (motion === 'system' && system);
}
