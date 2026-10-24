import type {
  ContentRegistry,
  Division,
  Effect,
  GameState,
  IneligibilityReason,
  MemorySpec,
  Politician,
  PoliticianId,
} from '@whip/domain';
import { stageLabel, VOTE_LABEL } from '../chronicle/templates';
import { decideVote } from '../parliament/vote-utility';
import {
  displayName,
  findPolitician,
  isSitting,
  nameOf,
  scheduledDivisions,
} from '../state/access';
import type { ActionResolution } from './types';

export function reason(code: IneligibilityReason['code'], message: string): IneligibilityReason {
  return { code, message };
}

export function sittingActor(actor: Politician): IneligibilityReason[] {
  return isSitting(actor) ? [] : [reason('not_sitting_mp', 'Only sitting MPs can do this.')];
}

/** Target must be a sitting MP other than the actor. */
export function sittingTarget(
  state: GameState,
  actor: Politician,
  targetId: PoliticianId,
): IneligibilityReason[] {
  if (targetId === actor.id) return [reason('self_target', 'You cannot target yourself.')];
  const t = findPolitician(state, targetId);
  if (!t) return [reason('invalid_target', 'That politician does not exist.')];
  if (!isSitting(t)) return [reason('invalid_target', `${displayName(t)} is not a sitting MP.`)];
  return [];
}

export function rel(
  from: PoliticianId,
  to: PoliticianId,
  d: { trust?: number; respect?: number; affinity?: number; obligation?: number; rivalry?: number },
  reasonText: string,
  memory: MemorySpec | null = null,
): Effect {
  return {
    kind: 'relationship.adjust',
    from,
    to,
    trust: d.trust ?? 0,
    respect: d.respect ?? 0,
    affinity: d.affinity ?? 0,
    obligation: d.obligation ?? 0,
    rivalry: d.rivalry ?? 0,
    memory,
    reason: reasonText,
  };
}

export function memory(
  kind: MemorySpec['kind'],
  weight: number,
  decaysBy: number,
  refId: string | null = null,
): MemorySpec {
  return { kind, weight, decaysBy, refId };
}

/** Upcoming divisions (scheduled, this turn or later). */
export function upcomingDivisions(state: GameState): Division[] {
  return scheduledDivisions(state).filter((d) => d.turn >= state.meta.turn);
}

/** Product of a trait response multiplier over the target's traits. */
export function traitResponse(
  target: Politician,
  content: ContentRegistry,
  pick: 'flatteryResponse' | 'substanceResponse' | 'grudgeMultiplier',
): number {
  let m = 1;
  for (const t of target.traits) m *= content.traits[t]?.relationship[pick] ?? 1;
  return m;
}

/**
 * Effects revealing `target`'s current voting intention on upcoming divisions to `actor`:
 * the player's fog-of-war knowledge, or the whips' office intelligence for whips.
 */
export function revealIntentions(
  state: GameState,
  actor: Politician,
  target: Politician,
  content: ContentRegistry,
  source: string,
): { effects: Effect[]; text: string[] } {
  const effects: Effect[] = [];
  const text: string[] = [];
  for (const div of upcomingDivisions(state)) {
    const { vote } = decideVote(state, target, div, content);
    if (actor.isPlayer) {
      effects.push({
        kind: 'knowledge.intention',
        politicianId: target.id,
        divisionId: div.id,
        value: vote,
        source,
      });
      text.push(
        `${displayName(target)} intends to vote ${VOTE_LABEL[vote]} at ${stageLabel(div.stage)}.`,
      );
    } else if (isWhipOrSponsor(state, actor)) {
      effects.push({
        kind: 'division.whip_intel',
        divisionId: div.id,
        politicianId: target.id,
        vote,
      });
    }
  }
  return { effects, text };
}

export function isWhipOrSponsor(state: GameState, p: Politician): boolean {
  const a = state.government.appointments;
  if (a['office.chief_whip'] === p.id || a['office.deputy_chief_whip'] === p.id) return true;
  return state.parliament.bills.ids.some((b) => state.parliament.bills.byId[b]?.sponsorId === p.id);
}

export function emptyResolution(summary: string): ActionResolution {
  return { status: 'succeeded', summary, effects: [], scheduled: [], history: null };
}

export function you(state: GameState, id: PoliticianId): string {
  return state.player.politicianId === id ? 'You' : nameOf(state, id);
}
