import type { RngState } from '@whip/domain';
import { cyrb128 } from './hash';

/**
 * sfc32 (Small Fast Counting, Chris Doty-Humphrey): 128-bit state, passes PractRand to large sizes.
 * Deterministic on every JS engine (32-bit integer arithmetic only).
 */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  /** Seed from a 128-bit string hash, discarding the first draws to mix the state. */
  static fromString(seed: string): Rng {
    const rng = new Rng(cyrb128(seed));
    for (let i = 0; i < 12; i++) rng.nextUint32();
    return rng;
  }

  static fromSeed(seed: number): Rng {
    return Rng.fromString(`whip:${seed >>> 0}`);
  }

  /**
   * Independent named sub-stream: derived from the root state, the turn and a phase key by hashing,
   * so adding draws to one stream never shifts another (ADR-0008 §2).
   */
  static fork(root: RngState, turn: number, key: string): Rng {
    return Rng.fromString(`${root.join(',')}|${turn}|${key}`);
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  nextUint32(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  /** Uniform integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.float() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.float() < p;
  }

  /**
   * Approximately normal with mean 0 and sd 1 (Irwin–Hall sum of 4 uniforms, rescaled).
   * Avoids transcendental Math functions (doc 03 §2.4).
   */
  normalish(): number {
    const s = this.float() + this.float() + this.float() + this.float();
    return (s - 2) * 1.7320508075688772; // sd of the sum is sqrt(4/12)
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.float() * items.length)] as T;
  }

  /** Weighted pick; weights ≤ 0 are never chosen. Throws if no positive weight. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T {
    let total = 0;
    for (const it of items) total += Math.max(0, weight(it));
    if (total <= 0) throw new Error('Rng.weighted with no positive weights');
    let r = this.float() * total;
    for (const it of items) {
      const w = Math.max(0, weight(it));
      if (r < w) return it;
      r -= w;
    }
    // Floating-point tail: return the last positively-weighted item.
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i] as T;
      if (weight(it) > 0) return it;
    }
    throw new Error('unreachable');
  }

  /** Fisher–Yates shuffle into a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.float() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** k distinct items chosen uniformly (order = draw order). */
  sample<T>(items: readonly T[], k: number): T[] {
    return this.shuffle(items).slice(0, Math.max(0, Math.min(k, items.length)));
  }
}

export function rootRngState(seed: number): RngState {
  return Rng.fromSeed(seed).getState();
}
