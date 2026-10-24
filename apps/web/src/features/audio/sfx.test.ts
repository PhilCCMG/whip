import { describe, expect, it, vi } from 'vitest';
import {
  CATEGORY_LEVEL,
  CLICK_RATE_SPREAD,
  CLICK_THROTTLE_MS,
  createSfxEngine,
  type BufferLike,
  type ContextLike,
  type GainLike,
  type SfxOptions,
  type SourceLike,
} from './sfx';

interface FakeSource extends SourceLike {
  started: number;
  output: unknown;
}

function fakeContext() {
  const gains: GainLike[] = [];
  const sources: FakeSource[] = [];
  // The fake "bytes" carry the duration in seconds.
  const decode = vi.fn((data: ArrayBuffer): Promise<BufferLike> =>
    Promise.resolve({ duration: new Float32Array(data)[0] ?? 0 }),
  );
  const resume = vi.fn(() => {
    ctx.state = 'running';
    return Promise.resolve();
  });
  const ctx: ContextLike & {
    gains: GainLike[];
    sources: FakeSource[];
    decode: typeof decode;
    resumed: typeof resume;
  } = {
    state: 'suspended',
    destination: {},
    gains,
    sources,
    decode,
    resumed: resume,
    createGain: () => {
      const g: GainLike = { gain: { value: 1 }, connect: () => undefined };
      gains.push(g);
      return g;
    },
    createBufferSource: () => {
      const s: FakeSource = {
        buffer: null,
        playbackRate: { value: 1 },
        started: 0,
        output: null,
        connect: (to) => {
          s.output = to;
        },
        start: () => {
          s.started++;
        },
      };
      sources.push(s);
      return s;
    },
    decodeAudioData: decode,
    resume,
  };
  return ctx;
}

const bytesFor = (seconds: number) => new Float32Array([seconds]).buffer;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(overrides: Partial<SfxOptions> = {}) {
  const ctx = fakeContext();
  let t = 1000;
  const target = new EventTarget();
  const onStart = vi.fn();
  const fetchBytes = vi.fn((url: string) => Promise.resolve(bytesFor(url === 'w.wav' ? 2.5 : 0.2)));
  const engine = createSfxEngine({
    sources: { click: 'c.wav', whoosh: 'w.wav' },
    createContext: () => ctx,
    fetchBytes,
    now: () => t,
    random: () => 1,
    gestureTarget: target,
    hasUserActivation: () => false,
    onStart,
    ...overrides,
  });
  return {
    ctx,
    engine,
    target,
    onStart,
    fetchBytes,
    // Created in this order: master, then the ui and transition categories.
    master: () => ctx.gains[0]!,
    ui: () => ctx.gains[1]!,
    transition: () => ctx.gains[2]!,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

async function ready(s: ReturnType<typeof setup>) {
  s.engine.prepare();
  s.target.dispatchEvent(new Event('pointerdown'));
  await flush();
}

describe('sfx engine', () => {
  it('fetches on prepare but waits for a user gesture to create and resume the context', async () => {
    const s = setup();
    s.engine.prepare(['click']);
    expect(s.fetchBytes).toHaveBeenCalledWith('c.wav');
    expect(s.engine.state.hasContext).toBe(false);

    s.target.dispatchEvent(new Event('keydown'));
    await flush();
    expect(s.engine.state.hasContext).toBe(true);
    expect(s.ctx.resumed).toHaveBeenCalled();
    expect(s.ctx.decode).toHaveBeenCalledTimes(1);

    // Decoded once, however often it is prepared or played.
    s.engine.prepare(['click']);
    s.engine.play('click');
    await flush();
    expect(s.ctx.decode).toHaveBeenCalledTimes(1);
    expect(s.fetchBytes).toHaveBeenCalledTimes(1);
  });

  it('throttles the click and varies its pitch slightly', async () => {
    const s = setup();
    await ready(s);
    expect(s.engine.play('click')).toBe(true);
    s.advance(CLICK_THROTTLE_MS - 10);
    expect(s.engine.play('click')).toBe(false);
    s.advance(10);
    expect(s.engine.play('click')).toBe(true);
    expect(s.ctx.sources.filter((x) => x.started)).toHaveLength(2);
    const rate = s.ctx.sources[0]!.playbackRate.value;
    expect(rate).toBeCloseTo(1 + CLICK_RATE_SPREAD);
    expect(s.ctx.sources[0]!.output).toBe(s.ui());
  });

  it('applies the effects volume per category and the master mute', async () => {
    const s = setup();
    await ready(s);
    s.engine.setVolume(0.8);
    expect(s.ui().gain.value).toBeCloseTo(CATEGORY_LEVEL.ui * 0.8);
    expect(s.transition().gain.value).toBeCloseTo(CATEGORY_LEVEL.transition * 0.8);
    expect(s.master().gain.value).toBe(1);

    s.engine.setEnabled(false);
    expect(s.master().gain.value).toBe(0);
    expect(s.engine.play('click')).toBe(false);
    expect(s.engine.play('whoosh')).toBe(false);

    s.engine.setEnabled(true);
    s.engine.setVolume(0);
    expect(s.engine.play('click')).toBe(false);
    expect(s.ctx.sources).toHaveLength(0);
  });

  it('never overlaps the whoosh and reports its length for music ducking', async () => {
    const s = setup();
    await ready(s);
    expect(s.engine.play('whoosh')).toBe(true);
    expect(s.onStart).toHaveBeenCalledWith('whoosh', 2500);
    s.advance(1000);
    expect(s.engine.play('whoosh')).toBe(false);
    s.advance(1600);
    expect(s.engine.play('whoosh')).toBe(true);
    expect(s.ctx.sources.filter((x) => x.started)).toHaveLength(2);
    expect(s.ctx.sources[0]!.output).toBe(s.transition());
    // The whoosh keeps its natural pitch.
    expect(s.ctx.sources[0]!.playbackRate.value).toBe(1);
  });

  it('plays a sound asked for before decoding finished, once it is ready', async () => {
    const s = setup();
    s.engine.unlock();
    expect(s.engine.play('click')).toBe(true);
    expect(s.ctx.sources).toHaveLength(0);
    await flush();
    expect(s.ctx.sources).toHaveLength(1);
    expect(s.ctx.sources[0]!.started).toBe(1);
  });

  it('does nothing, silently, when Web Audio is unavailable or fails', async () => {
    const none = setup({ createContext: () => null });
    none.engine.prepare();
    none.engine.unlock();
    expect(none.engine.play('click')).toBe(false);

    const broken = setup({
      createContext: () => {
        throw new Error('no audio device');
      },
    });
    broken.engine.unlock();
    expect(() => broken.engine.play('whoosh')).not.toThrow();
    expect(broken.engine.play('whoosh')).toBe(false);

    const failingFetch = setup({ fetchBytes: () => Promise.reject(new Error('offline')) });
    await ready(failingFetch);
    expect(failingFetch.engine.play('click')).toBe(true);
    await flush();
    expect(failingFetch.ctx.sources).toHaveLength(0);
  });
});
