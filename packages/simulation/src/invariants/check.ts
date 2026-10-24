import { AUDIENCES, SKILL_KEYS, type GameState, type OfficeKey, type PartyId } from '@whip/domain';
import type { SimulationContext } from '../context';
import { diaryCapacity } from '../actions/plan';
import { CAPITAL_CAP } from '../careers/capital';
import { eligibleVoterIds } from '../ai/forecast';
import { isGovernmentParty, isSitting, sortedKeys } from '../state/access';

export interface InvariantViolation {
  code: string;
  message: string;
}

export class InvariantError extends Error {
  readonly violations: InvariantViolation[];
  constructor(violations: InvariantViolation[]) {
    super(
      `State invariants violated: ${violations
        .slice(0, 5)
        .map((v) => v.message)
        .join('; ')}`,
    );
    this.name = 'InvariantError';
    this.violations = violations;
  }
}

const PRIME_MINISTER = 'office.prime_minister' as OfficeKey;
const CHIEF_WHIP = 'office.chief_whip' as OfficeKey;

function inRange(v: number, min: number, max: number): boolean {
  return Number.isFinite(v) && v >= min && v <= max;
}

/** doc 03 §10 invariants, plus structural consistency of indexes and mirrors. Pure. */
export function checkInvariants(state: GameState, ctx?: SimulationContext): InvariantViolation[] {
  const out: InvariantViolation[] = [];
  const v = (code: string, message: string) => out.push({ code, message });

  // Sorted id indexes match their tables.
  for (const [name, table] of [
    ['politicians', state.politicians],
    ['parties', state.parties],
    ['factions', state.factions],
    ['constituencies', state.constituencies],
    ['bills', state.parliament.bills],
    ['divisions', state.parliament.divisions],
  ] as const) {
    const keys = Object.keys(table.byId).sort();
    const ids = table.ids as readonly string[];
    if (keys.length !== ids.length || keys.some((k, i) => k !== ids[i]))
      v('index', `${name}.ids is not the sorted key set of ${name}.byId`);
  }

  // Constituencies ↔ MPs.
  const seen = new Map<string, string>();
  for (const cid of state.constituencies.ids) {
    const c = state.constituencies.byId[cid];
    if (!c || c.currentMpId === null) continue;
    const mp = state.politicians.byId[c.currentMpId];
    if (!mp) v('constituency_mp', `${cid} points at missing MP ${c.currentMpId}`);
    else if (mp.constituencyId !== cid || !isSitting(mp))
      v('constituency_mp', `${cid}'s MP ${mp.id} does not point back`);
    if (seen.has(c.currentMpId)) v('constituency_mp', `${c.currentMpId} is MP for two seats`);
    seen.set(c.currentMpId, cid);
  }
  for (const id of state.politicians.ids) {
    const p = state.politicians.byId[id];
    if (!p) continue;
    if (
      isSitting(p) &&
      p.constituencyId !== null &&
      state.constituencies.byId[p.constituencyId]?.currentMpId !== id
    ) {
      v('constituency_mp', `${id} claims ${p.constituencyId} but the seat disagrees`);
    }
    if (
      p.politicalCapital < 0 ||
      p.politicalCapital > CAPITAL_CAP ||
      !Number.isInteger(p.politicalCapital)
    )
      v('capital', `${id} has invalid capital ${p.politicalCapital}`);
    for (const a of AUDIENCES)
      if (!inRange(p.reputation[a], -100, 100)) v('range', `${id} reputation.${a} out of range`);
    for (const s of SKILL_KEYS)
      if (!inRange(p.skills[s], 1, 20)) v('range', `${id} skill ${s} out of range`);
    if (!inRange(p.partyLoyalty, -100, 100)) v('range', `${id} loyalty out of range`);
    if (!inRange(p.localStanding, -100, 100)) v('range', `${id} local standing out of range`);
    if (!inRange(p.ideology.economic, -100, 100) || !inRange(p.ideology.social, -100, 100))
      v('range', `${id} ideology out of range`);
    for (const [k, s] of Object.entries(p.stances))
      if (s === undefined || !inRange(s, -2, 2)) v('range', `${id} stance ${k} out of range`);
    // Office holdings mirror the appointment tables.
    for (const o of p.offices) {
      const holder =
        state.government.appointments[o.officeKey] ??
        state.parliament.oppositionAppointments[o.officeKey];
      if (o.officeKey === 'office.speaker') {
        if (state.parliament.speakerId !== id)
          v('office_mirror', `${id} holds the Speakership but is not the Speaker`);
      } else if (holder !== id)
        v(
          'office_mirror',
          `${id} holds ${o.officeKey} but the appointment table says ${String(holder)}`,
        );
    }
  }

  // Seat totals = sitting MPs per party.
  const counts: Record<PartyId, number> = {};
  for (const id of state.politicians.ids) {
    const p = state.politicians.byId[id];
    if (p && isSitting(p) && p.partyId !== null) counts[p.partyId] = (counts[p.partyId] ?? 0) + 1;
  }
  for (const pid of state.parties.ids) {
    if ((state.parliament.seats[pid] ?? 0) !== (counts[pid] ?? 0))
      v(
        'seats',
        `Seat total for ${pid} is ${state.parliament.seats[pid] ?? 0}, but ${counts[pid] ?? 0} MPs sit`,
      );
  }

  // Government appointments are held by sitting members of a governing party.
  for (const key of sortedKeys(state.government.appointments) as OfficeKey[]) {
    const holder = state.government.appointments[key];
    if (holder === null || holder === undefined) continue;
    const p = state.politicians.byId[holder];
    if (!p || !isSitting(p) || !isGovernmentParty(state, p.partyId))
      v('appointment', `${key} is held by ${holder}, who is not a sitting government MP`);
    else if (!p.offices.some((o) => o.officeKey === key))
      v('office_mirror', `${key} holder ${holder} lacks the holding`);
  }
  // Role pointers mirror the offices: the PM holds the premiership and leads their party; a
  // governing party's Chief Whip holds the Chief Whip's office. (Opposition chief whips are a party
  // role without a government office in the slice.)
  const pmId = state.government.primeMinisterId;
  if (state.government.appointments[PRIME_MINISTER] !== pmId)
    v(
      'role_pointer',
      `government.primeMinisterId is ${pmId} but office.prime_minister is held by ${String(state.government.appointments[PRIME_MINISTER])}`,
    );
  const pmParty = state.politicians.byId[pmId]?.partyId;
  if (pmParty && state.parties.byId[pmParty]?.leaderId !== pmId)
    v('role_pointer', `The Prime Minister ${pmId} does not lead ${pmParty}`);
  for (const partyId of state.parliament.governmentPartyIds) {
    const cw = state.parties.byId[partyId]?.chiefWhipId ?? null;
    if (cw !== null && state.government.appointments[CHIEF_WHIP] !== cw)
      v('role_pointer', `${partyId}.chiefWhipId is ${cw}, who does not hold office.chief_whip`);
  }

  for (const key of sortedKeys(state.parliament.oppositionAppointments) as OfficeKey[]) {
    const holder = state.parliament.oppositionAppointments[key];
    if (holder === null || holder === undefined) continue;
    const p = state.politicians.byId[holder];
    if (!p || !p.offices.some((o) => o.officeKey === key))
      v('office_mirror', `${key} holder ${holder} lacks the holding`);
  }

  // Relationships: endpoints exist, keys match, no self-edges, values bounded.
  for (const key of sortedKeys(state.relationships.edges)) {
    const e = state.relationships.edges[key];
    if (!e) continue;
    if (key !== `${e.from}>${e.to}`)
      v('relationship', `Edge key ${key} does not match ${e.from}>${e.to}`);
    if (e.from === e.to) v('relationship', `Self-edge on ${e.from}`);
    if (!state.politicians.byId[e.from] || !state.politicians.byId[e.to])
      v('relationship', `Edge ${key} has a missing endpoint`);
    if (
      !inRange(e.trust, -100, 100) ||
      !inRange(e.respect, -100, 100) ||
      !inRange(e.affinity, -100, 100) ||
      !inRange(e.rivalry, 0, 3)
    ) {
      v('range', `Edge ${key} out of range`);
    }
  }

  // Division results: counts sum to eligible voters; the Speaker never votes.
  for (const did of state.parliament.divisions.ids) {
    const d = state.parliament.divisions.byId[did];
    const r = d?.result;
    if (!d || !r) continue;
    if (r.ayes + r.noes + r.abstentions !== r.eligible)
      v('division', `${did}: ${r.ayes}+${r.noes}+${r.abstentions} ≠ eligible ${r.eligible}`);
    if (Object.keys(r.votes).length !== r.eligible)
      v(
        'division',
        `${did}: ${Object.keys(r.votes).length} recorded votes ≠ eligible ${r.eligible}`,
      );
    if (state.parliament.speakerId !== null && r.votes[state.parliament.speakerId] !== undefined)
      v('division', `${did}: the Speaker voted`);
  }

  // Factions ↔ members.
  for (const fid of state.factions.ids) {
    const f = state.factions.byId[fid];
    if (!f) continue;
    if (!inRange(f.cohesion, 0, 1)) v('range', `${fid} cohesion out of range`);
    for (const m of f.memberIds)
      if (state.politicians.byId[m]?.factionId !== fid)
        v('faction', `${m} listed in ${fid} but not a member`);
  }

  if (!inRange(state.government.stability, -100, 100))
    v('range', 'Government stability out of range');

  // Scheduled queue: nothing overdue, ordered by (dueTurn, id).
  for (let i = 0; i < state.scheduled.length; i++) {
    const s = state.scheduled[i];
    if (!s) continue;
    if (s.dueTurn < state.meta.turn)
      v(
        'scheduled',
        `Scheduled effect ${s.id} is overdue (due ${s.dueTurn}, turn ${state.meta.turn})`,
      );
    const prev = state.scheduled[i - 1];
    if (prev && (prev.dueTurn > s.dueTurn || (prev.dueTurn === s.dueTurn && prev.id > s.id)))
      v('scheduled', 'Scheduled queue out of order');
  }

  // Player diary within capacity.
  const used = state.player.plannedActions.reduce((n, a) => n + a.slots, 0);
  if (used > diaryCapacity(state))
    v('diary', `Player diary uses ${used} slots of ${diaryCapacity(state)}`);

  if (ctx) {
    const eligible = eligibleVoterIds(state).length;
    if (eligible <= 0) v('division', 'No eligible voters');
  }
  return out;
}
