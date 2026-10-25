import {
  MAX_INTEL_ITEMS,
  MAX_MEMORIES_PER_EDGE,
  REBELLION_WINDOW_TURNS,
  relationshipKey,
  type Audience,
  type CareerEntry,
  type CareerEntryKind,
  type Effect,
  type EventInstanceId,
  type GameState,
  type OfficeKey,
  type Politician,
  type PoliticianId,
  type Relationship,
} from '@whip/domain';
import { CAPITAL_CAP } from '../careers/capital';
import { stageLabel, VOTE_LABEL } from '../chronicle/templates';
import { defaultRelationship } from '../relationships/relationships';
import {
  clamp,
  displayName,
  findPolitician,
  getBill,
  getConstituency,
  getPolitician,
  isGovernmentOffice,
  nameOf,
  round,
  signed,
} from '../state/access';
import { nextId } from '../state/ids';
import type { TurnContext } from '../turn/context';

export interface ApplyResult {
  effectId: string;
  /** Human-readable lines ("Bernadette Walsh: trust +6"); empty when nothing visible changed. */
  lines: string[];
}

const AUDIENCE_LABEL: Record<Audience, string> = {
  public: 'public',
  party_members: 'party members',
  colleagues: 'colleagues',
  media: 'media',
  whips: 'whips',
};

function isPlayer(state: GameState, id: PoliticianId): boolean {
  return state.player.politicianId === id;
}

/** "You" for the player, otherwise the display name. */
function who(state: GameState, id: PoliticianId): string {
  return isPlayer(state, id) ? 'You' : nameOf(state, id);
}

function getOrCreateEdge(draft: GameState, from: PoliticianId, to: PoliticianId): Relationship {
  const key = relationshipKey(from, to);
  let edge = draft.relationships.edges[key];
  if (!edge) {
    edge = defaultRelationship(draft, from, to);
    draft.relationships.edges[key] = edge;
  }
  return edge;
}

function applyRelationship(
  draft: GameState,
  e: Extract<Effect, { kind: 'relationship.adjust' }>,
  tc: TurnContext,
  effectId: string,
): string[] {
  if (e.from === e.to) return [];
  if (!findPolitician(draft, e.from) || !findPolitician(draft, e.to)) return [];
  const edge = getOrCreateEdge(draft, e.from, e.to);
  const before = { trust: edge.trust, respect: edge.respect, affinity: edge.affinity };
  edge.trust = clamp(Math.round(edge.trust + e.trust), -100, 100);
  edge.respect = clamp(Math.round(edge.respect + e.respect), -100, 100);
  edge.affinity = clamp(Math.round(edge.affinity + e.affinity), -100, 100);
  edge.obligation = Math.round(edge.obligation + e.obligation);
  edge.rivalry = clamp(Math.round(edge.rivalry + e.rivalry), 0, 3);
  if (e.memory) {
    edge.memories.push({
      turn: tc.turn,
      kind: e.memory.kind,
      weight: clamp(e.memory.weight, -100, 100),
      decaysBy: e.memory.decaysBy,
      refId: e.memory.refId,
    });
    if (edge.memories.length > MAX_MEMORIES_PER_EDGE) {
      // Drop the weakest memory (ties: oldest), keeping order of the rest.
      let idx = 0;
      for (let i = 1; i < edge.memories.length; i++) {
        const m = edge.memories[i];
        const w = edge.memories[idx];
        if (m && w && Math.abs(m.weight) < Math.abs(w.weight)) idx = i;
      }
      edge.memories.splice(idx, 1);
    }
  }
  const dT = edge.trust - before.trust;
  const dR = edge.respect - before.respect;
  const dA = edge.affinity - before.affinity;
  const parts: string[] = [];
  if (dT !== 0) parts.push(`trust ${signed(dT)}`);
  if (dR !== 0) parts.push(`respect ${signed(dR)}`);
  if (dA !== 0) parts.push(`affinity ${signed(dA)}`);
  if (e.obligation !== 0)
    parts.push(
      e.obligation > 0
        ? `owes ${e.obligation} favour${e.obligation > 1 ? 's' : ''}`
        : `is owed ${-e.obligation}`,
    );
  if (parts.length === 0) return [];

  // Notable relationship change (|Δ| ≥ 10) becomes a history record (07 §4.6).
  const biggest = Math.max(Math.abs(dT), Math.abs(dR), Math.abs(dA));
  if (biggest >= 10) {
    const warmed = dT + dR + dA > 0;
    const involvesPlayer = isPlayer(draft, e.from) || isPlayer(draft, e.to);
    tc.record(draft, {
      type: 'relationship_change',
      payload: { from: e.from, to: e.to, trust: dT, respect: dR, affinity: dA },
      importance: involvesPlayer ? 2 : 1,
      template: warmed ? 'relationship.warmed' : 'relationship.soured',
      vars: {
        actor: nameOf(draft, e.from),
        target: nameOf(draft, e.to),
        detail: `${parts.join(', ')} (${e.reason})`,
      },
      actorIds: [e.from],
      subjectIds: [e.to],
      effectIds: [effectId],
    });
  }
  if (isPlayer(draft, e.to)) return [`${nameOf(draft, e.from)}: ${parts.join(', ')}`];
  if (isPlayer(draft, e.from)) return [`Your view of ${nameOf(draft, e.to)}: ${parts.join(', ')}`];
  return [`${nameOf(draft, e.from)} → ${nameOf(draft, e.to)}: ${parts.join(', ')}`];
}

