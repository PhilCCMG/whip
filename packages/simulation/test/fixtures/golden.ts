/**
 * Golden determinism fixture: hashState after GOLDEN.turns turns of the determinism test script
 * (test/determinism.test.ts `goldenScript`), seed GOLDEN.seed, with @whip/content as bundled.
 * Re-record deliberately whenever SIMULATION_VERSION is bumped or content changes outcomes.
 *
 * Re-recorded 2026-10-24 (SIMULATION_VERSION stays 1, pre-release) for the review fixes: rebellion
 * recruitment direction, per-action/per-definition RNG streams, code-unit string ordering, 8-digit
 * id counters, settled-edge pruning, state compaction and the briefing turn. Previous hash:
 * 03e627fbe31aa714fcc9f81458a0.
 */
export const GOLDEN = {
  simulationVersion: 1,
  seed: 20290903,
  turns: 6,
  hash: '19e4f5b1ac86230c1992ad5b3199',
} as const;
