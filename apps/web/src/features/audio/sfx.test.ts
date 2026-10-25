import { describe, expect, it, vi } from 'vitest';
import {
  CATEGORY_LEVEL,
  CLICK_RATE_SPREAD,
  CLICK_THROTTLE_MS,
  createSfxEngine,
  SFX_SPEC,
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

const SOURCES = {
  click: 'c.wav',
  whoosh: 'w.wav',
  'stamp-heavy': 'sh.mp3',
  stamp: 's.mp3',
  'page-turn': 'p.mp3',
  'division-bell': 'b.mp3',
} as const;
const DURATION: Record<string, number> = { 'w.wav': 2.5, 'b.mp3': 4, 's.mp3': 1.1, 'p.mp3': 0.4 };

const bytesFor = (seconds: number) => new Float32Array([seconds]).buffer;
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup(overrides: Partial<SfxOptions> = {}) {
  const ctx = fakeContext();
  let t = 1000;
  const target = new EventTarget();
  const onStart = vi.fn();
  const fetchBytes = vi.fn((url: string) => Promise.resolve(bytesFor(DURATION[url] ?? 0.2)));
  const engine = createSfxEngine({
    sources: SOURCES,
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
    // Created in this order: master, then the categories in CATEGORY_LEVEL order.
    master: () => ctx.gains[0]!,
    ui: () => ctx.gains[1]!,
    transition: () => ctx.gains[2]!,
    stamp: () => ctx.gains[3]!,
    paper: () => ctx.gains[4]!,
    bell: () => ctx.gains[5]!,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

async function ready(s: ReturnType<typeof setup>) {
  s.engine.prepare(Object.keys(SOURCES) as (keyof typeof SOURCES)[]);
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

  it('routes the new sounds through their own mixer categories', async () => {
    const s = setup();
    await ready(s);
    s.engine.setVolume(1);
    expect(s.stamp().gain.value).toBeCloseTo(CATEGORY_LEVEL.stamp);
    expect(s.paper().gain.value).toBeCloseTo(CATEGORY_LEVEL.paper);
    expect(s.bell().gain.value).toBeCloseTo(CATEGORY_LEVEL.bell);
    // Louder than the click, quieter than the whoosh.
    for (const level of [CATEGORY_LEVEL.stamp, CATEGORY_LEVEL.paper, CATEGORY_LEVEL.bell]) {
      expect(level).toBeGreaterThan(CATEGORY_LEVEL.ui);
      expect(level).toBeLessThan(CATEGORY_LEVEL.transition);
    }

    for (const name of ['stamp-heavy', 'stamp', 'page-turn', 'division-bell'] as const) {
      expect(s.engine.play(name)).toBe(true);
    }
    const outputs = s.ctx.sources.map((x) => x.output);
    expect(outputs).toEqual([s.stamp(), s.stamp(), s.paper(), s.bell()]);
  });

  it('keeps a minimum gap per sound, independently of the others', async () => {
    const s = setup();
    await ready(s);
    const gap = SFX_SPEC.stamp.minGapMs;
    expect(s.engine.play('stamp')).toBe(true);
    // Another sound is not held up by the stamp's gap.
    expect(s.engine.play('stamp-heavy')).toBe(true);
    s.advance(gap - 1);
    expect(s.engine.play('stamp')).toBe(false);
    s.advance(1);
    expect(s.engine.play('stamp')).toBe(true);

    expect(s.engine.play('page-turn')).toBe(true);
    s.advance(SFX_SPEC['page-turn'].minGapMs - 1);
    expect(s.engine.play('page-turn')).toBe(false);
    expect(s.ctx.sources.filter((x) => x.started)).toHaveLength(4);
  });

  it('never overlaps the bell with itself and reports it for music ducking', async () => {
    const s = setup();
    await ready(s);
    expect(s.engine.play('division-bell')).toBe(true);
    expect(s.onStart).toHaveBeenCalledWith('division-bell', 4000);
    s.advance(3900);
    expect(s.engine.play('division-bell')).toBe(false);
    // Other sounds still play over it.
    expect(s.engine.play('stamp-heavy')).toBe(true);
    s.advance(200);
    expect(s.engine.play('division-bell')).toBe(true);
    expect(s.ctx.sources.filter((x) => x.output === s.bell())).toHaveLength(2);
  });

  it('holds the bell slot while it decodes, so a double trigger rings once', async () => {
    const s = setup();
    s.engine.unlock();
    expect(s.engine.play('division-bell')).toBe(true);
    expect(s.engine.play('division-bell')).toBe(false);
    await flush();
    expect(s.ctx.sources).toHaveLength(1);
  });

  it('fetches only the sounds it is asked to prepare', () => {
    const s = setup();
    s.engine.prepare(['click']);
    expect(s.fetchBytes.mock.calls.map(([u]) => u)).toEqual(['c.wav']);
    s.engine.prepare(['whoosh']);
    expect(s.fetchBytes).not.toHaveBeenCalledWith('b.mp3');
  });

  it('stays silent for a sound with no source', async () => {
    const s = setup({ sources: { click: 'c.wav' } });
    await ready(s);
    expect(s.fetchBytes).toHaveBeenCalledTimes(1);
    expect(s.engine.play('stamp')).toBe(true);
    await flush();
    expect(s.ctx.sources).toHaveLength(0);
  });
});
