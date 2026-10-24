import type {
  ContentRegistry,
  Division,
  DivisionId,
  GameState,
  KnownVote,
  PartyId,
  PoliticianId,
  Vote,
  WhipInstruction,
} from '@whip/domain';
import { eligibleVoterIds } from '../ai/forecast';
import type { DivisionReport } from '../context';
import { playerIntendedVote, whipFor } from '../parliament/vote-utility';
import { displayName, getBill, getDivision, getPolitician } from '../state/access';

export interface KnownIntentionDetail {
  value: KnownVote;
  asOfTurn: number | null;
  source: string | null;
}

/**
 * What `viewerId` knows about `politicianId`'s vote on a division (fog of war, 07 §5): their own
 * intention, the player's gathered intelligence, or a public statement; otherwise 'unknown'.
 */
export function knownIntentionDetail(
  state: GameState,
  viewerId: PoliticianId,
  politicianId: PoliticianId,
  divisionId: DivisionId,
  content?: ContentRegistry,
): KnownIntentionDetail {
  const div = state.parliament.divisions.byId[divisionId];
  if (!div) return { value: 'unknown', asOfTurn: null, source: null };
  if (div.result) {
    const v = div.result.votes[politicianId];
    return v
      ? { value: v, asOfTurn: div.turn, source: 'division list' }
      : { value: 'unknown', asOfTurn: null, source: null };
  }
  if (viewerId === politicianId) {
    if (viewerId === state.player.politicianId && content) {
      return {
        value: playerIntendedVote(state, div, content),
        asOfTurn: state.meta.turn,
        source: 'your intention',
      };
    }
    const decl = div.declarations[politicianId];
    if (decl) return { value: decl.vote, asOfTurn: decl.turn, source: 'your commitment' };
  }
  if (viewerId === state.player.politicianId) {
    const k = state.player.knowledge.intentions[politicianId]?.[divisionId];
    const decl = div.declarations[politicianId];
    const publicDecl = decl && decl.source === 'statement' ? decl : null;
    if (k && (!publicDecl || k.asOfTurn >= publicDecl.turn))
      return { value: k.value, asOfTurn: k.asOfTurn, source: k.source };
    if (publicDecl)
      return { value: publicDecl.vote, asOfTurn: publicDecl.turn, source: 'public statement' };
  } else {
    const decl = div.declarations[politicianId];
    if (decl && decl.source === 'statement')
      return { value: decl.vote, asOfTurn: decl.turn, source: 'public statement' };
  }
  return { value: 'unknown', asOfTurn: null, source: null };
}

export function knownIntention(
  state: GameState,
  viewerId: PoliticianId,
  politicianId: PoliticianId,
  divisionId: DivisionId,
  content?: ContentRegistry,
): KnownVote {
  return knownIntentionDetail(state, viewerId, politicianId, divisionId, content).value;
}

interface Tally {
  ayes: number;
  noes: number;
  abstain: number;
  unknown: number;
}

export interface PartyForecast extends Tally {
  partyId: PartyId;
  shortName: string;
  colour: string;
  whip: WhipInstruction | null;
  /** Totals if every unknown member follows the party whip (free vote/none ⇒ abstain). */
  expectedIfLoyal: { ayes: number; noes: number; abstain: number };
}

export interface DivisionForecastView extends Tally {
  divisionId: DivisionId;
  /** Unknowns split by each party whip's expectation. */
  expectedIfLoyal: { ayes: number; noes: number; abstain: number };
  byParty: PartyForecast[];
  /** MPs known (to the viewer) to be departing from their whip, or publicly wavering. */
  waverers: {
    id: PoliticianId;
    name: string;
    partyId: PartyId;
    partyShort: string;
    known: KnownVote;
    asOfTurn: number | null;
  }[];
  viewerIntendedVote: Vote | null;
}

function add(t: { ayes: number; noes: number; abstain: number }, v: Vote): void {
  if (v === 'aye') t.ayes++;
  else if (v === 'no') t.noes++;
  else t.abstain++;
}

/**
 * Forecast from the viewer's knowledge only (fog of war). Unknown MPs are counted as `unknown`
 * and also projected onto their party whip in `expectedIfLoyal`.
 */
