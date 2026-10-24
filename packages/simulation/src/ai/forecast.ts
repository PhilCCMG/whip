import type { ContentRegistry, Division, GameState, PoliticianId, Vote } from '@whip/domain';
import { decideVote, directionSign, whipFor, type VoteDecision } from '../parliament/vote-utility';
import {
  getBill,
  getPolitician,
  isGovernmentParty,
  isOnPayroll,
  scheduledDivisions,
  sittingMpIds,
  compareStrings,
} from '../state/access';

/** Snapshot of how every eligible MP would vote on a division if it were held now. */
export interface DivisionForecast {
  division: Division;
  decisions: Map<PoliticianId, VoteDecision>;
  ayes: number;
  noes: number;
  abstentions: number;
  /** Government-party MPs not currently voting with their whip. */
  governmentRebels: PoliticianId[];
  /** Government-party MPs forecast to vote against their whip (not merely abstain). */
  governmentOpponents: PoliticianId[];
  /**
   * Government-party backbenchers sorted by |utility| ascending (the closest to flipping first);
   * excludes declared rebels, the payroll vote and anyone comfortably loyal (≥ 0.6 towards the
   * whip). Empty unless the whip is aye or no.
   */
  waverers: PoliticianId[];
}

export function eligibleVoterIds(state: GameState): PoliticianId[] {
  return sittingMpIds(state).filter((id) => id !== state.parliament.speakerId);
}

export function forecastDivision(
  state: GameState,
  division: Division,
  content: ContentRegistry,
): DivisionForecast {
  const decisions = new Map<PoliticianId, VoteDecision>();
  let ayes = 0;
  let noes = 0;
  let abstentions = 0;
  const governmentRebels: PoliticianId[] = [];
  const governmentOpponents: PoliticianId[] = [];
  const waverers: { id: PoliticianId; u: number }[] = [];
  const bill = getBill(state, division.billId);
  for (const id of eligibleVoterIds(state)) {
    const mp = getPolitician(state, id);
    const d = decideVote(state, mp, division, content);
    decisions.set(id, d);
    if (d.vote === 'aye') ayes++;
    else if (d.vote === 'no') noes++;
    else abstentions++;
    if (isGovernmentParty(state, mp.partyId)) {
      const whip = whipFor(bill, mp);
      const dir: Vote | null = whip?.direction ?? null;
      if (dir !== null && d.vote !== dir) governmentRebels.push(id);
      if (dir !== null && dir !== 'abstain' && d.vote !== dir && d.vote !== 'abstain')
        governmentOpponents.push(id);
      // Utility is signed towards aye, so measure it along the whip's direction: comfortably loyal
      // means ≥ 0.6 towards the whip, whether the whip says aye or no.
      const sign = directionSign(dir);
      const declared = division.declarations[id]?.source === 'rebellion';
      if (
        sign !== 0 &&
        !declared &&
        !mp.isPlayer &&
        !isOnPayroll(state, mp) &&
        sign * d.breakdown.utility < 0.6
      ) {
        waverers.push({ id, u: d.breakdown.utility });
      }
    }
  }
  waverers.sort((a, b) => Math.abs(a.u) - Math.abs(b.u) || compareStrings(a.id, b.id));
  return {
    division,
    decisions,
    ayes,
    noes,
    abstentions,
    governmentRebels,
    governmentOpponents,
    waverers: waverers.map((w) => w.id),
  };
}

/** The next scheduled division within `horizon` turns of the current one (the AI's focus). */
export function focusDivision(state: GameState, horizon = 3): Division | undefined {
  return scheduledDivisions(state).find(
    (d) => d.turn >= state.meta.turn && d.turn - state.meta.turn <= horizon,
  );
}
