import type { EffectCondition, GameState, PlannedActionId, PoliticianId } from '@whip/domain';
import { computeFidelity, plansThisTurn } from '../ai/fidelity';
import { focusDivision, forecastDivision } from '../ai/forecast';
import { buildMindCaches, UtilityMind, type PoliticianMind } from '../ai/utility-mind';
import { diaryCapacity } from '../actions/plan';
import {
  findDivision,
  findPolitician,
  isSitting,
  sortedKeys,
  compareStrings,
} from '../state/access';
import type { TurnContext } from '../turn/context';

/** Phase 0 — begin turn: fix this week's diary capacity, recompute fidelity tiers. */
export function beginTurnPhase(draft: GameState, tc: TurnContext): void {
  tc.playerSlotCapacity = diaryCapacity(draft);
  tc.stabilityStart = draft.government.stability;
  const tiers = computeFidelity(draft, tc.content);
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    const tier = tiers.get(id);
    if (p && tier) p.fidelity = tier;
  }
}

function conditionHolds(draft: GameState, c: EffectCondition): boolean {
  switch (c.kind) {
    case 'politician_sitting': {
      const p = findPolitician(draft, c.politicianId);
      return p !== undefined && isSitting(p);
    }
    case 'division_held':
      return findDivision(draft, c.divisionId)?.status === 'held';
  }
}

/**
 * Phase 1 — scheduled effects due this turn, in queue order (dueTurn, id). Each is removed from
 * the queue in the same step it is applied (or dropped because a condition no longer holds), so it
 * can never apply twice.
 */
export function scheduledEffectsPhase(draft: GameState, tc: TurnContext): void {
  draft.scheduled.sort((a, b) => a.dueTurn - b.dueTurn || compareStrings(a.id, b.id));
  const due = draft.scheduled.filter((s) => s.dueTurn <= tc.turn);
  draft.scheduled = draft.scheduled.filter((s) => s.dueTurn > tc.turn);
  for (const s of due) {
    if (s.conditions.every((c) => conditionHolds(draft, c))) tc.emit(draft, s.effect);
  }
}

const defaultMind: PoliticianMind = new UtilityMind();

/** Outgoing stored relationships per politician, sorted (bounded contact lists for the AI). */
function buildContacts(draft: GameState): Map<PoliticianId, PoliticianId[]> {
  const out = new Map<PoliticianId, PoliticianId[]>();
  for (const key of sortedKeys(draft.relationships.edges)) {
    const e = draft.relationships.edges[key];
    if (!e) continue;
    const list = out.get(e.from) ?? [];
    if (list.length < 8) list.push(e.to);
    out.set(e.from, list);
  }
  return out;
}

/**
 * Phase 2 — AI planning. NPCs plan simultaneously from the start-of-week state (nobody sees anyone
 * else's moves this week). High-fidelity NPCs plan every week; medium-fidelity ones every 4th week.
 */
export function aiPlanningPhase(
  draft: GameState,
  tc: TurnContext,
  mind: PoliticianMind = defaultMind,
): void {
  const div = focusDivision(draft);
  const forecast = div ? forecastDivision(draft, div, tc.content) : null;
  const contacts = buildContacts(draft);
  const caches = buildMindCaches(draft);
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    if (!p || p.isPlayer || p.ai === null || !isSitting(p)) continue;
    if (!plansThisTurn(id, p.fidelity, tc.turn)) continue;
    const plans = mind.plan(draft, id, {
      ctx: tc.ctx,
      rng: tc.rng(`ai:${id}`),
      forecast,
      contacts,
      caches,
    });
    p.ai.lastPlannedTurn = tc.turn;
    plans.forEach((plan, k) => {
      tc.npcPlans.push({
        // Actor-local ids: one NPC planning more or fewer actions never renames another's (the
        // action phase keys RNG streams by this id).
        id: `ai_${tc.turn}_${id}_${k + 1}` as PlannedActionId,
        actorId: id,
        turn: tc.turn,
        label: plan.label,
        slots: plan.slots,
        capitalCost: plan.capitalCost,
        source: 'ai',
        reasons: plan.reasons,
        ...plan.action,
      });
    });
  }
}
