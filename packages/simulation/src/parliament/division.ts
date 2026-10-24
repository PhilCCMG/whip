import {
  addDays,
  type Division,
  type DivisionResult,
  type Effect,
  type FactionId,
  type GameState,
  type PoliticianId,
  type RebelEntry,
  type Vote,
} from '@whip/domain';
import { eligibleVoterIds } from '../ai/forecast';
import { memory, rel } from '../actions/common';
import { stageLabel, VOTE_LABEL } from '../chronicle/templates';
import {
  chiefWhipId,
  getBill,
  getPolitician,
  isGovernmentParty,
  scheduledDivisions,
} from '../state/access';
import type { TurnContext } from '../turn/context';
import { decideVote, rebelReason, topReasons, whipFor } from './vote-utility';

/** Trust lost with the Chief Whip per rebellion (07 §4.3). */
const REBEL_TRUST_PENALTY = { three_line: 25, two_line: 15 } as const;
/** Rebels who bond with each other: each rebel gets this many shared-memory edges. */
const REBEL_BONDS_PER_REBEL = 3;
/** Faction cohesion rises if at least this many members rebel together. */
const FACTION_REBELLION_THRESHOLD = 15;

/** Phase 6 — Parliament: bill stage transitions, then this week's divisions in date order. */
export function parliamentPhase(draft: GameState, tc: TurnContext): void {
  // First readings happen in the week the bill is introduced.
  for (const bid of draft.parliament.bills.ids) {
    const bill = draft.parliament.bills.byId[bid];
    if (!bill || bill.stage !== 'first_reading') continue;
    const intro = bill.stageDates.first_reading;
    if (intro !== undefined && intro <= addDays(tc.date, 6)) bill.stage = 'second_reading';
  }
  for (const div of scheduledDivisions(draft)) {
    if (div.turn !== tc.turn) continue;
    holdDivision(draft, tc, div);
  }
}

function holdDivision(draft: GameState, tc: TurnContext, div: Division): void {
  const bill = getBill(draft, div.billId);
  const content = tc.content;
  const votes: Record<PoliticianId, Vote> = {};
  const explanations: Record<PoliticianId, string[]> = {};
  const rebels: RebelEntry[] = [];
  let ayes = 0;
  let noes = 0;
  let abstentions = 0;
  const eligible = eligibleVoterIds(draft);
  for (const id of eligible) {
    const mp = getPolitician(draft, id);
    const d = decideVote(draft, mp, div, content);
    votes[id] = d.vote;
    if (d.vote === 'aye') ayes++;
    else if (d.vote === 'no') noes++;
    else abstentions++;
    const whip = whipFor(bill, mp);
    const whipped =
      whip !== null &&
      (whip.line === 'three_line' || whip.line === 'two_line') &&
      whip.direction !== null;
    const rebelled = whipped && d.vote !== whip.direction;
    if (rebelled) {
      const reasonText =
        d.rule === 'declared'
          ? `Declared: ${rebelReason(d.breakdown, whip.direction, d.vote)}`
          : rebelReason(d.breakdown, whip.direction, d.vote);
      rebels.push({ politicianId: id, vote: d.vote, reason: reasonText });
    }
    if (mp.fidelity === 'high' || rebelled || mp.isPlayer)
      explanations[id] = topReasons(d.breakdown);
  }
  const passed = ayes > noes;
  const sponsor = getPolitician(draft, bill.sponsorId);
  const govBill = isGovernmentParty(draft, sponsor.partyId);
  const governmentWon = govBill ? passed : !passed;
  const result: DivisionResult = {
    heldOn: div.scheduledFor,
    ayes,
    noes,
    abstentions,
    eligible: eligible.length,
    passed,
    governmentWon,
    margin: ayes - noes,
    votes,
    rebels,
    explanations,
  };
  div.result = result;
  div.status = 'held';
  tc.divisionsHeld.push(div.id);

  // Bill progresses (or falls).
  if (!passed) {
    bill.stage = 'defeated';
    // Later stages of a defeated bill never happen.
    for (const id of bill.divisionIds) {
      const later = draft.parliament.divisions.byId[id];
      if (later && later.status === 'scheduled') later.status = 'cancelled';
    }
  } else if (div.stage === 'second_reading') bill.stage = 'committee';
  else bill.stage = 'passed';
  bill.stageDates[bill.stage] = div.scheduledFor;

  const govRebels = rebels.filter((r) =>
    isGovernmentParty(draft, getPolitician(draft, r.politicianId).partyId),
  );
  const rec = tc.record(draft, {
    type: 'division',
    payload: {
      divisionId: div.id,
      billId: bill.id,
      stage: div.stage,
      ayes,
      noes,
      abstentions,
      passed,
      governmentWon,
      rebelIds: rebels.map((r) => r.politicianId),
    },
    importance: div.stage === 'second_reading' ? 5 : 4,
    template: passed ? 'division.passed' : 'division.defeated',
    vars: {
      bill: bill.title,
      stage: stageLabel(div.stage),
      ayes,
      noes,
      abstentions,
      margin: Math.abs(ayes - noes),
      count: govRebels.length,
    },
    actorIds: [bill.sponsorId],
    subjectIds: [div.id, bill.id],
    date: div.scheduledFor,
  });
  const me = draft.player.politicianId;
  const myVote = votes[me];
  tc.notify(draft, {
    severity: governmentWon ? (passed ? 'good' : 'info') : 'critical',
    title: `${bill.title}: ${passed ? 'passed' : 'defeated'} at ${stageLabel(div.stage)} (${ayes}–${noes})`,
    body: `${govRebels.length} government MPs defied the whip.${myVote ? ` You voted ${VOTE_LABEL[myVote]}.` : ''}`,
    link: { kind: 'division', id: div.id },
  });
  consequences(draft, tc, div, rebels, rec.id);
}

