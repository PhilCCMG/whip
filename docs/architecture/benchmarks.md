# Simulation benchmarks

Measured 2026-10-24 with `pnpm bench` (`packages/simulation/src/engine.bench.ts`, Vitest 4.1 bench),
Node 24.15 on Windows 11, developer laptop. Re-run after the review fixes (state compaction,
settled-edge pruning, per-action RNG streams, strict save schema). Scenario "First Weeks", seed 42,
650 MPs, about 3.8k stored relationship edges at turn 3. Treat these as relative numbers: Workers
CPU is a different machine, but it is also V8.

Target (doc 03 §11): **< 50 ms CPU per weekly advance**, excluding (de)serialisation.

| Operation | Mean | p99 | Notes |
|---|---|---|---|
| `createCampaignState` | 24.7 ms | 34.0 ms | World generation, relationships, opening chronicle |
| `advanceSimulation`, ordinary week (turn 1) | 18.7 ms | 29.7 ms | Includes the one deep copy of the state |
| `advanceSimulation`, division week (turn 4) | 28.1 ms | 36.8 ms | Whip operations plus the 649-vote division and its consequences |
| `serializeState` (canonical JSON, sorted keys) | 25.5 ms | 35.9 ms | |
| `deserializeState` (JSON.parse + migrate + strict Zod) | 26.7 ms | 34.4 ms | |
| serialise + gzip (level 6) | 56.6 ms | 66.9 ms | Gzip is outside the engine; the DO uses `CompressionStream` |

Per-phase mean (ms; 20 advances, half ordinary weeks and half division weeks):

| Phase | ms |
|---|---|
| 0 begin turn (fidelity tiers) | 1.07 |
| 1 scheduled effects | 0.00 |
| 2 AI planning | 9.26 |
| 3 action resolution | 2.03 |
| 4 relationships (decay/drift/pruning) | 3.35 |
| 5 party & factions (whip operations) | 1.96 |
| 6 parliament | 2.42 |
| 7 government | 0.01 |
| 8 public opinion | 0.01 |
| 9 indicators (stub) | 0.00 |
| 10 event generation | 0.09 |
| 11 careers | 0.07 |
| 12 chronicle (incl. compaction) | 0.99 |

The rest of each advance is the input deep copy (`cloneJson`, about 5 ms; `structuredClone` took
about 21 ms, so it was replaced) and garbage collection.

**State size** (raw canonical JSON / gzip level 6 / stored edges), same seed, no player input:

| After | Raw | Gzip | Edges |
|---|---|---|---|
| 3 turns | 2,045 KiB | 189 KiB | 3,774 |
| 52 turns | 2,234 KiB | 220 KiB | 5,454 |
| 104 turns | 2,296 KiB | 227 KiB | 6,079 |

Roughly 38% is relationships, 37% politicians and 22% constituencies; the ring-buffered history is
under 50 KiB. Growth is close to flat because the full record lives in the history table:

- End-of-turn compaction (`state/compaction.ts`) strips per-MP working data (pressure,
  declarations, whip intel/attention) from concluded divisions, keeping all votes plus the
  player, high-fidelity MPs and rebels; archives concluded divisions and then bills older than 26
  turns (the 5 most recent held divisions always stay complete); prunes knowledge of concluded
  divisions and expired cooldowns.
- Rebellion records are kept for 52 turns (lifetime total in `rebellionCount`); routine career
  entries (endorsements) are capped at 12 per politician, milestones are kept.
- The relationships phase drops settled edges (within ±1 of the derived default, with no memories,
  obligation or rivalry) and no longer sorts the edge table (per-edge updates are independent).

Remaining growth is genuine new relationships (about 12 edges a week). `test/long-run.test.ts` runs
104 turns in the normal suite (invariants every turn; size and edges < 2x the turn-12 values;
late-turn time bounded by early-turn time); `LONG_RUN_TURNS=520` runs a decade.

## Optimisations already made
- Plain-JSON deep copy instead of `structuredClone` (4x faster).
- Canonical stringify using string concatenation and unescaped safe keys (52 ms → 24–30 ms).
- AI candidate pools (patrons, hedging targets) built once per turn instead of once per NPC.
- Settled-edge pruning and state compaction (above).

## Headroom ideas (not needed yet)
- Cache `defaultRelationship` per turn for the relationships phase.
- Keep a per-turn incoming-edge index (rebellion recruitment and influence currently scan the edge table).

Re-run with `pnpm bench`. The 200-seed balance check is `pnpm --filter @whip/simulation balance`
(last run, after the review fixes: government won the second reading in 154/200 = 77% of seeds,
previously 155/200 = 78%; 93% of government rebels were Heartlands or Shire & Suburbs, unchanged).