const PRIME_MINISTER = 'office.prime_minister' as OfficeKey;
const CHIEF_WHIP = 'office.chief_whip' as OfficeKey;
const LEADER_OF_OPPOSITION = 'office.leader_of_opposition' as OfficeKey;

/**
 * Career entry kinds that are never trimmed (posts held, elections, rebellions, refusals). Only
 * routine entries (endorsements) are capped, so a decades-long career keeps its milestones.
 */
const ROUTINE_CAREER_KINDS: ReadonlySet<CareerEntryKind> = new Set<CareerEntryKind>(['endorsed']);
/** Routine (non-milestone) career entries kept per politician, newest last. */
export const MAX_ROUTINE_CAREER_ENTRIES = 12;

/** Append a career entry, dropping the oldest routine entries beyond the cap. */
export function pushCareer(p: Politician, entry: CareerEntry): void {
  p.career.push(entry);
  let routine = 0;
  for (const c of p.career) if (ROUTINE_CAREER_KINDS.has(c.kind)) routine += 1;
  if (routine <= MAX_ROUTINE_CAREER_ENTRIES) return;
  let drop = routine - MAX_ROUTINE_CAREER_ENTRIES;
  p.career = p.career.filter((c) => {
    if (drop > 0 && ROUTINE_CAREER_KINDS.has(c.kind)) {
      drop -= 1;
      return false;
    }
    return true;
  });
}

/**
 * Drop rebellion records older than REBELLION_WINDOW_TURNS (the lifetime total stays in
 * `rebellionCount`). Called on every new record and by the end-of-turn compaction.
 */
export function pruneRebellions(p: Politician, turn: number): void {
  const minTurn = turn - REBELLION_WINDOW_TURNS;
  if (p.rebellions.some((r) => r.turn <= minTurn))
    p.rebellions = p.rebellions.filter((r) => r.turn > minTurn);
}

/**
 * Offices that mirror a pointer elsewhere in the state: the PM (`government.primeMinisterId` and
 * their party's leader), the Chief Whip (`party.chiefWhipId`) and the Leader of the Opposition
 * (their party's leader). Kept in sync on appointment…
 */
function setRolePointers(draft: GameState, officeKey: OfficeKey, p: Politician): void {
  const party = p.partyId !== null ? draft.parties.byId[p.partyId] : undefined;
  if (officeKey === PRIME_MINISTER) {
    draft.government.primeMinisterId = p.id;
    if (party) party.leaderId = p.id;
  } else if (officeKey === CHIEF_WHIP) {
    if (party) party.chiefWhipId = p.id;
  } else if (officeKey === LEADER_OF_OPPOSITION) {
    if (party) party.leaderId = p.id;
  }
}

