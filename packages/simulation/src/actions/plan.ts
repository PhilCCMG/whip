import type {
  ActionRequest,
  GameState,
  IneligibilityReason,
  PlannedAction,
  PlannedActionId,
  Politician,
  ValidatedAction,
} from '@whip/domain';
import { assertVersion, type SimulationContext } from '../context';
import { getPolitician } from '../state/access';
import { formatId } from '../state/ids';
import {
  actionDedupKey,
  capitalCostOf,
  describeAction,
  eligibilityOf,
  getDefinition,
  parseAction,
} from './catalogue';
import { reason } from './common';

export type PlanActionResult =
  | { ok: true; state: GameState; planned: PlannedAction }
  | { ok: false; reasons: IneligibilityReason[] };

/**
 * Player diary capacity for the current week: base slots plus any scheduled `diary.adjust_slots`
 * effects due this week (e.g. "meet the organisers" costs a slot next week).
 */
export function diaryCapacity(state: GameState): number {
  let slots = state.player.diarySlots;
  for (const s of state.scheduled) {
    if (
      s.dueTurn === state.meta.turn &&
      s.effect.kind === 'diary.adjust_slots' &&
      s.effect.politicianId === state.player.politicianId
    ) {
      slots += s.effect.delta;
    }
  }
  return Math.max(0, slots);
}

export function slotsUsed(planned: readonly PlannedAction[]): number {
  return planned.reduce((n, a) => n + a.slots, 0);
}

export interface Budget {
  slotsAvailable: number;
  capitalAvailable: number;
  usedKeys: ReadonlySet<string>;
}

export type ValidationResult =
  | { ok: true; action: ValidatedAction; label: string; slots: number; capitalCost: number }
  | { ok: false; reasons: IneligibilityReason[] };

/**
 * Full validation of a request for an actor: param schema, position & param eligibility, diary
 * slots, political capital and duplicates. Used by planAction, advanceSimulation and the AI.
 */
export function validateRequest(
  state: GameState,
  actor: Politician,
  request: ActionRequest,
  budget: Budget,
  ctx: SimulationContext,
): ValidationResult {
  const parsed = parseAction(request.kind, request.params);
  if (!parsed.ok) return parsed;
  const action = parsed.action;
  const reasons = eligibilityOf(state, actor, action, ctx);
  const def = getDefinition(action.kind);
  const slots = def.slots;
  const capitalCost = capitalCostOf(state, actor, action, ctx);
  if (slots > budget.slotsAvailable) {
    reasons.push(
      reason(
        'insufficient_slots',
        `Needs ${slots} diary slot${slots === 1 ? '' : 's'}; ${budget.slotsAvailable} left this week.`,
      ),
    );
  }
  if (capitalCost > budget.capitalAvailable) {
    reasons.push(
      reason(
        'insufficient_capital',
        `Needs ${capitalCost} political capital; you have ${budget.capitalAvailable}.`,
      ),
    );
  }
  if (budget.usedKeys.has(actionDedupKey(action))) {
    reasons.push(reason('duplicate', 'You already have that in your diary this week.'));
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, action, label: describeAction(state, action, ctx), slots, capitalCost };
}

export function playerBudget(state: GameState): Budget {
  const planned = state.player.plannedActions;
  return {
    slotsAvailable: diaryCapacity(state) - slotsUsed(planned),
    capitalAvailable: getPolitician(state, state.player.politicianId).politicalCapital,
    usedKeys: new Set(planned.map((p) => actionDedupKey(p))),
  };
}

/**
 * Validate and queue a diary action for the player (07 §5). Capital is reserved immediately and
 * refunded on cancel. Returns a new state; the input is not mutated.
 */
export function planAction(
  state: GameState,
  request: ActionRequest,
  ctx: SimulationContext,
): PlanActionResult {
  assertVersion(ctx);
  const actor = getPolitician(state, state.player.politicianId);
  const v = validateRequest(state, actor, request, playerBudget(state), ctx);
  if (!v.ok) return { ok: false, reasons: v.reasons };
  const n = (state.meta.idCounters['act'] ?? 0) + 1;
  const planned = {
    id: formatId<PlannedActionId>('act', n),
    actorId: actor.id,
    turn: state.meta.turn,
    label: v.label,
    slots: v.slots,
    capitalCost: v.capitalCost,
    source: 'player',
    reasons: [],
    ...v.action,
  } as PlannedAction;
  const next: GameState = {
    ...state,
    meta: { ...state.meta, idCounters: { ...state.meta.idCounters, act: n } },
    player: { ...state.player, plannedActions: [...state.player.plannedActions, planned] },
    politicians: {
      ...state.politicians,
      byId: {
        ...state.politicians.byId,
        [actor.id]: { ...actor, politicalCapital: actor.politicalCapital - v.capitalCost },
      },
    },
  };
  return { ok: true, state: next, planned };
}

/** Remove a planned action and refund its reserved capital. Null if no such planned action. */
export function cancelPlannedAction(state: GameState, plannedActionId: string): GameState | null {
  const planned = state.player.plannedActions.find((p) => p.id === plannedActionId);
  if (!planned) return null;
  const actor = getPolitician(state, state.player.politicianId);
  return {
    ...state,
    player: {
      ...state.player,
      plannedActions: state.player.plannedActions.filter((p) => p.id !== plannedActionId),
    },
    politicians: {
      ...state.politicians,
      byId: {
        ...state.politicians.byId,
        [actor.id]: { ...actor, politicalCapital: actor.politicalCapital + planned.capitalCost },
      },
    },
  };
}
