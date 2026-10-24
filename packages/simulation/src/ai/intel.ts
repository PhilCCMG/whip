import type { GameState, PlannedAction } from '@whip/domain';
import { stageLabel, VOTE_LABEL } from '../chronicle/templates';
import { findDivision, nameOf } from '../state/access';

/** Third-person phrase for an NPC move, for the player's intelligence feed. */
export function intelPhrase(state: GameState, a: PlannedAction): string {
  const me = state.player.politicianId;
  const t = (id: string) => (id === me ? 'you' : nameOf(state, id as PlannedAction['actorId']));
  switch (a.kind) {
    case 'meet_politician':
      return `met ${t(a.params.targetId)} privately`;
    case 'build_relationship':
      return `is cultivating ${t(a.params.targetId)}`;
    case 'seek_endorsement':
      return `is courting ${t(a.params.targetId)} for an endorsement`;
    case 'make_political_promise':
      return `made a promise to ${t(a.params.targetId)}`;
    case 'support_legislation':
    case 'oppose_legislation': {
      const bill = state.parliament.bills.byId[a.params.billId]?.title ?? 'the bill';
      const verb = a.kind === 'support_legislation' ? 'is lobbying for' : 'is lobbying against';
      const targets = a.params.lobbyTargetIds.map(t);
      return `${verb} the ${bill}${targets.length > 0 ? `, working on ${targets.join(', ')}` : ''}`;
    }
    case 'rebel_against_party': {
      const div = findDivision(state, a.params.divisionId);
      return `is organising a rebellion: voting ${VOTE_LABEL[a.params.vote]}${div ? ` at ${stageLabel(div.stage)}` : ''}`;
    }
    case 'request_promotion':
      return 'asked the whips for a government job';
    case 'respond_to_event':
      return 'responded to events';
    case 'call_reshuffle':
      return 'is planning a reshuffle';
  }
}

export function intelText(state: GameState, a: PlannedAction): string {
  const reasons = a.reasons.length > 0 ? ` (${a.reasons.join('; ')})` : '';
  return `${nameOf(state, a.actorId)} ${intelPhrase(state, a)}${reasons}.`;
}