/** …and cleared when the holder leaves (the PM is only ever replaced, never cleared). */
function clearRolePointers(draft: GameState, officeKey: OfficeKey, holderId: PoliticianId): void {
  if (officeKey !== CHIEF_WHIP && officeKey !== LEADER_OF_OPPOSITION) return;
  for (const pid of draft.parties.ids) {
    const party = draft.parties.byId[pid];
    if (!party) continue;
    if (officeKey === CHIEF_WHIP && party.chiefWhipId === holderId) party.chiefWhipId = null;
    if (officeKey === LEADER_OF_OPPOSITION && party.leaderId === holderId) party.leaderId = null;
  }
}

function vacate(
  draft: GameState,
  officeKey: OfficeKey,
  reason: 'resigned' | 'sacked' | 'moved',
  note: string,
  tc: TurnContext,
  effectId: string,
): string[] {
  const table = isGovernmentOffice(draft, officeKey)
    ? draft.government.appointments
    : draft.parliament.oppositionAppointments;
  const holderId = table[officeKey] ?? null;
  if (holderId === null) return [];
  // The premiership is never left vacant: it changes hands only by `appoint` (which moves the
  // previous holder out). Leadership contests that could empty it are future work.
  if (officeKey === PRIME_MINISTER && reason !== 'moved') return [];
  table[officeKey] = null;
  const holder = getPolitician(draft, holderId);
  holder.offices = holder.offices.filter((o) => o.officeKey !== officeKey);
  clearRolePointers(draft, officeKey, holderId);
  const def = tc.content.offices[officeKey];
  const label = def?.label ?? officeKey;
  pushCareer(holder, {
    date: tc.date,
    turn: tc.turn,
    kind: reason,
    officeKey,
    text:
      reason === 'moved'
        ? `Left the post of ${label} (moved)`
        : reason === 'resigned'
          ? `Resigned as ${label}`
          : `Sacked as ${label}`,
  });
  if (reason !== 'moved') {
    const importance =
      def?.kind === 'pps' ? (holder.isPlayer ? 4 : 2) : def?.kind === 'cabinet' ? 4 : 3;
    tc.record(draft, {
      type: reason === 'resigned' ? 'resignation' : 'dismissal',
      payload: { officeKey, politicianId: holderId, reason: note },
      importance,
      template: reason === 'resigned' ? 'resignation' : 'dismissal',
      vars: { actor: displayName(holder), office: label, detail: note },
      actorIds: [holderId],
      subjectIds: [officeKey],
      effectIds: [effectId],
    });
    if (holder.isPlayer) {
      tc.notify(draft, {
        severity: 'critical',
        title:
          reason === 'resigned' ? `You resigned as ${label}` : `You have been sacked as ${label}`,
        body:
          reason === 'resigned'
            ? `${note}. The back benches have kept your seat warm.`
            : `${note}. Someone else already has your lanyard.`,
        link: { kind: 'politician', id: holderId },
      });
    }
  }
  return [`${displayName(holder)} leaves the post of ${label}`];
}