export function divisionForecast(
  state: GameState,
  divisionId: DivisionId,
  viewerId: PoliticianId,
  content?: ContentRegistry,
): DivisionForecastView {
  const div = getDivision(state, divisionId);
  const bill = getBill(state, div.billId);
  const total: Tally = { ayes: 0, noes: 0, abstain: 0, unknown: 0 };
  const expected = { ayes: 0, noes: 0, abstain: 0 };
  const byParty = new Map<PartyId, PartyForecast>();
  const waverers: DivisionForecastView['waverers'] = [];
  for (const pid of state.parties.ids) {
    const party = state.parties.byId[pid];
    if (!party) continue;
    byParty.set(pid, {
      partyId: pid,
      shortName: party.shortName,
      colour: party.colour,
      whip: bill.whipping[pid] ?? null,
      ayes: 0,
      noes: 0,
      abstain: 0,
      unknown: 0,
      expectedIfLoyal: { ayes: 0, noes: 0, abstain: 0 },
    });
  }
  for (const id of eligibleVoterIds(state)) {
    const mp = getPolitician(state, id);
    const k = knownIntentionDetail(state, viewerId, id, divisionId, content);
    const pf = mp.partyId !== null ? byParty.get(mp.partyId) : undefined;
    const whip = whipFor(bill, mp);
    const whipVote: Vote =
      whip && (whip.line === 'three_line' || whip.line === 'two_line') && whip.direction
        ? whip.direction
        : 'abstain';
    if (k.value === 'unknown') {
      total.unknown++;
      if (pf) pf.unknown++;
      add(expected, whipVote);
      if (pf) add(pf.expectedIfLoyal, whipVote);
    } else {
      add(total, k.value);
      if (pf) add(pf, k.value);
      add(expected, k.value);
      if (pf) add(pf.expectedIfLoyal, k.value);
      if (k.value !== whipVote && id !== viewerId && pf) {
        waverers.push({
          id,
          name: displayName(mp),
          partyId: pf.partyId,
          partyShort: pf.shortName,
          known: k.value,
          asOfTurn: k.asOfTurn,
        });
      }
    }
  }
  const viewerIntendedVote =
    viewerId === state.player.politicianId && content && div.status === 'scheduled'
      ? playerIntendedVote(state, div, content)
      : (div.declarations[viewerId]?.vote ?? null);
  return {
    divisionId,
    ...total,
    expectedIfLoyal: expected,
    byParty: [...byParty.values()],
    waverers,
    viewerIntendedVote,
  };
}

/** Projection-friendly summary of a held division (maps onto contracts' DivisionResult). */
export function divisionReport(state: GameState, divisionId: DivisionId): DivisionReport {
  const div: Division = getDivision(state, divisionId);
  const bill = getBill(state, div.billId);
  const r = div.result;
  if (!r) throw new Error(`Division ${divisionId} has not been held`);
  const parties = new Map<PartyId, DivisionReport['byParty'][number]>();
  for (const pid of state.parties.ids) {
    const p = state.parties.byId[pid];
    if (p)
      parties.set(pid, {
        partyId: pid,
        shortName: p.shortName,
        colour: p.colour,
        ayes: 0,
        noes: 0,
        abstentions: 0,
      });
  }
  for (const id of Object.keys(r.votes).sort() as PoliticianId[]) {
    const mp = state.politicians.byId[id];
    const v = r.votes[id];
    const row = mp?.partyId ? parties.get(mp.partyId) : undefined;
    if (!row || !v) continue;
    if (v === 'aye') row.ayes++;
    else if (v === 'no') row.noes++;
    else row.abstentions++;
  }
  return {
    divisionId: div.id,
    billId: bill.id,
    billTitle: bill.title,
    stage: div.stage,
    heldOn: r.heldOn,
    ayes: r.ayes,
    noes: r.noes,
    abstentions: r.abstentions,
    passed: r.passed,
    governmentWon: r.governmentWon,
    margin: r.margin,
    playerVote: r.votes[state.player.politicianId] ?? null,
    byParty: [...parties.values()],
    rebels: r.rebels.map((rb) => {
      const mp = getPolitician(state, rb.politicianId);
      const party = mp.partyId ? state.parties.byId[mp.partyId] : undefined;
      return {
        politicianId: mp.id,
        name: displayName(mp),
        partyId: mp.partyId as PartyId,
        partyShort: party?.shortName ?? '',
        vote: rb.vote,
        reason: rb.reason,
      };
    }),
  };
}
