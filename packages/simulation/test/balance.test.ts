import { describe, expect, it } from 'vitest';
import { env, newGame, play, SECOND_READING } from './helpers';

/**
 * Balance check (07 §6.6): with no player input the government should win the second reading in
 * roughly 60–95% of seeds, and rebels should mostly come from Heartlands or Shire & Suburbs.
 * The normal suite runs 40 seeds; `pnpm --filter @whip/simulation balance` runs 200
 * (BALANCE_SEEDS=200). This is a tolerance band, not an exact assertion.
 */
const SEEDS = Number(env('BALANCE_SEEDS') ?? 40);

describe(`balance over ${SEEDS} seeds`, () => {
  it('government usually (not always) wins the second reading; rebels are mostly Heartlands / Shire & Suburbs', () => {
    let wins = 0;
    let rebels = 0;
    let factionRebels = 0;
    const margins: number[] = [];
    for (let seed = 1; seed <= SEEDS; seed++) {
      const s = play(newGame(seed * 7919), 4).state;
      const r = s.parliament.divisions.byId[SECOND_READING]!.result!;
      if (r.governmentWon) wins++;
      margins.push(r.margin);
      for (const reb of r.rebels) {
        const p = s.politicians.byId[reb.politicianId]!;
        if (p.partyId !== 'party.npp') continue;
        rebels++;
        if (p.factionId === 'faction.heartlands' || p.factionId === 'faction.shire_suburbs')
          factionRebels++;
      }
    }
    const winRate = wins / SEEDS;
    const summary = `wins ${wins}/${SEEDS} (${Math.round(winRate * 100)}%), margins ${Math.min(...margins)}..${Math.max(...margins)}, faction share of rebels ${Math.round((factionRebels / Math.max(1, rebels)) * 100)}%`;
    console.log(`[balance] ${summary}`);
    expect(winRate, summary).toBeGreaterThanOrEqual(0.6);
    expect(winRate, summary).toBeLessThanOrEqual(0.95);
    expect(factionRebels / rebels, summary).toBeGreaterThan(0.75);
  }, 120_000);
});
