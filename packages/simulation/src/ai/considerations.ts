import type { AiConsideration, ContentRegistry, Politician } from '@whip/domain';
import { compareStrings } from '../state/access';

/** Base weight of each named consideration before trait multipliers (doc 03 §6). */
export const BASE_WEIGHTS: Record<AiConsideration, number> = {
  careerGain: 1.0,
  ideologicalFit: 0.8,
  relationshipValue: 0.6,
  factionDemand: 0.9,
  riskOfWhipAnger: 1.0,
  whipDuty: 1.1,
  billStake: 0.7,
  publicProfile: 0.4,
};

/** One consideration's verdict on a candidate: value −1..1 with a human-readable reason. */
export interface ConsiderationValue {
  key: AiConsideration;
  value: number;
  reason: string;
}

/** Weight of a consideration for this NPC: base × Π trait multipliers. */
export function weightFor(npc: Politician, key: AiConsideration, content: ContentRegistry): number {
  let w = BASE_WEIGHTS[key];
  for (const t of npc.traits) w *= content.traits[t]?.ai[key] ?? 1;
  return w;
}

export interface ScoredValue extends ConsiderationValue {
  contribution: number;
}

export function scoreConsiderations(
  npc: Politician,
  values: ConsiderationValue[],
  content: ContentRegistry,
): { total: number; scored: ScoredValue[] } {
  let total = 0;
  const scored: ScoredValue[] = [];
  for (const v of values) {
    const contribution = weightFor(npc, v.key, content) * v.value;
    total += contribution;
    scored.push({ ...v, contribution });
  }
  return { total, scored };
}

/** The top-n reasons by absolute contribution, for the intelligence panel. */
export function topConsiderationReasons(scored: ScoredValue[], n = 3): string[] {
  return scored
    .filter((s) => Math.abs(s.contribution) > 0.02)
    .sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution) || compareStrings(a.key, b.key),
    )
    .slice(0, n)
    .map((s) => s.reason);
}