/** 07 §4.3 consequences: whip trust, loyal waverers, faction cohesion, rebel bonds. */
function consequences(
  draft: GameState,
  tc: TurnContext,
  div: Division,
  rebels: RebelEntry[],
  historyId: string,
): void {
  const bill = getBill(draft, div.billId);
  const cw = chiefWhipId(draft);
  const effects: Effect[] = [];
  const rebelIds = new Set(rebels.map((r) => r.politicianId));
  const rebelsByFaction = new Map<FactionId, PoliticianId[]>();
  for (const r of rebels) {
    const mp = getPolitician(draft, r.politicianId);
    const whip = whipFor(bill, mp);
    const line = whip?.line === 'three_line' ? 'three_line' : 'two_line';
    effects.push({
      kind: 'rebellion.record',
      politicianId: mp.id,
      divisionId: div.id,
      vote: r.vote,
      whipLine: line,
    });
    if (isGovernmentParty(draft, mp.partyId) && cw !== null && cw !== mp.id) {
      effects.push(
        rel(
          cw,
          mp.id,
          { trust: -REBEL_TRUST_PENALTY[line] },
          `rebelled on the ${bill.title}`,
          memory('rebelled', -40, 1, div.id),
        ),
      );
    }
    if (mp.isPlayer || mp.castKey !== null) {
      effects.push({
        kind: 'career.record',
        politicianId: mp.id,
        entryKind: 'rebelled',
        officeKey: null,
        text: `Voted ${VOTE_LABEL[r.vote]} against the whip on the ${bill.title} (${stageLabel(div.stage)})`,
      });
    }
    if (mp.factionId !== null) {
      const list = rebelsByFaction.get(mp.factionId) ?? [];
      list.push(mp.id);
      rebelsByFaction.set(mp.factionId, list);
    }
  }
  // Loyal waverers the whips worked on, who stayed loyal, earn the whips' respect.
  if (cw !== null && div.result) {
    for (const id of Object.keys(div.whipAttention).sort() as PoliticianId[]) {
      if (rebelIds.has(id) || id === cw || div.result.votes[id] === undefined) continue;
      effects.push(
        rel(
          cw,
          id,
          { respect: 4, trust: 3 },
          'held firm under pressure',
          memory('stayed_loyal', 10, 1, div.id),
        ),
      );
    }
  }
  // Factions: big joint rebellions harden cohesion.
  for (const fid of [...rebelsByFaction.keys()].sort()) {
    if ((rebelsByFaction.get(fid)?.length ?? 0) >= FACTION_REBELLION_THRESHOLD) {
      effects.push({
        kind: 'faction.cohesion',
        factionId: fid,
        delta: 0.05,
        reason: 'rebelled together',
      });
    }
  }
  // Rebels gain affinity with each other: each bonds with a few fellow rebels (same faction first),
  // and the player bonds with every rebel they walked through the lobby with (bounded).
  const rng = tc.rng(`rebel_bonds:${div.id}`);
  const ordered = rebels.map((r) => r.politicianId);
  for (const id of ordered) {
    const mp = getPolitician(draft, id);
    const peers = ordered.filter((o) => o !== id && getPolitician(draft, o).partyId === mp.partyId);
    const sameFaction = peers.filter(
      (o) => mp.factionId !== null && getPolitician(draft, o).factionId === mp.factionId,
    );
    const pool = sameFaction.length >= REBEL_BONDS_PER_REBEL ? sameFaction : peers;
    const chosen = mp.isPlayer ? peers.slice(0, 12) : rng.sample(pool, REBEL_BONDS_PER_REBEL);
    for (const o of chosen) {
      effects.push(
        rel(
          id,
          o,
          { affinity: 5, trust: 3 },
          'rebelled together',
          memory('rebelled_together', 15, 0.5, div.id),
        ),
      );
      if (mp.isPlayer)
        effects.push(
          rel(
            o,
            id,
            { affinity: 5, trust: 3 },
            'rebelled together',
            memory('rebelled_together', 15, 0.5, div.id),
          ),
        );
    }
  }
  const { effectIds } = tc.emitAll(draft, effects);
  const rec = draft.recentHistory.find((h) => h.id === historyId);
  if (rec) rec.effectIds.push(...effectIds.slice(0, 50));
}
