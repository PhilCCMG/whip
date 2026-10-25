import type { ActionRequest, GameState, PlannedActionId } from '@whip/domain';
import { actionDedupKey } from '../actions/catalogue';
import { slotsUsed, validateRequest } from '../actions/plan';
import { careersPhase } from '../careers/careers';
import { chroniclePhase } from '../chronicle/chronicle';
import {
  assertVersion,
  type PhaseKey,
  type SimulationContext,
  type SimulationResult,
} from '../context';
import { eventGenerationPhase } from '../events/generate';
import { checkInvariants, InvariantError } from '../invariants/check';
import { parliamentPhase } from '../parliament/division';
import { actionResolutionPhase } from '../phases/actions';
import { aiPlanningPhase, beginTurnPhase, scheduledEffectsPhase } from '../phases/early';
import { governmentPhase } from '../phases/government';
import {
  indicatorsPhase,
  partyPhase,
  publicOpinionPhase,
  relationshipsPhase,
} from '../phases/maintenance';
import { divisionReport } from '../selectors/divisions';
import { getPolitician } from '../state/access';
import { cloneJson } from '../state/clone';
import { TurnContext } from './context';

type Phase = (draft: GameState, tc: TurnContext) => void;

/** The fixed phase order (doc 03 §4). Reordering changes outcomes: bump SIMULATION_VERSION. */
const PIPELINE: [PhaseKey, Phase][] = [
  ['begin_turn', beginTurnPhase],
  ['scheduled_effects', scheduledEffectsPhase],
  ['ai_planning', (d, tc) => aiPlanningPhase(d, tc)],
  ['action_resolution', actionResolutionPhase],
  ['relationships', relationshipsPhase],
  ['party_factions', partyPhase],
  ['parliament', parliamentPhase],
  ['government', governmentPhase],
  ['public_opinion', publicOpinionPhase],
  ['indicators', indicatorsPhase],
  ['event_generation', eventGenerationPhase],
  ['careers', careersPhase],
  ['chronicle', (d, tc) => void chroniclePhase(d, tc)],
];

/**
 * Validate actions submitted with the advance call as if they had been planned, against the
 * remaining diary and capital. Accepted ones reserve capital now; rejected ones become outcomes.
 */
function admitExtraActions(draft: GameState, tc: TurnContext, actions: ActionRequest[]): void {
  const player = getPolitician(draft, draft.player.politicianId);
  const planned = draft.player.plannedActions;
  const usedKeys = new Set(planned.map((p) => actionDedupKey(p)));
  let slots = tc.playerSlotCapacity - slotsUsed(planned);
  actions.forEach((req, i) => {
    const v = validateRequest(
      draft,
      player,
      req,
      { slotsAvailable: slots, capitalAvailable: player.politicalCapital, usedKeys },
      tc.ctx,
    );
    if (!v.ok) {
      tc.actionOutcomes.push({
        plannedActionId: null,
        actorId: player.id,
        kind: typeof req.kind === 'string' ? req.kind : 'meet_politician',
        label: String(req.kind),
        status: 'rejected',
        summary: v.reasons.map((r) => r.message).join(' '),
        effects: [],
      });
      return;
    }
    player.politicalCapital -= v.capitalCost;
    slots -= v.slots;
    usedKeys.add(actionDedupKey(v.action));
    tc.extraPlayerActions.push({
      id: `sub_${tc.turn}_${i + 1}` as PlannedActionId,
      actorId: player.id,
      turn: tc.turn,
      label: v.label,
      slots: v.slots,
      capitalCost: v.capitalCost,
      source: 'player',
      reasons: [],
      ...v.action,
    });
  });
}

/**
 * Resolve one week (doc 03 §4, 07 §5). Pure from the caller's view: the input is structured-cloned
 * once and never mutated. Resolves `state.player.plannedActions` plus `actions`.
 */
export function advanceSimulation(
  state: GameState,
  actions: ActionRequest[],
  ctx: SimulationContext,
): SimulationResult {
  assertVersion(ctx);
  const draft = cloneJson(state);
  const tc = new TurnContext(draft, ctx);
  const clock = ctx.clock;
  const timings: Partial<Record<PhaseKey, number>> = {};
  const player = getPolitician(draft, draft.player.politicianId);
  tc.playerCapitalReserved = draft.player.plannedActions.reduce((s, a) => s + a.capitalCost, 0);
  tc.playerCapitalStart = player.politicalCapital + tc.playerCapitalReserved;

  for (const [key, phase] of PIPELINE) {
    tc.phase = key;
    const t0 = clock ? clock() : 0;
    phase(draft, tc);
    // Submitted actions are admitted after the diary capacity is fixed, before anything resolves.
    if (key === 'begin_turn') admitExtraActions(draft, tc, actions);
    if (clock) timings[key] = clock() - t0;
  }
  const headlines = draft.briefing.headlines;
  const newspaper = draft.briefing.newspaper;
  if (!newspaper) throw new Error('The chronicle phase did not produce a newspaper');

  if (ctx.options?.checkInvariants) {
    const violations = checkInvariants(draft, ctx);
    if (violations.length > 0) throw new InvariantError(violations);
  }
  const me = getPolitician(draft, draft.player.politicianId);
  return {
    state: draft,
    resolvedTurn: tc.turn,
    resolvedDate: tc.date,
    history: tc.history,
    notifications: tc.notifications,
    actionOutcomes: tc.actionOutcomes,
    events: tc.raisedEvents,
    headlines,
    newspaper,
    divisions: tc.divisionsHeld.map((id) => divisionReport(draft, id)),
    intelligence: tc.intel,
    capitalChange: me.politicalCapital - tc.playerCapitalStart,
    metrics: clock ? { phaseTimingsMs: timings } : {},
  };
}