function appoint(
  draft: GameState,
  officeKey: OfficeKey,
  pid: PoliticianId,
  reasonText: string,
  tc: TurnContext,
  effectId: string,
): string[] {
  const gov = isGovernmentOffice(draft, officeKey);
  const table = gov ? draft.government.appointments : draft.parliament.oppositionAppointments;
  if (!(officeKey in table)) throw new Error(`Office ${officeKey} is not in play`);
  const previous = table[officeKey] ?? null;
  if (previous === pid) return [];
  const lines: string[] = [];
  if (previous !== null)
    lines.push(...vacate(draft, officeKey, 'moved', 'Moved in a reshuffle', tc, effectId));
  const p = getPolitician(draft, pid);
  // One government post at a time: leaving a PPS job to become a minister, etc.
  for (const o of p.offices.slice()) {
    if (gov && isGovernmentOffice(draft, o.officeKey) && o.officeKey !== 'office.prime_minister') {
      lines.push(...vacate(draft, o.officeKey, 'moved', 'Promoted', tc, effectId));
    }
  }
  table[officeKey] = pid;
  p.offices.push({ officeKey, since: tc.date });
  const def = tc.content.offices[officeKey];
  const label = def?.label ?? officeKey;
  pushCareer(p, {
    date: tc.date,
    turn: tc.turn,
    kind: 'appointed',
    officeKey,
    text: `Appointed ${label}`,
  });
  setRolePointers(draft, officeKey, p);
  const importance =
    def?.kind === 'pps'
      ? p.isPlayer
        ? 4
        : 2
      : def?.kind === 'cabinet' || def?.kind === 'whip'
        ? 4
        : 3;
  tc.record(draft, {
    type: 'appointment',
    payload: { officeKey, politicianId: pid, previousHolderId: previous },
    importance,
    template: 'appointment',
    vars: { actor: displayName(p), office: label, detail: reasonText },
    actorIds: [pid],
    subjectIds: [officeKey],
    effectIds: [effectId],
  });
  if (p.isPlayer) {
    tc.notify(draft, {
      severity: 'good',
      title: `You are now ${label}`,
      body: `${reasonText}. Congratulations, and welcome to collective responsibility.`,
      link: { kind: 'politician', id: pid },
    });
  } else if (importance >= 3 || def?.kind === 'pps') {
    tc.notify(draft, {
      severity: 'info',
      title: `${displayName(p)} appointed ${label}`,
      body: `${reasonText}. Colleagues offered warm congratulations and cold assessments.`,
      link: { kind: 'politician', id: pid },
    });
  }
  lines.push(`${who(draft, pid)} appointed ${label}`);
  return lines;
}

/**
 * The single effect interpreter (ADR-0009). Mutates the draft; returns display lines. Effects whose
 * referents no longer exist are ignored rather than throwing, because scheduled effects can outlive
 * their subjects.
 */
export function applyEffect(
  draft: GameState,
  effect: Effect,
  tc: TurnContext,
  effectId: string,
): ApplyResult {
  const lines = applyInner(draft, effect, tc, effectId);
  return { effectId, lines };
}

