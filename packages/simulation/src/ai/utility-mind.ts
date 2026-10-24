import type {
  ActionRequest,
  Bill,
  Division,
  GameState,
  Politician,
  PoliticianId,
  ValidatedAction,
  Vote,
} from '@whip/domain';
import { actionDedupKey } from '../actions/catalogue';
import { validateRequest } from '../actions/plan';
import type { SimulationContext } from '../context';
import { demandValue, whipFor } from '../parliament/vote-utility';
import { compatibility, getRelationship, officeInfluence } from '../relationships/relationships';
import type { Rng } from '../rng';
import {
  chiefWhipId,
  clamp,
  deputyChiefWhipId,
  displayName,
  getBill,
  getConstituency,
  getPolitician,
  holdsOffice,
  isFactionLeader,
  isGovernmentParty,
  isMinister,
  officeHolder,
  compareStrings,
} from '../state/access';
import {
  scoreConsiderations,
  topConsiderationReasons,
  type ConsiderationValue,
} from './considerations';
import type { DivisionForecast } from './forecast';

/** Diary slots available to an NPC each week. */
export const NPC_DIARY_SLOTS = 3;
/** Minimum utility for an NPC to bother acting. */
const ACT_THRESHOLD = 0.15;

export interface AiPlan {
  action: ValidatedAction;
  label: string;
  slots: number;
  capitalCost: number;
  /** Top-3 reasons, e.g. "ambitious: wants promotion". */
  reasons: string[];
  score: number;
}

export interface MindEnv {
  ctx: SimulationContext;
  rng: Rng;
  /** Forecast of the focus division from the start-of-week state (shared by all NPCs). */
  forecast: DivisionForecast | null;
  /** Outgoing stored relationship targets per politician (built once per turn). */
  contacts: Map<PoliticianId, PoliticianId[]>;
  /** Per-turn caches shared by all NPCs (see buildMindCaches). */
  caches: MindCaches;
}

/** Candidate pools computed once per turn instead of once per NPC (performance). */
export interface MindCaches {
  /** Sitting MPs who can give endorsements (office holders except the PM, faction leaders, FotH), by party. */
  patronsByParty: Map<string, PoliticianId[]>;
  /** Faction leaders and ambitious, able new-intake MPs, by party (targets for hedging). */
  hedgeTargetsByParty: Map<string, PoliticianId[]>;
}

export function buildMindCaches(state: GameState): MindCaches {
  const patronsByParty = new Map<string, PoliticianId[]>();
  const hedgeTargetsByParty = new Map<string, PoliticianId[]>();
  for (const id of state.politicians.ids) {
    const p = state.politicians.byId[id];
    if (!p || p.status !== 'mp' || p.partyId === null) continue;
    const leader = isFactionLeader(state, id);
    if (
      !holdsOffice(p, 'office.prime_minister') &&
      (p.offices.length > 0 || leader || state.parliament.fatherOfHouseId === id)
    ) {
      const list = patronsByParty.get(p.partyId) ?? [];
      list.push(id);
      patronsByParty.set(p.partyId, list);
    }
    const avg = (p.skills.oratory + p.skills.negotiation + p.skills.intrigue + p.skills.media) / 4;
    if (
      !p.isPlayer &&
      (leader || (p.newIntake && p.ambition.target === 'ambition.cabinet' && avg >= 12))
    ) {
      const list = hedgeTargetsByParty.get(p.partyId) ?? [];
      list.push(id);
      hedgeTargetsByParty.set(p.partyId, list);
    }
  }
  return { patronsByParty, hedgeTargetsByParty };
}

/** Planner interface (doc 03 §6): a richer planner can replace the utility AI behind it. */
export interface PoliticianMind {
  plan(state: GameState, npcId: PoliticianId, env: MindEnv): AiPlan[];
}

interface Candidate {
  request: ActionRequest;
  values: ConsiderationValue[];
}

interface CandidateCtx {
  state: GameState;
  npc: Politician;
  env: MindEnv;
  division: Division | null;
  bill: Bill | null;
  /** NPC's own vote utility on the focus division (null when none). */
  selfU: number | null;
  /** NPC's party whip direction on the focus division. */
  whipDir: Vote | null;
  isGov: boolean;
}

