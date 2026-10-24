import type { Effect, GameState, PlannedAction } from '@whip/domain';
import { intelText } from '../ai/intel';
import { actionTarget, eligibilityOf, getDefinition, resolveAction } from '../actions/catalogue';
import { getRelationship } from '../relationships/relationships';
import {
  displayName,
  findPolitician,
  getPolitician,
  isSitting,
  compareStrings,
} from '../state/access';
import type { TurnContext } from '../turn/context';

/** How many AI memos each NPC keeps. */
const MAX_AI_MEMOS = 6;

/**
 * Phase 3 — resolve player and NPC actions in deterministic order (priority, actorId, submission
 * index) through the same definitions. Eligibility is re-checked against the current draft: a
 * planned action can fail if the world changed (e.g. the target lost office).
 */
export function actionResolutionPhase(draft: GameState, tc: TurnContext): void {
  const queue: { a: PlannedAction; index: number }[] = [];
  let index = 0;
  for (const a of draft.player.plannedActions) queue.push({ a, index: index++ });
  for (const a of tc.extraPlayerActions) queue.push({ a, index: index++ });
  for (const a of tc.npcPlans) queue.push({ a, index: index++ });
  queue.sort(
    (x, y) =>
      getDefinition(x.a.kind).priority - getDefinition(y.a.kind).priority ||
      compareStrings(x.a.actorId, y.a.actorId) ||
      x.index - y.index,
  );
  for (const { a } of queue) resolveOne(draft, tc, a);
}

/**
 * RNG streams are keyed by the planned action's id (unique within a turn and independent of the
 * queue position), so adding or removing one action never reshuffles another's rolls (ADR-0008 §2).
 */
function resolveOne(draft: GameState, tc: TurnContext, a: PlannedAction): void {
  const actor = findPolitician(draft, a.actorId);
  if (!actor || !isSitting(actor)) return;
  const isPlayer = actor.isPlayer;
  const reasons = eligibilityOf(draft, actor, a, tc.ctx);
  if (!isPlayer && actor.politicalCapital < a.capitalCost) {
    reasons.push({ code: 'insufficient_capital', message: 'Not enough political capital.' });
  }
  if (reasons.length > 0) {
    if (isPlayer) {
      const refund = tc.emit(draft, {
        kind: 'capital.adjust',
        politicianId: actor.id,
        delta: a.capitalCost,
        reason: 'refund for an action that fell through',
      });
      tc.actionOutcomes.push({
        plannedActionId: a.id,
        actorId: actor.id,
        kind: a.kind,
        label: a.label,
        status: 'rejected',
        summary: reasons.map((r) => r.message).join(' '),
        effects: refund.lines,
      });
      tc.record(draft, {
        type: 'action_outcome',
        payload: { kind: a.kind, status: 'rejected', plannedActionId: a.id, effects: [] },
        importance: 1,
        template: 'action.rejected',
        vars: { actor: displayName(actor), detail: a.label.toLowerCase() },
        actorIds: [actor.id],
        subjectIds: [],
      });
    }
    return;
  }

  const res = resolveAction(draft, actor, a, {
    ctx: tc.ctx,
    tc,
    rng: tc.rng(`action:${a.id}`),
  });
  const effects: Effect[] = [];
  if (!isPlayer && a.capitalCost > 0) {
    effects.push({
      kind: 'capital.adjust',
      politicianId: actor.id,
      delta: -a.capitalCost,
      reason: a.label,
    });
  }
  effects.push(...res.effects);
  const { lines, effectIds } = tc.emitAll(draft, effects);
  for (const s of res.scheduled) {
    tc.schedule(draft, s.effect, s.dueTurn, { kind: 'action', id: a.id }, s.conditions);
  }
  const target = actionTarget(a);
  const involvesPlayer = target === draft.player.politicianId;
  if (
    res.history &&
    (isPlayer || actor.castKey !== null || involvesPlayer || res.history.importance >= 3)
  ) {
    tc.record(draft, {
      type: 'action_outcome',
      payload: {
        kind: a.kind,
        status: res.status,
        plannedActionId: isPlayer ? a.id : null,
        effects: lines,
      },
      importance: res.history.importance,
      template: res.history.template,
      vars: { actor: displayName(actor), ...res.history.vars },
      actorIds: [actor.id],
      subjectIds: res.history.subjectIds,
      effectIds,
    });
  }
  if (isPlayer) {
    tc.actionOutcomes.push({
      plannedActionId: a.id,
      actorId: actor.id,
      kind: a.kind,
      label: a.label,
      status: res.status,
      summary: res.summary,
      effects: lines,
    });
    return;
  }

  // NPC bookkeeping: AI memo + what the player gets to hear about it.
  if (actor.ai) {
    actor.ai.recentActions.push({
      turn: tc.turn,
      kind: a.kind,
      targetId: target,
      reasons: a.reasons,
    });
    if (actor.ai.recentActions.length > MAX_AI_MEMOS)
      actor.ai.recentActions.splice(0, actor.ai.recentActions.length - MAX_AI_MEMOS);
  }
  playerLearns(draft, tc, a);
}

/**
 * Fog of war: the player hears about an NPC move if it targets them, if it is a public stance by a
 * prominent figure or lobbies them, through gossip from someone who trusts them (trust ≥ 25), or by
 * their own intelligence network (intrigue). Public statements also reveal voting intentions.
 */
function playerLearns(draft: GameState, tc: TurnContext, a: PlannedAction): void {
  const me = getPolitician(draft, draft.player.politicianId);
  const actor = getPolitician(draft, a.actorId);
  const target = actionTarget(a);
  const effects: Effect[] = [];
  let learns = false;
  if (target === me.id) learns = true;
  if (a.kind === 'support_legislation' || a.kind === 'oppose_legislation') {
    const div = draft.parliament.divisions.ids
      .map((id) => draft.parliament.divisions.byId[id])
      .find(
        (d) =>
          d !== undefined &&
          d.status === 'scheduled' &&
          d.billId === a.params.billId &&
          d.declarations[actor.id]?.source === 'statement',
      );
    const value = a.kind === 'support_legislation' ? 'aye' : 'no';
    const alreadyKnown =
      div !== undefined && draft.player.knowledge.intentions[actor.id]?.[div.id]?.value === value;
    if (div && !alreadyKnown) {
      effects.push({
        kind: 'knowledge.intention',
        politicianId: actor.id,
        divisionId: div.id,
        value,
        source: 'public statement',
      });
      // A prominent figure's first public stance on a division makes the news.
      if (actor.castKey !== null || actor.offices.length > 0) learns = true;
    }
    if (a.params.lobbyTargetIds.includes(me.id)) learns = true;
  }
  const rng = tc.rng(`intel:${a.id}`);
  if (!learns) {
    const gossip =
      getRelationship(draft, actor.id, me.id).trust >= 25 ||
      (target !== null && getRelationship(draft, target, me.id).trust >= 25);
    const notable = a.kind !== 'meet_politician' || actor.castKey !== null;
    if (gossip && notable && rng.chance(0.6)) learns = true;
    else if (
      actor.castKey !== null &&
      a.kind !== 'support_legislation' &&
      a.kind !== 'oppose_legislation' &&
      rng.chance(me.skills.intrigue / 50)
    )
      learns = true;
  }
  if (learns && a.kind !== 'respond_to_event') {
    effects.push({ kind: 'knowledge.intel', text: intelText(draft, a), politicianId: actor.id });
  }
  if (effects.length > 0) tc.emitAll(draft, effects);
}
