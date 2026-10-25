import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STAMP_CAP, STAMP_MIN_SPACING_MS, stampCues, useSoundCues, type SoundCue } from './cues';
import { uiSound } from './use-ui-sound';

describe('stampCues', () => {
  it('hears at most three stamps, however many land', () => {
    const landings = Array.from({ length: 8 }, (_, i) => 400 + i * 260);
    const heard = stampCues(landings);
    expect(heard).toEqual([400, 660, 920]);
    expect(heard).toHaveLength(STAMP_CAP);
  });

  it('skips landings closer than the minimum spacing', () => {
    const heard = stampCues([100, 200, 300, 360, 900, 1000]);
    expect(heard).toEqual([100, 360, 900]);
    for (let i = 1; i < heard.length; i++) {
      expect(heard[i]! - heard[i - 1]!).toBeGreaterThanOrEqual(STAMP_MIN_SPACING_MS);
    }
  });

  it('plays a single stamp under reduced motion, and none when nothing lands', () => {
    expect(stampCues([400, 660, 920], { reduced: true, reducedAt: 350 })).toEqual([350]);
    expect(stampCues([], { reduced: true })).toEqual([]);
    expect(stampCues([])).toEqual([]);
  });
});

describe('useSoundCues', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const cues: SoundCue[] = [
    { at: 0, sound: 'page-turn' },
    { at: 400, sound: 'stamp' },
    { at: 1200, sound: 'division-bell' },
  ];

  it('plays each cue once at its time, and not again on re-render', () => {
    const page = vi.spyOn(uiSound, 'pageTurn').mockReturnValue(true);
    const stamp = vi.spyOn(uiSound, 'stamp').mockReturnValue(true);
    const bell = vi.spyOn(uiSound, 'divisionBell').mockReturnValue(true);
    const { rerender } = renderHook(({ c, on }) => useSoundCues(c, on), {
      initialProps: { c: cues, on: true },
    });
    vi.advanceTimersByTime(0);
    expect(page).toHaveBeenCalledTimes(1);
    expect(stamp).not.toHaveBeenCalled();
    // A fresh but equal array (as a parent re-render makes) does not restart the sequence.
    rerender({ c: cues.map((x) => ({ ...x })), on: true });
    vi.advanceTimersByTime(400);
    expect(stamp).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(800);
    expect(bell).toHaveBeenCalledTimes(1);
    expect(page).toHaveBeenCalledTimes(1);
  });

  it('cancels what has not played when it goes inactive or unmounts', () => {
    const page = vi.spyOn(uiSound, 'pageTurn').mockReturnValue(true);
    const stamp = vi.spyOn(uiSound, 'stamp').mockReturnValue(true);
    const { rerender, unmount } = renderHook(({ on }) => useSoundCues(cues, on), {
      initialProps: { on: false },
    });
    vi.advanceTimersByTime(2000);
    expect(page).not.toHaveBeenCalled();

    rerender({ on: true });
    vi.advanceTimersByTime(100);
    rerender({ on: false });
    vi.advanceTimersByTime(2000);
    expect(page).toHaveBeenCalledTimes(1);
    expect(stamp).not.toHaveBeenCalled();

    rerender({ on: true });
    unmount();
    vi.advanceTimersByTime(2000);
    expect(stamp).not.toHaveBeenCalled();
  });
});