function traitTag(npc: Politician, ctx: SimulationContext, keys: string[]): string {
  const t = npc.traits.find((k) => keys.includes(k));
  return t ? (ctx.content.traits[t]?.label.toLowerCase() ?? '') : '';
}

function riskReason(npc: Politician): string {
  return npc.riskTolerance >= 1
    ? 'happy to take risks'
    : npc.riskTolerance <= -1
      ? 'risk-averse'
      : 'wary of the whips';
}

/** Whips and the bill sponsor keep waverers in line (07 §4.4). */
function whipDutyCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env, division, bill } = c;
  if (!division || !bill || !env.forecast || c.whipDir !== 'aye' || !c.isGov) return [];
  const isWhip = chiefWhipId(state) === npc.id || deputyChiefWhipId(state) === npc.id;
  const isSponsor = bill.sponsorId === npc.id;
  if (!isWhip && !isSponsor) return [];
  const waverers = env.forecast.waverers.filter((id) => id !== npc.id);
  const lightlyLobbied = waverers
    .filter((id) => (division.pressure[id]?.bySource[npc.id] ?? 0) < 0.12)
    .slice(0, 3);
  const out: Candidate[] = [];
  if (lightlyLobbied.length > 0) {
    const values: ConsiderationValue[] = [
      { key: 'whipDuty', value: 0.8, reason: 'keeping waverers in line' },
    ];
    if (isSponsor) values.push({ key: 'billStake', value: 0.6, reason: 'it is their bill' });
    out.push({
      request: {
        kind: 'support_legislation',
        params: { billId: bill.id, lobbyTargetIds: lightlyLobbied },
      },
      values,
    });
  }
  for (const id of waverers.filter((w) => division.whipIntel[w] === undefined).slice(0, 3)) {
    out.push({
      request: { kind: 'meet_politician', params: { targetId: id } },
      values: [
        {
          key: 'whipDuty',
          value: 0.45,
          reason: `finding out where ${displayName(getPolitician(state, id))} stands`,
        },
      ],
    });
  }
  return out;
}

/** Faction leaders whose line opposes the bill organise against it. */
function factionCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env, division, bill, selfU } = c;
  if (!division || !bill || selfU === null || !c.isGov || npc.factionId === null) return [];
  if (!isFactionLeader(state, npc.id)) return [];
  const f = state.factions.byId[npc.factionId];
  if (!f) return [];
  const line =
    f.demands.reduce((s, d) => s + demandValue(bill.issues[d] ?? 0), 0) /
    Math.max(1, f.demands.length);
  if (line >= 0) return [];
  const demand =
    env.ctx.content.issues[f.demands[0] ?? 'issue.none']?.label.toLowerCase() ?? 'its demands';
  const out: Candidate[] = [];
  const risk = clamp(0.4 - 0.15 * npc.riskTolerance, 0, 1);
  const members = (env.forecast?.waverers ?? []).filter((id) => {
    const p = state.politicians.byId[id];
    return p !== undefined && p.factionId === f.id && id !== npc.id;
  });
  if (selfU < 0.35) {
    out.push({
      request: {
        kind: 'oppose_legislation',
        params: { billId: bill.id, lobbyTargetIds: members.slice(0, 3) },
      },
      values: [
        {
          key: 'factionDemand',
          value: clamp(0.35 - selfU, 0, 1),
          reason: `${f.name} want ${demand}`,
        },
        { key: 'riskOfWhipAnger', value: -risk, reason: riskReason(npc) },
      ],
    });
  }
  const declared = division.declarations[npc.id]?.source === 'rebellion';
  if (!declared && division.turn - state.meta.turn <= 1 && selfU < -0.15) {
    out.push({
      request: { kind: 'rebel_against_party', params: { divisionId: division.id, vote: 'no' } },
      values: [
        {
          key: 'factionDemand',
          value: clamp(-selfU * 2, 0, 1),
          reason: `will not vote for it without ${demand}`,
        },
        {
          key: 'riskOfWhipAnger',
          value: -clamp(0.5 - 0.15 * npc.riskTolerance, 0, 1),
          reason: riskReason(npc),
        },
      ],
    });
  }
  // Build a bloc: faction waverers, plus ideologically close government MPs outside the faction.
  const outsiders = (env.forecast?.waverers ?? [])
    .map((id) => getPolitician(state, id))
    .filter((p) => p.factionId !== f.id && p.id !== npc.id && compatibility(npc, p) >= 0.6)
    .slice(0, 2);
  for (const p of [...members.slice(0, 1).map((id) => getPolitician(state, id)), ...outsiders]) {
    const r = getRelationship(state, npc.id, p.id);
    out.push({
      request: { kind: 'build_relationship', params: { targetId: p.id } },
      values: [
        {
          key: 'relationshipValue',
          value: 0.45 * (1 - clamp(r.affinity, 0, 60) / 60),
          reason: `courting ${displayName(p)}`,
        },
        { key: 'factionDemand', value: 0.2, reason: 'building a bloc against the bill' },
      ],
    });
  }
  return out;
}

