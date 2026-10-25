import { describe, expect, it, vi } from 'vitest';
import { OPUS_TYPE, pickTrackSource } from './format';

const sources = { webm: 'track.webm', mp3: 'track.mp3' };

describe('pickTrackSource', () => {
  it('prefers WebM/Opus whenever the browser says it might play it', () => {
    const canPlay = vi.fn(() => 'probably');
    expect(pickTrackSource(sources, canPlay)).toBe('track.webm');
    expect(canPlay).toHaveBeenCalledWith(OPUS_TYPE);
    expect(pickTrackSource(sources, () => 'maybe')).toBe('track.webm');
  });

  it('falls back to the MP3 when Opus is not supported or the check fails', () => {
    expect(pickTrackSource(sources, () => '')).toBe('track.mp3');
    expect(
      pickTrackSource(sources, () => {
        throw new Error('no media');
      }),
    ).toBe('track.mp3');
  });

  it('uses the MP3 in jsdom, which plays nothing', () => {
    expect(pickTrackSource(sources)).toBe('track.mp3');
  });
});
