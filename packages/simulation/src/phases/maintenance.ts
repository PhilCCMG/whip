import type { Effect, GameState, PartyId, PoliticianId, Relationship } from '@whip/domain';
import { forecastDivision } from '../ai/forecast';
import { LOBBY } from '../parliament/tuning';
import { whipFor } from '../parliament/vote-utility';
import { defaultRelationship } from '../relationships/relationships';
import {
  chiefWhipId,
  clamp,
  deputyChiefWhipId,
  findPolitician,
  getBill,
  getPolitician,
  round,
  scheduledDivisions,
  sortedKeys,
} from '../state/access';
import type { TurnContext } from '../turn/context';

/** Drift step towards the derived default when an edge is more than this far from it. */
const DRIFT_THRESHOLD = 10;
/** Obligations age one step towards zero every N turns. */
const OBLIGATION_AGEING_TURNS = 8;
/**
 * A stored edge within this distance of its derived default on trust, respect and affinity, with no
 * memories, obligation or rivalry, carries no information worth storing and is dropped (it then
 * reads as the default again). Kept at 1 so that repeated small nudges (±2, e.g. the PM's respect
 * for a loyal intervention) still accumulate; a lone ±1 with no memory is below the noise floor.
 */
export const SETTLED_EDGE_EPSILON = 1;

function isSettled(e: Relationship, base: Relationship): boolean {
  return (
    e.memories.length === 0 &&
    e.obligation === 0 &&
    e.rivalry === 0 &&
    Math.abs(e.trust - base.trust) <= SETTLED_EDGE_EPSILON &&
    Math.abs(e.respect - base.respect) <= SETTLED_EDGE_EPSILON &&
    Math.abs(e.affinity - base.affinity) <= SETTLED_EDGE_EPSILON
  );
}

/**
 * Phase 4 — relationships: memory decay, drift towards the derived baseline, obligation ageing, and
 * aggregate loyalty drift for low-fidelity MPs. This is deterministic bookkeeping over thousands of
 * edges, so it updates values in place rather than emitting an effect per edge (documented
 * exception to effects-as-data: there is no gameplay "source" to explain).
 */
export function relationshipsPhase(draft: GameState, tc: TurnContext): void {
  const ageObligations = tc.turn % OBLIGATION_AGEING_TURNS === 0;
  const edges = draft.relationships.edges;
  // Each edge's update reads only that edge and politician/office data (never other edges) and
  // draws no randomness, so iteration order cannot affect the result: no need to sort ~6k keys.
  for (const key of Object.keys(edges)) {
    const e = edges[key];
    if (!e) continue;
    if (e.memories.length > 0) {
      e.memories = e.memories
        .map((m) => {
          const w = Math.abs(m.weight) - m.decaysBy;
          return { ...m, weight: round(Math.sign(m.weight) * Math.max(0, w), 2) };
        })
        .filter((m) => Math.abs(m.weight) >= 0.5);
    }
    const base = defaultRelationship(draft, e.from, e.to);
    if (Math.abs(e.trust - base.trust) > DRIFT_THRESHOLD) e.trust += e.trust > base.trust ? -1 : 1;
    if (Math.abs(e.affinity - base.affinity) > DRIFT_THRESHOLD)
      e.affinity += e.affinity > base.affinity ? -1 : 1;
    if (ageObligations && e.obligation !== 0) e.obligation += e.obligation > 0 ? -1 : 1;
    if (isSettled(e, base)) delete edges[key];
  }

  // Low-fidelity MPs: loyalty drifts towards their party's mean (they never act, but still vote).
  const sums = new Map<PartyId, { total: number; n: number }>();
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    if (!p || p.partyId === null || p.status !== 'mp') continue;
    const s = sums.get(p.partyId) ?? { total: 0, n: 0 };
    s.total += p.partyLoyalty;
    s.n += 1;
    sums.set(p.partyId, s);
  }
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    if (!p || p.fidelity !== 'low' || p.partyId === null) continue;
    const s = sums.get(p.partyId);
    if (!s || s.n === 0) continue;
    const mean = s.total / s.n;
    if (Math.abs(p.partyLoyalty - mean) > 15) p.partyLoyalty += p.partyLoyalty > mean ? -1 : 1;
  }
}

/**
 * Phase 5 — party & factions: whip operations on waverers ahead of this week's and next week's
 * divisions, then recompute party unity (derived; never incremented).
 */