/** Careerist backbenchers court patrons, then ask for a job, and stay visibly loyal. */
function careeristCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env, bill, selfU } = c;
  const amb = env.ctx.content.ambitions[npc.ambition.target];
  if (!amb?.careerist || !c.isGov || isMinister(npc, env.ctx.content)) return [];
  const out: Candidate[] = [];
  const tag = traitTag(npc, env.ctx, ['trait.ambitious', 'trait.schemer']) || 'careerist';
  const intensity = npc.ambition.intensity / 5;
  const patrons = (env.caches.patronsByParty.get(npc.partyId ?? '') ?? [])
    .filter((id) => id !== npc.id && !npc.endorsedBy.includes(id))
    .map((id) => getPolitician(state, id))
    .map((p) => {
      const r = getRelationship(state, p.id, npc.id);
      const chance = clamp(
        0.1 +
          (r.respect + r.trust) / 120 +
          (p.factionId === npc.factionId && p.factionId !== null ? 0.1 : 0),
        0.03,
        0.9,
      );
      return {
        p,
        chance,
        value:
          chance * 0.6 +
          officeInfluence(p, env.ctx.content) / 80 +
          (state.parliament.fatherOfHouseId === p.id ? 0.25 : 0),
      };
    })
    .sort((a, b) => b.value - a.value || compareStrings(a.p.id, b.p.id))
    .slice(0, 2);
  for (const { p, value } of patrons) {
    out.push({
      request: { kind: 'seek_endorsement', params: { targetId: p.id } },
      values: [
        {
          key: 'careerGain',
          value: clamp(0.15 + value, 0, 1) * intensity,
          reason: `${tag}: wants ${displayName(p)} in their corner`,
        },
      ],
    });
  }
  const hasVacancy = Object.values(state.government.appointments).some((v) => v === null);
  // Named characters with burning ambition don't wait for endorsements once the term is under way.
  const keen = npc.castKey !== null && npc.ambition.intensity >= 4 && state.meta.turn >= 3;
  if (hasVacancy && (npc.endorsedBy.length >= 2 || keen)) {
    out.push({
      request: { kind: 'request_promotion', params: {} },
      values: [
        {
          key: 'careerGain',
          value: intensity * (0.35 + 0.12 * npc.endorsedBy.length),
          reason: `${tag}: wants promotion`,
        },
        { key: 'riskOfWhipAnger', value: 0.1, reason: 'low risk' },
      ],
    });
  }
  if (bill && selfU !== null && selfU > 0.25 && c.whipDir === 'aye') {
    out.push({
      request: {
        kind: 'support_legislation',
        params: {
          billId: bill.id,
          lobbyTargetIds: (env.forecast?.waverers ?? []).filter((id) => id !== npc.id).slice(3, 4),
        },
      },
      values: [
        {
          key: 'careerGain',
          value: 0.3 * intensity + 0.05,
          reason: 'being seen backing the government',
        },
        { key: 'publicProfile', value: 0.25, reason: 'a chance to be noticed' },
      ],
    });
  }
  return out;
}

