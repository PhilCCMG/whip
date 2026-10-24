import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMusicController, type AudioLike } from './music';

function fakeAudio(opts: { blockAutoplay?: boolean } = {}) {
  let blocked = !!opts.blockAutoplay;
  const audio: AudioLike & { unblock: () => void; plays: number; loads: number } = {
    src: '',
    loop: false,
    preload: '',
    volume: 1,
    paused: true,
    plays: 0,
    loads: 0,
    play: vi.fn(() => {
      audio.plays++;
      if (blocked) return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
      audio.paused = false;
      return Promise.resolve();
    }),
    pause: vi.fn(() => {
      audio.paused = true;
    }),
    load: () => {
      audio.loads++;
    },
    unblock: () => {
      blocked = false;
    },
  };
  return audio;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('menu music controller', () => {
  it('does not fetch until prepared, then loops and fades in', async () => {
    const audio = fakeAudio();
    const music = createMusicController({
      src: 'm.mp3',
      createAudio: () => audio,
      gestureTarget: null,
    });
    music.setVolume(0.5);
    music.prepare();
    expect(audio.preload).toBe('auto');
    expect(audio.loads).toBe(1);
    expect(audio.loop).toBe(true);

    music.enter();
    await vi.advanceTimersByTimeAsync(0);
    expect(audio.plays).toBeGreaterThan(0);
    expect(audio.volume).toBeLessThan(0.5);
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.volume).toBeCloseTo(0.5);
  });

  it('fades out and pauses on leave', async () => {
    const audio = fakeAudio();
    const music = createMusicController({
      src: 'm.mp3',
      createAudio: () => audio,
      gestureTarget: null,
    });
    music.enter();
    await vi.advanceTimersByTimeAsync(700);
    music.leave();
    await vi.advanceTimersByTimeAsync(300);
    expect(audio.paused).toBe(false);
    expect(audio.volume).toBeGreaterThan(0);
    await vi.advanceTimersByTimeAsync(400);
    expect(audio.volume).toBe(0);
    expect(audio.paused).toBe(true);
  });

  it('waits for a user gesture when autoplay is blocked', async () => {
    const audio = fakeAudio({ blockAutoplay: true });
    const target = new EventTarget();
    const music = createMusicController({
      src: 'm.mp3',
      createAudio: () => audio,
      gestureTarget: target,
    });
    music.enter();
    await vi.advanceTimersByTimeAsync(0);
    expect(music.state.waitingForGesture).toBe(true);

    audio.unblock();
    target.dispatchEvent(new Event('keydown'));
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.paused).toBe(false);
    expect(music.state.waitingForGesture).toBe(false);
  });

  it('stays silent when sound is off and resumes when it comes back on', async () => {
    const audio = fakeAudio();
    const music = createMusicController({
      src: 'm.mp3',
      createAudio: () => audio,
      gestureTarget: null,
    });
    music.setEnabled(false);
    music.enter();
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.plays).toBe(0);

    music.setEnabled(true);
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.paused).toBe(false);

    music.setEnabled(false);
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.paused).toBe(true);
  });
});

describe('music ducking', () => {
  it('dips under a transition and comes back up', async () => {
    const audio = fakeAudio();
    const music = createMusicController({
      src: 'm.mp3',
      createAudio: () => audio,
      gestureTarget: null,
    });
    music.setVolume(0.5);
    music.enter();
    await vi.advanceTimersByTimeAsync(700);
    music.duck(0.7);
    await vi.advanceTimersByTimeAsync(200);
    expect(audio.volume).toBeCloseTo(0.35);
    music.duck(1, 600);
    await vi.advanceTimersByTimeAsync(700);
    expect(audio.volume).toBeCloseTo(0.5);
  });
});
