import { gzipSync } from 'zlib';
import { beforeAll, bench, describe } from 'vitest';
import { loadContentRegistry, scenarios } from '@whip/content';
import type { GameState } from '@whip/domain';
import {
  advanceSimulation,
  createCampaignState,
  deserializeState,
  serializeState,
  SIMULATION_VERSION,
  PHASE_KEYS,
  type SimulationContext,
} from './index';

// Results are recorded in docs/architecture/benchmarks.md. Target: < 50 ms per advance, excluding
// (de)serialisation, for 650 MPs and ~5k relationship edges.
const now = (): number =>
  (globalThis as unknown as { performance: { now(): number } }).performance.now();
const content = loadContentRegistry();
const ctx: SimulationContext = { content, simulationVersion: SIMULATION_VERSION };
const timedCtx: SimulationContext = { ...ctx, clock: now };
const player = {
  firstName: 'Alex',
  lastName: 'Morgan',
  gender: 'nonbinary',
  strength: 'negotiation',
  ideologyPreset: 'independent',
} as const;
const create = (seed: number) =>
  createCampaignState({ scenario: scenarios.firstWeeks, seed, player }, ctx);

let fresh: GameState;
let divisionWeek: GameState;
let json: string;

beforeAll(() => {
  fresh = create(42);
  divisionWeek = fresh;
  for (let i = 0; i < 3; i++) divisionWeek = advanceSimulation(divisionWeek, [], ctx).state;
  json = serializeState(divisionWeek);
  // One-off report: per-phase timings (mean of 10 advances from week 1 and the division week) and size.
  const sums: Record<string, number> = {};
  for (const start of [fresh, divisionWeek]) {
    for (let i = 0; i < 10; i++) {
      const r = advanceSimulation(start, [], timedCtx);
      for (const [k, v] of Object.entries(r.metrics.phaseTimingsMs ?? {}))
        sums[k] = (sums[k] ?? 0) + v / 20;
    }
  }
  const raw = json.length;
  const gz = gzipSync(json, { level: 6 }).length;
  const edges = Object.keys(divisionWeek.relationships.edges).length;
  // State size over a long campaign (doc 01 "historical continuity": compaction keeps it flat).
  let long = divisionWeek;
  const sizes: string[] = [];
  for (let t = 4; t <= 104; t++) {
    long = advanceSimulation(long, [], ctx).state;
    if (t === 52 || t === 104) {
      const j = serializeState(long);
      const kib = (n: number) => (n / 1024).toFixed(0);
      sizes.push(
        `state after ${t} turns: ${kib(j.length)} KiB raw, ${kib(gzipSync(j, { level: 6 }).length)} KiB gzip, ${Object.keys(long.relationships.edges).length} edges`,
      );
    }
  }
  console.log(sizes.join('\n'));
  const lines = PHASE_KEYS.map((k) => `  ${k.padEnd(18)} ${(sums[k] ?? 0).toFixed(2)} ms`);
  console.log(
    `per-phase mean (ms):\n${lines.join('\n')}\nstate after 3 turns: ${(raw / 1024).toFixed(0)} KiB raw, ${(gz / 1024).toFixed(0)} KiB gzip, ${edges} edges`,
  );
});

describe('engine', () => {
  bench('createCampaignState', () => {
    create(7);
  });
  bench('advanceSimulation (week 1)', () => {
    advanceSimulation(fresh, [], ctx);
  });
  bench('advanceSimulation (division week)', () => {
    advanceSimulation(divisionWeek, [], ctx);
  });
  bench('serializeState', () => {
    serializeState(divisionWeek);
  });
  bench('deserializeState (parse + Zod)', () => {
    deserializeState(json);
  });
  bench('serialize + gzip', () => {
    gzipSync(serializeState(divisionWeek), { level: 6 });
  });
});