/** Senior ministers with leadership ambitions quietly cultivate faction leaders and rising stars. */
function hedgerCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env } = c;
  if (
    npc.ambition.target !== 'ambition.leadership' ||
    !isMinister(npc, env.ctx.content) ||
    !c.isGov
  )
    return [];
  if (c.bill?.sponsorId === npc.id) return [];
  const out: Candidate[] = [];
  const targets = (env.caches.hedgeTargetsByParty.get(npc.partyId ?? '') ?? [])
    .map((id) => getPolitician(state, id))
    .filter(
      (p) => p.id !== npc.id && !(isFactionLeader(state, p.id) && p.factionId === npc.factionId),
    )
    .map((p) => ({ p, aff: getRelationship(state, npc.id, p.id).affinity }))
    .sort((a, b) => a.aff - b.aff || compareStrings(a.p.id, b.p.id))
    .slice(0, 3);
  for (const { p, aff } of targets) {
    out.push({
      request: { kind: 'build_relationship', params: { targetId: p.id } },
      values: [
        {
          key: 'relationshipValue',
          value: 0.5 * (1 - clamp(aff, 0, 60) / 60),
          reason: `cultivating ${displayName(p)}`,
        },
        { key: 'careerGain', value: 0.25, reason: 'building a base for a future leadership bid' },
      ],
    });
  }
  return out;
}

/** The opposition front bench lobbies government waverers in suburban and shire seats. */
function oppositionCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env, bill } = c;
  if (!bill || c.isGov || c.whipDir !== 'no' || !env.forecast) return [];
  const frontBench =
    officeHolder(state, 'office.leader_of_opposition') === npc.id ||
    officeHolder(state, 'office.shadow_housing') === npc.id;
  if (!frontBench) return [];
  const shire = env.forecast.waverers.filter((id) => {
    const p = getPolitician(state, id);
    if (p.constituencyId === null) return false;
    return getConstituency(state, p.constituencyId).demographics.urbanity !== 'urban';
  });
  const out: Candidate[] = [];
  if (shire.length > 0) {
    out.push({
      request: {
        kind: 'oppose_legislation',
        params: { billId: bill.id, lobbyTargetIds: shire.slice(0, 3) },
      },
      values: [
        { key: 'billStake', value: 0.6, reason: 'a chance to embarrass the government' },
        { key: 'publicProfile', value: 0.5, reason: 'the cameras are on housing' },
      ],
    });
    const first = shire[0];
    if (first) {
      out.push({
        request: { kind: 'meet_politician', params: { targetId: first } },
        values: [{ key: 'relationshipValue', value: 0.35, reason: 'courting government rebels' }],
      });
    }
  }
  return out;
}

/** The PM reshuffles after a defeat or resignation, or to fill posts once the vote is past. */
function primeMinisterCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env, bill } = c;
  if (!holdsOffice(npc, 'office.prime_minister')) return [];
  const out: Candidate[] = [];
  const g = state.government;
  const lastReshuffle = state.careers.lastReshuffleTurn ?? -1;
  const recentDefeat =
    g.lastDefeatTurn !== null &&
    state.meta.turn - g.lastDefeatTurn <= 2 &&
    lastReshuffle < g.lastDefeatTurn;
  const vacantMinisterial = Object.entries(g.appointments).some(
    ([k, v]) =>
      v === null &&
      env.ctx.content.offices[k as keyof typeof env.ctx.content.offices]?.ministerial === true,
  );
  const anyVacancy = Object.values(g.appointments).some((v) => v === null);
  const keyVoteHeld = state.parliament.divisions.ids.some(
    (id) => state.parliament.divisions.byId[id]?.status === 'held',
  );
  if (
    recentDefeat ||
    (vacantMinisterial && keyVoteHeld && lastReshuffle < state.meta.turn - 1) ||
    (anyVacancy && keyVoteHeld && lastReshuffle < 0)
  ) {
    out.push({
      request: { kind: 'call_reshuffle', params: {} },
      values: [
        {
          key: 'whipDuty',
          value: recentDefeat ? 0.9 : 0.5,
          reason: recentDefeat ? 'must reassert authority after the defeat' : 'posts to fill',
        },
      ],
    });
  }
  if (bill && env.forecast && c.whipDir === 'aye') {
    const targets = env.forecast.waverers.slice(0, 2);
    if (targets.length > 0) {
      out.push({
        request: {
          kind: 'support_legislation',
          params: { billId: bill.id, lobbyTargetIds: targets },
        },
        values: [
          { key: 'whipDuty', value: 0.35, reason: 'personally lobbying waverers' },
          { key: 'billStake', value: 0.3, reason: 'a flagship bill' },
        ],
      });
    }
  }
  return out;
}

