import { REBELLION_WINDOW_TURNS } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { advanceSimulation, serializeState } from '../src';
import { MAX_ROUTINE_CAREER_ENTRIES } from '../src/effects/apply';
import { env, newGame, strictCtx } from './helpers';

/**
 * Long-run growth check (doc 01 "historical continuity"): the snapshot must stay compact because
 * the full record lives in the history table. Runs 104 turns (two years) with invariants checked
 * every turn; LONG_RUN_TURNS=520 runs a decade. Bounds are relative to the turn-12 state, measured
 * at about 2.4 MB / 4.7k edges at turn 12 and 2.3 MB / 6.1k edges at turn 104 (seed 42).
 */
const TURNS = Number(env('LONG_RUN_TURNS') ?? 104);
const now = (): number =>
  (globalThis as unknown as { performance: { now(): number } }).performance.now();

describe(`long run (${TURNS} turns)`, () => {
  it('stays within size, edge-count and per-turn time bounds, with invariants every turn', () => {
    let s = newGame(42);
    const times: number[] = [];
    let at12 = { size: 0, edges: 0 };
    for (let t = 1; t <= TURNS; t++) {
      const t0 = now();
      s = advanceSimulation(s, [], strictCtx).state; // throws InvariantError on any violation
      times.push(now() - t0);
      if (t === 12)
        at12 = {
          size: serializeState(s).length,
          edges: Object.keys(s.relationships.edges).length,
        };
    }
    const size = serializeState(s).length;
    const edges = Object.keys(s.relationships.edges).length;
    const summary = `size ${Math.round(size / 1024)} KiB (t12 ${Math.round(at12.size / 1024)}), edges ${edges} (t12 ${at12.edges})`;
    expect(size, summary).toBeLessThan(2 * at12.size);
    expect(edges, summary).toBeLessThan(2 * at12.edges);

    // Per-turn cost does not grow with campaign length (generous: CI machines are noisy).
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const early = mean(times.slice(1, 13));
    const late = mean(times.slice(-12));
    expect(late, `early ${early.toFixed(1)} ms, late ${late.toFixed(1)} ms`).toBeLessThan(
      2 * early + 15,
    );

    // Windowed records: rebellions age out, the lifetime count does not; careers are capped.
    let lifetime = 0;
    for (const id of s.politicians.ids) {
      const p = s.politicians.byId[id]!;
      lifetime += p.rebellionCount;
      expect(p.rebellionCount).toBeGreaterThanOrEqual(p.rebellions.length);
      for (const r of p.rebellions)
        expect(r.turn).toBeGreaterThan(s.meta.turn - 1 - REBELLION_WINDOW_TURNS);
      expect(p.career.filter((c) => c.kind === 'endorsed').length).toBeLessThanOrEqual(
        MAX_ROUTINE_CAREER_ENTRIES,
      );
    }
    expect(lifetime).toBeGreaterThan(0);
    // Stale bookkeeping is pruned.
    for (const until of Object.values(s.events.cooldowns)) expect(until).toBeGreaterThan(TURNS);
    // The recent divisions stay complete for the parliament view.
    for (const id of s.parliament.divisions.ids) {
      const r = s.parliament.divisions.byId[id]!.result;
      if (r) expect(Object.keys(r.votes).length).toBe(r.eligible);
    }
  }, 120_000);
});
