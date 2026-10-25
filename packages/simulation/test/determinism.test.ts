import { describe, expect, it } from 'vitest';
import {
  advanceSimulation,
  deserializeState,
  hashState,
  serializeState,
  SIMULATION_VERSION,
} from '../src';
import { GOLDEN } from './fixtures/golden';
import { ctx, goldenScript, newGame, play } from './helpers';

describe('determinism', () => {
  it('same seed + same actions ⇒ identical state hash after 6 turns; different seed ⇒ different', () => {
    const a = play(newGame(1234), 6, goldenScript).state;
    const b = play(newGame(1234), 6, goldenScript).state;
    const c = play(newGame(4321), 6, goldenScript).state;
    expect(hashState(a)).toBe(hashState(b));
    expect(hashState(a)).not.toBe(hashState(c));
  });

  it('saving and reloading between turns does not change the outcome', () => {
    let live = newGame(77);
    let reloaded = live;
    for (let t = 0; t < 5; t++) {
      live = advanceSimulation(live, goldenScript(live.meta.turn, live), ctx).state;
      reloaded = advanceSimulation(
        deserializeState(serializeState(reloaded)),
        goldenScript(reloaded.meta.turn, reloaded),
        ctx,
      ).state;
      expect(hashState(reloaded)).toBe(hashState(live));
    }
  });

  it('matches the golden hash fixture (re-record deliberately when SIMULATION_VERSION bumps)', () => {
    // If this fails after an intentional rules or content change: bump SIMULATION_VERSION in
    // src/context.ts and update test/fixtures/golden.ts with the printed hash. A failure without an
    // intentional change means non-determinism or an accidental rules change.
    const s = play(newGame(GOLDEN.seed), GOLDEN.turns, goldenScript).state;
    const actual = hashState(s);
    expect(SIMULATION_VERSION, 'SIMULATION_VERSION changed: re-record the golden hash').toBe(
      GOLDEN.simulationVersion,
    );
    expect(actual, `golden hash mismatch; actual = ${actual}`).toBe(GOLDEN.hash);
  });
});