function applyInner(draft: GameState, e: Effect, tc: TurnContext, effectId: string): string[] {
  switch (e.kind) {
    case 'relationship.adjust':
      return applyRelationship(draft, e, tc, effectId);

    case 'reputation.adjust': {
      const p = findPolitician(draft, e.politicianId);
      if (!p) return [];
      const before = p.reputation[e.audience];
      p.reputation[e.audience] = clamp(Math.round(before + e.delta), -100, 100);
      const d = p.reputation[e.audience] - before;
      if (d === 0) return [];
      return [
        isPlayer(draft, p.id)
          ? `Reputation with ${AUDIENCE_LABEL[e.audience]} ${signed(d)}`
          : `${displayName(p)}: reputation with ${AUDIENCE_LABEL[e.audience]} ${signed(d)}`,
      ];
    }

    case 'capital.adjust': {
      const p = findPolitician(draft, e.politicianId);
      if (!p) return [];
      const before = p.politicalCapital;
      p.politicalCapital = clamp(Math.round(before + e.delta), 0, CAPITAL_CAP);
      const d = p.politicalCapital - before;
      if (d === 0) return [];
      return [
        isPlayer(draft, p.id)
          ? `Political capital ${signed(d)}`
          : `${displayName(p)}: political capital ${signed(d)}`,
      ];
    }

    case 'loyalty.adjust': {
      const p = findPolitician(draft, e.politicianId);
      if (!p) return [];
      const before = p.partyLoyalty;
      p.partyLoyalty = clamp(Math.round(before + e.delta), -100, 100);
      const d = p.partyLoyalty - before;
      if (d === 0) return [];
      return [
        isPlayer(draft, p.id)
          ? `Party loyalty ${signed(d)}`
          : `${displayName(p)}: party loyalty ${signed(d)}`,
      ];
    }

    case 'local_standing.adjust': {
      const p = findPolitician(draft, e.politicianId);
      if (!p) return [];
      const before = p.localStanding;
      p.localStanding = clamp(Math.round(before + e.delta), -100, 100);
      const d = p.localStanding - before;
      if (d === 0) return [];
      const seat = p.constituencyId
        ? getConstituency(draft, p.constituencyId).name
        : 'the constituency';
      return [
        isPlayer(draft, p.id)
          ? `Standing in ${seat} ${signed(d)}`
          : `${displayName(p)}: standing in ${seat} ${signed(d)}`,
      ];
    }

    case 'division.pressure': {
      const div = draft.parliament.divisions.byId[e.divisionId];
      if (!div || div.status !== 'scheduled' || !findPolitician(draft, e.targetId)) return [];
      const pr = div.pressure[e.targetId] ?? { total: 0, bySource: {} };
      pr.total = round(pr.total + e.delta, 4);
      pr.bySource[e.sourceId] = round((pr.bySource[e.sourceId] ?? 0) + e.delta, 4);
      div.pressure[e.targetId] = pr;
      const dir = e.delta > 0 ? 'aye' : 'no';
      return [
        `${who(draft, e.targetId)}: pushed towards ${VOTE_LABEL[dir]} (${signed(round(e.delta, 2))})`,
      ];
    }

    case 'division.declare': {
      const div = draft.parliament.divisions.byId[e.divisionId];
      if (!div || div.status !== 'scheduled') return [];
      const current = div.declarations[e.politicianId];
      const rank = { rebellion: 3, statement: 2, promise: 1 } as const;
      if (current && rank[current.source] > rank[e.source]) return [];
      div.declarations[e.politicianId] = { vote: e.vote, source: e.source, turn: tc.turn };
      const stage = stageLabel(div.stage);
      return [
        isPlayer(draft, e.politicianId)
          ? `You will vote ${VOTE_LABEL[e.vote]} at ${stage}`
          : `${nameOf(draft, e.politicianId)} will vote ${VOTE_LABEL[e.vote]} at ${stage}`,
      ];
    }

    case 'division.whip_intel': {
      const div = draft.parliament.divisions.byId[e.divisionId];
      if (!div || div.status !== 'scheduled') return [];
      div.whipIntel[e.politicianId] = e.vote;
      return isPlayer(draft, e.politicianId)
        ? [`The whips now expect you to vote ${VOTE_LABEL[e.vote]}`]
        : [];
    }

    case 'division.whip_attention': {
      const div = draft.parliament.divisions.byId[e.divisionId];
      if (!div || div.status !== 'scheduled') return [];
      div.whipAttention[e.politicianId] = (div.whipAttention[e.politicianId] ?? 0) + 1;
      return [];
    }

    case 'knowledge.intention': {
      const k = draft.player.knowledge.intentions;
      const forPol = k[e.politicianId] ?? {};
      forPol[e.divisionId] = { value: e.value, asOfTurn: tc.turn, source: e.source };
      k[e.politicianId] = forPol;
      const div = draft.parliament.divisions.byId[e.divisionId];
      return [
        `${nameOf(draft, e.politicianId)} intends to vote ${VOTE_LABEL[e.value]}${div ? ` at ${stageLabel(div.stage)}` : ''}`,
      ];
    }

    case 'knowledge.intel': {
      const item = { turn: tc.turn, text: e.text, politicianId: e.politicianId };
      draft.player.knowledge.intel.push(item);
      if (draft.player.knowledge.intel.length > MAX_INTEL_ITEMS) {
        draft.player.knowledge.intel.splice(
          0,
          draft.player.knowledge.intel.length - MAX_INTEL_ITEMS,
        );
      }
      tc.intel.push(item);
      return [];
    }

    case 'endorsement.add': {
      const p = findPolitician(draft, e.endorseeId);
      if (!p || p.endorsedBy.includes(e.endorserId)) return [];
      p.endorsedBy = [...p.endorsedBy, e.endorserId].sort();
      return [
        `${nameOf(draft, e.endorserId)} endorses ${isPlayer(draft, p.id) ? 'you' : displayName(p)}`,
      ];
    }

    case 'career.request_promotion': {
      if (draft.careers.promotionRequests.some((r) => r.politicianId === e.politicianId)) return [];
      draft.careers.promotionRequests.push({ politicianId: e.politicianId, turn: tc.turn });
      draft.careers.lastPromotionRequestTurn[e.politicianId] = tc.turn;
      return ['Promotion request lodged with the whips, who will "bear it in mind"'];
    }

    case 'career.call_reshuffle':
      draft.careers.reshuffleRequestedTurn = tc.turn;
      return ['A reshuffle will take place this week'];

    case 'career.record': {
      const p = findPolitician(draft, e.politicianId);
      if (!p) return [];
      pushCareer(p, {
        date: tc.date,
        turn: tc.turn,
        kind: e.entryKind,
        officeKey: e.officeKey,
        text: e.text,
      });
      return [];
    }

    case 'rebellion.record': {
      const p = findPolitician(draft, e.politicianId);
      if (!p) return [];
      p.rebellions.push({
        divisionId: e.divisionId,
        vote: e.vote,
        turn: tc.turn,
        whipLine: e.whipLine,
      });
      p.rebellionCount += 1;
      pruneRebellions(p, tc.turn);
      tc.rebelsThisTurn.add(p.id);
      return [];
    }

    case 'promise.check':
      return checkPromise(draft, e, tc, effectId);

    case 'government.stability': {
      const before = draft.government.stability;
      draft.government.stability = clamp(Math.round(before + e.delta), -100, 100);
      const d = draft.government.stability - before;
      return d === 0 ? [] : [`Government stability ${signed(d)}`];
    }

    case 'bill.amend': {
      const bill = draft.parliament.bills.byId[e.billId];
      if (!bill) return [];
      const from = bill.issues[e.issueKey] ?? 0;
      if (from === e.stance) return [];
      bill.issues[e.issueKey] = e.stance;
      bill.amendments.push({
        turn: tc.turn,
        issueKey: e.issueKey,
        from,
        to: e.stance,
        reason: e.reason,
      });
      const label = tc.content.issues[e.issueKey]?.label ?? e.issueKey;
      return [`${bill.title}: ${label.toLowerCase()} ${signed(from)} → ${signed(e.stance)}`];
    }

    case 'faction.cohesion': {
      const f = draft.factions.byId[e.factionId];
      if (!f) return [];
      const before = f.cohesion;
      f.cohesion = round(clamp(before + e.delta, 0, 1), 3);
      const d = Math.round((f.cohesion - before) * 100);
      return d === 0 ? [] : [`${f.name} cohesion ${signed(d)}%`];
    }

    case 'diary.adjust_slots':
      // Consumed at its due turn; the diary capacity for that week already counted it (see
      // selectors.diaryCapacity), so applying it only records the line.
      return isPlayer(draft, e.politicianId)
        ? [
            `Diary ${signed(e.delta)} slot${Math.abs(e.delta) === 1 ? '' : 's'} this week (${e.reason})`,
          ]
        : [];

    case 'office.appoint':
      return appoint(draft, e.officeKey, e.politicianId, e.reason, tc, effectId);

    case 'office.vacate':
      return vacate(draft, e.officeKey, e.reason, e.note, tc, effectId);

    case 'event.raise':
      return raiseEvent(draft, e, tc);

    case 'event.resolve': {
      const idx = draft.events.pending.findIndex((ev) => ev.id === e.eventId);
      if (idx < 0) return [];
      const ev = draft.events.pending[idx];
      if (!ev) return [];
      ev.status = e.expired ? 'expired' : 'resolved';
      ev.resolution = { optionKey: e.optionKey, turn: tc.turn };
      draft.events.pending.splice(idx, 1);
      return [];
    }
  }
}