export function partyPhase(draft: GameState, tc: TurnContext): void {
  const cw = chiefWhipId(draft);
  const dcw = deputyChiefWhipId(draft);
  const whips = [cw, dcw].filter(
    (x): x is PoliticianId => x !== null && findPolitician(draft, x) !== undefined,
  );
  for (const div of scheduledDivisions(draft)) {
    if (div.turn < tc.turn || div.turn > tc.turn + 1 || whips.length === 0) continue;
    const bill = getBill(draft, div.billId);
    const govWhip = whipFor(bill, getPolitician(draft, whips[0] as PoliticianId));
    if (
      !govWhip ||
      govWhip.direction === null ||
      (govWhip.line !== 'three_line' && govWhip.line !== 'two_line')
    )
      continue;
    const dir = govWhip.direction === 'aye' ? 1 : govWhip.direction === 'no' ? -1 : 0;
    if (dir === 0) continue;
    const forecast = forecastDivision(draft, div, tc.content);
    const targets = forecast.waverers.filter((id) => div.declarations[id]?.source !== 'rebellion');
    whips.forEach((whipId, wi) => {
      const whip = getPolitician(draft, whipId);
      const strength =
        (whip.skills.intrigue / 14) *
        (whip.traits.includes('trait.intimidating') ? 1.2 : 1) *
        (govWhip.line === 'three_line' ? 1.2 : 0.8);
      const mine = targets.slice(wi * LOBBY.whipTargets, (wi + 1) * LOBBY.whipTargets);
      for (const t of mine) {
        if (t === whipId) continue;
        const decision = forecast.decisions.get(t);
        const effects: Effect[] = [
          {
            kind: 'division.pressure',
            divisionId: div.id,
            targetId: t,
            sourceId: whipId,
            delta: round(dir * LOBBY.whipOperation * strength, 4),
            reason: 'leaned on by the whips',
          },
          { kind: 'division.whip_attention', divisionId: div.id, politicianId: t },
        ];
        if (decision)
          effects.push({
            kind: 'division.whip_intel',
            divisionId: div.id,
            politicianId: t,
            vote: decision.vote,
          });
        tc.emitAll(draft, effects);
      }
    });
    // The player hears from the whips if they are wavering or the whips doubt them.
    const me = draft.player.politicianId;
    const playerDecision = forecast.decisions.get(me);
    const doubted = div.whipIntel[me] !== undefined && div.whipIntel[me] !== govWhip.direction;
    if (
      getPolitician(draft, me).partyId === getPolitician(draft, whips[0] as PoliticianId).partyId &&
      (doubted || (playerDecision && playerDecision.vote !== govWhip.direction))
    ) {
      tc.flags.add(`whips_doubt_player:${div.id}`);
    }
  }

  // Party unity: mean loyalty minus recent rebellions (derived from source data).
  for (const pid of draft.parties.ids) {
    const party = draft.parties.byId[pid];
    if (!party) continue;
    let total = 0;
    let n = 0;
    let rebellions = 0;
    for (const id of draft.politicians.ids) {
      const p = draft.politicians.byId[id];
      if (!p || p.partyId !== pid || p.status !== 'mp') continue;
      total += p.partyLoyalty;
      n += 1;
      rebellions += p.rebellions.filter((r) => r.turn > tc.turn - 8).length;
    }
    party.unity = n === 0 ? 0 : clamp(Math.round(total / n - (rebellions / n) * 100), -100, 100);
  }
}

/** Phase 8 — public opinion: polls drift with the week's change in government stability. */
export function publicOpinionPhase(draft: GameState, tc: TurnContext): void {
  const delta = draft.government.stability - tc.stabilityStart;
  const gov = draft.parliament.governmentPartyIds;
  const polls = draft.opinion.polls;
  const keys = sortedKeys(polls) as PartyId[];
  for (const pid of keys) {
    const v = polls[pid] ?? 0;
    polls[pid] = clamp(
      v +
        (gov.includes(pid)
          ? delta * 0.0008
          : (-delta * 0.0008) / Math.max(1, keys.length - gov.length)),
      0.001,
      1,
    );
  }
  const total = keys.reduce((s, k) => s + (polls[k] ?? 0), 0);
  for (const pid of keys) {
    polls[pid] = round((polls[pid] ?? 0) / total, 4);
    const party = draft.parties.byId[pid];
    if (party) party.standing.nationalPollShare = polls[pid] ?? 0;
  }
  draft.opinion.governmentApproval = clamp(Math.round(draft.government.stability * 0.6), -100, 100);
}

/** Phase 9 — economic/social indicators: stub in the slice (keeps the pipeline order fixed). */
export function indicatorsPhase(_draft: GameState, _tc: TurnContext): void {
  // Intentionally empty (doc 03 §4, phase 9).
}
