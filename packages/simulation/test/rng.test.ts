import { describe, expect, it } from 'vitest';
import { cyrb53, hashUnit, Rng } from '../src/rng';

describe('sfc32 RNG', () => {
  it('is deterministic for a seed and differs across seeds', () => {
    const a = Rng.fromSeed(42);
    const b = Rng.fromSeed(42);
    const c = Rng.fromSeed(43);
    const seqA = Array.from({ length: 20 }, () => a.nextUint32());
    const seqB = Array.from({ length: 20 }, () => b.nextUint32());
    const seqC = Array.from({ length: 20 }, () => c.nextUint32());
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it('state is serialisable: a restored generator continues the same stream', () => {
    const a = Rng.fromSeed(7);
    for (let i = 0; i < 5; i++) a.nextUint32();
    const saved = a.getState();
    const restored = new Rng(JSON.parse(JSON.stringify(saved)) as typeof saved);
    expect(Array.from({ length: 10 }, () => restored.float())).toEqual(
      Array.from({ length: 10 }, () => a.float()),
    );
  });

  it('forks are deterministic and independent: extra draws in one stream do not shift another', () => {
    const root = Rng.fromSeed(1).getState();
    const parliamentFirst = Rng.fork(root, 4, 'parliament');
    const expected = Array.from({ length: 10 }, () => parliamentFirst.nextUint32());

    // Draw heavily from another phase's stream first; parliament's stream must be unaffected.
    const ai = Rng.fork(root, 4, 'ai_planning');
    for (let i = 0; i < 1000; i++) ai.nextUint32();
    const parliamentAgain = Rng.fork(root, 4, 'parliament');
    expect(Array.from({ length: 10 }, () => parliamentAgain.nextUint32())).toEqual(expected);

    // Different turn or key ⇒ different stream.
    expect(Rng.fork(root, 5, 'parliament').nextUint32()).not.toBe(expected[0]);
    expect(Rng.fork(root, 4, 'careers').nextUint32()).not.toBe(expected[0]);
  });

  it('helpers stay within their ranges', () => {
    const r = Rng.fromSeed(99);
    for (let i = 0; i < 2000; i++) {
      const n = r.int(-2, 3);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(3);
      const f = r.range(0.5, 0.6);
      expect(f).toBeGreaterThanOrEqual(0.5);
      expect(f).toBeLessThan(0.6);
    }
    const items = ['a', 'b', 'c', 'd'];
    expect(r.shuffle(items).sort()).toEqual(items);
    expect(r.sample(items, 2)).toHaveLength(2);
    expect(r.weighted(items, (x) => (x === 'c' ? 1 : 0))).toBe('c');
    expect(() => r.weighted(items, () => 0)).toThrow();
  });

  it('weighted picks follow the weights roughly', () => {
    const r = Rng.fromSeed(5);
    let heavy = 0;
    for (let i = 0; i < 4000; i++)
      if (r.weighted(['light', 'heavy'], (x) => (x === 'heavy' ? 3 : 1)) === 'heavy') heavy++;
    expect(heavy / 4000).toBeGreaterThan(0.7);
    expect(heavy / 4000).toBeLessThan(0.8);
  });

  it('string hashes are stable', () => {
    expect(cyrb53('whip')).toBe(cyrb53('whip'));
    expect(hashUnit('a', 1)).toBe(hashUnit('a', 1));
    expect(hashUnit('a', 1)).not.toBe(hashUnit('a', 2));
    expect(hashUnit('x')).toBeGreaterThanOrEqual(0);
    expect(hashUnit('x')).toBeLessThan(1);
  });
});