function raiseEvent(
  draft: GameState,
  e: Extract<Effect, { kind: 'event.raise' }>,
  tc: TurnContext,
): string[] {
  const def = tc.content.events[e.definitionKey];
  if (!def || !findPolitician(draft, e.addresseeId)) return [];
  const id = nextId<EventInstanceId>(draft, 'evt');
  const instance = {
    id,
    definitionKey: e.definitionKey,
    raisedTurn: tc.turn,
    expiresTurn: tc.turn + def.expiresAfterWeeks,
    addresseeId: e.addresseeId,
    subjects: e.subjects,
    status: 'pending' as const,
    resolution: null,
  };
  draft.events.pending.push(instance);
  draft.events.cooldowns[`${def.key}:${e.addresseeId}`] = tc.turn + def.cooldownWeeks;
  draft.events.cooldowns[def.key] = Math.max(
    draft.events.cooldowns[def.key] ?? 0,
    tc.turn + (def.audience === 'npc' ? def.cooldownWeeks : 0),
  );
  tc.raisedEvents.push(instance);
  if (isPlayer(draft, e.addresseeId)) {
    tc.notify(draft, {
      severity: 'warning',
      title: def.title,
      body: 'A decision is waiting for you. It will not wait long.',
      link: { kind: 'event', id },
    });
  }
  return [];
}

