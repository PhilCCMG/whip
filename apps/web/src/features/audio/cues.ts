import { useEffect, useRef } from 'react';
import type { SfxName } from './sfx';
import { uiSound } from './use-ui-sound';

/** A sound to play `at` ms after a reveal starts. */
export interface SoundCue {
  at: number;
  sound: SfxName;
}

/** At most this many outcome stamps are heard per reveal, however many land on screen. */
export const STAMP_CAP = 3;
/** And never closer together than this. */
export const STAMP_MIN_SPACING_MS = 250;

/**
 * Which stamp landings get a sound: the first few (up to `STAMP_CAP`), each at least
 * `STAMP_MIN_SPACING_MS` after the last one heard. Reduced motion: the stamps are all there at
 * once, so one stamp, at `reducedAt`.
 */
export function stampCues(
  landings: number[],
  { reduced = false, reducedAt = 0 }: { reduced?: boolean; reducedAt?: number } = {},
): number[] {
  if (landings.length === 0) return [];
  if (reduced) return [reducedAt];
  const heard: number[] = [];
  for (const at of [...landings].sort((a, b) => a - b)) {
    if (heard.length >= STAMP_CAP) break;
    const last = heard[heard.length - 1];
    if (last === undefined || at - last >= STAMP_MIN_SPACING_MS) heard.push(at);
  }
  return heard;
}

// Looked up at call time, so tests can spy on `uiSound`.
const PLAY: Record<SfxName, () => boolean> = {
  click: () => uiSound.click(),
  whoosh: () => uiSound.whoosh(),
  'stamp-heavy': () => uiSound.stampHeavy(),
  stamp: () => uiSound.stamp(),
  'page-turn': () => uiSound.pageTurn(),
  'division-bell': () => uiSound.divisionBell(),
};

/**
 * Play a sequence of cues once each time `active` turns on (or the cues change); unmounting or
 * going inactive cancels whatever has not played yet.
 */
export function useSoundCues(cues: SoundCue[], active: boolean) {
  const key = cues.map((c) => `${c.sound}@${c.at}`).join(',');
  const live = useRef(cues);
  useEffect(() => {
    live.current = cues;
  });
  useEffect(() => {
    if (!active || !key) return;
    const timers = live.current.map((c) => setTimeout(() => PLAY[c.sound](), Math.max(0, c.at)));
    return () => timers.forEach(clearTimeout);
  }, [active, key]);
}