/** Everyone: keep in touch with contacts; principled or reckless MPs speak out against bad bills. */
function genericCandidates(c: CandidateCtx): Candidate[] {
  const { state, npc, env, bill, selfU } = c;
  const out: Candidate[] = [];
  if (
    bill &&
    selfU !== null &&
    c.isGov &&
    c.whipDir === 'aye' &&
    selfU < -0.3 &&
    npc.riskTolerance >= 1 &&
    !isFactionLeader(state, npc.id)
  ) {
    out.push({
      request: { kind: 'oppose_legislation', params: { billId: bill.id, lobbyTargetIds: [] } },
      values: [
        {
          key: 'ideologicalFit',
          value: clamp(-selfU, 0, 1) * 0.6,
          reason: 'thinks the bill is wrong',
        },
        { key: 'riskOfWhipAnger', value: -0.25, reason: riskReason(npc) },
      ],
    });
  }
  const contacts = env.contacts.get(npc.id) ?? [];
  if (contacts.length > 0) {
    const target = contacts[env.rng.int(0, contacts.length - 1)];
    if (target) {
      out.push({
        request: { kind: 'meet_politician', params: { targetId: target } },
        values: [{ key: 'relationshipValue', value: 0.22, reason: 'keeping in touch' }],
      });
    }
  }
  return out;
}

const GENERATORS = [
  whipDutyCandidates,
  factionCandidates,
  careeristCandidates,
  hedgerCandidates,
  oppositionCandidates,
  primeMinisterCandidates,
  genericCandidates,
];

/**
 * Utility-based planner (doc 03 §6, ADR-0010): enumerate bounded candidates from position-based
 * generators, validate them with the shared action definitions, score
 * Σ weight(traits) × consideration − cost (+ tiny jitter), then fill the diary greedily.
 */
export class UtilityMind implements PoliticianMind {
  plan(state: GameState, npcId: PoliticianId, env: MindEnv): AiPlan[] {
    const npc = getPolitician(state, npcId);
    const division = env.forecast?.division ?? null;
    const bill = division ? getBill(state, division.billId) : null;
    const decision = env.forecast?.decisions.get(npcId);
    const c: CandidateCtx = {
      state,
      npc,
      env,
      division,
      bill,
      selfU: decision ? decision.breakdown.utility : null,
      whipDir: bill ? (whipFor(bill, npc)?.direction ?? null) : null,
      isGov: isGovernmentParty(state, npc.partyId),
    };
    const content = env.ctx.content;
    const budget = {
      slotsAvailable: NPC_DIARY_SLOTS,
      capitalAvailable: npc.politicalCapital,
      usedKeys: new Set<string>(),
    };
    const scored: AiPlan[] = [];
    for (const gen of GENERATORS) {
      for (const cand of gen(c)) {
        const v = validateRequest(state, npc, cand.request, budget, env.ctx);
        if (!v.ok) continue;
        const { total, scored: parts } = scoreConsiderations(npc, cand.values, content);
        const score = total - v.capitalCost * 0.12 - v.slots * 0.04 + env.rng.range(-0.03, 0.03);
        scored.push({
          action: v.action,
          label: v.label,
          slots: v.slots,
          capitalCost: v.capitalCost,
          reasons: topConsiderationReasons(parts),
          score,
        });
      }
    }
    scored.sort((a, b) => b.score - a.score || compareStrings(a.label, b.label));
    const chosen: AiPlan[] = [];
    let slots = NPC_DIARY_SLOTS;
    let capital = npc.politicalCapital;
    const used = new Set<string>();
    for (const p of scored) {
      if (p.score < ACT_THRESHOLD) break;
      const key = actionDedupKey(p.action);
      if (used.has(key) || p.slots > slots || p.capitalCost > capital) continue;
      // One public stance per bill per week, and never both support and opposition.
      if (
        (p.action.kind === 'support_legislation' || p.action.kind === 'oppose_legislation') &&
        used.has('legislation')
      )
        continue;
      used.add(key);
      if (p.action.kind === 'support_legislation' || p.action.kind === 'oppose_legislation')
        used.add('legislation');
      chosen.push(p);
      slots -= p.slots;
      capital -= p.capitalCost;
    }
    return chosen;
  }
}