function checkPromise(
  draft: GameState,
  e: Extract<Effect, { kind: 'promise.check' }>,
  tc: TurnContext,
  effectId: string,
): string[] {
  const div = draft.parliament.divisions.byId[e.divisionId];
  if (!div?.result) return [];
  const actual = div.result.votes[e.promiserId];
  if (actual === undefined) return [];
  const kept = actual === e.vote;
  const bill = getBill(draft, div.billId);
  const lines = tc.emit(draft, {
    kind: 'relationship.adjust',
    from: e.promiseeId,
    to: e.promiserId,
    trust: kept ? 8 : -30,
    respect: kept ? 2 : -5,
    affinity: kept ? 4 : -10,
    obligation: 0,
    rivalry: 0,
    memory: kept
      ? { kind: 'kept_promise', weight: 20, decaysBy: 1, refId: div.id }
      : { kind: 'broke_promise', weight: -50, decaysBy: 0.5, refId: div.id },
    reason: kept ? 'kept a promise' : 'broke a promise',
  }).lines;
  const involvesPlayer = isPlayer(draft, e.promiserId) || isPlayer(draft, e.promiseeId);
  tc.record(draft, {
    type: 'promise',
    payload: {
      promiserId: e.promiserId,
      promiseeId: e.promiseeId,
      divisionId: div.id,
      vote: e.vote,
      kept,
    },
    importance: involvesPlayer ? 3 : 1,
    template: kept ? 'promise.kept' : 'promise.broken',
    vars: {
      promiser: nameOf(draft, e.promiserId),
      promisee: nameOf(draft, e.promiseeId),
      vote: VOTE_LABEL[e.vote],
      bill: bill.title,
    },
    actorIds: [e.promiserId],
    subjectIds: [e.promiseeId, div.id],
    effectIds: [effectId],
  });
  if (isPlayer(draft, e.promiserId)) {
    tc.notify(draft, {
      severity: kept ? 'good' : 'critical',
      title: kept
        ? `You kept your word to ${nameOf(draft, e.promiseeId)}`
        : `${nameOf(draft, e.promiseeId)} will not forget your broken promise`,
      body: kept
        ? 'Trust earned is trust banked.'
        : `You promised to vote ${VOTE_LABEL[e.vote]} and did not. They have a long memory and a short list.`,
      link: { kind: 'politician', id: e.promiseeId },
    });
  }
  return lines;
}
