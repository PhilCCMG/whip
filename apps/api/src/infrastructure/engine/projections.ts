import type {
  Article,
  CampaignSummary,
  CareerOverview,
  DivisionResult,
  Newspaper,
  ParliamentView,
  PartyView,
  PoliticianProfile,
  PoliticianSummarySchema,
  TurnReport,
} from '@whip/contracts';
import type {
  Division,
  GameState,
  Headline,
  HistoryRecord,
  MemoryKind,
  NewsArticle,
  NewspaperEdition,
  Notification,
  PartyId,
  PlannedAction,
  Politician,
  PoliticianId,
  Relationship,
  WhipInstruction,
} from '@whip/domain';
import {
  selectors,
  type DivisionReport,
  type InfluenceView,
  type SimulationResult,
} from '@whip/simulation';
import type { z } from 'zod';
import type {
  ActionCatalogueResponse,
  Diary,
  PoliticianListQuery,
  PoliticianListResponse,
} from '../../application/dto';
import type { HistoryRowInput, Projections } from '../../application/engine';
import { simulationContext } from './context';

type PoliticianSummary = z.infer<typeof PoliticianSummarySchema>;

/**
 * GameState → @whip/contracts DTOs (docs/architecture/05 §1). Pure functions over the engine's
 * selectors; never mutate the state (it is the DO's hot cache).
 *
 * Fog of war: anything about other MPs' voting intentions comes from the player's knowledge via
 * `selectors.knownIntention` / `divisionForecast`, never from vote utilities or whip intel.
 * Lists are filtered and paginated here so a response never carries the whole world.
 */

const MAX_NOTIFICATIONS = 20;
const MAX_INTEL = 20;
const MAX_RECENT_DIVISIONS = 5;
const POWER_MAP_SIZE = 12;
const KEY_RELATIONSHIPS = 8;
const CAREER_ENTRIES = 20;

const ctx = () => simulationContext();

function stageLabel(stage: string): string {
  return stage.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

const WHIP_LABELS: Record<WhipInstruction['line'], string> = {
  three_line: 'Three-line whip',
  two_line: 'Two-line whip',
  free: 'Free vote',
  none: 'No whip',
};

const MEMORY_TEXT: Record<MemoryKind, string> = {
  met: 'Met in person',
  worked_together: 'Worked together',
  flattered: 'Was flattered',
  endorsed: 'Endorsement given',
  refused_endorsement: 'Refused an endorsement',
  promised: 'A promise was made',
  kept_promise: 'Kept a promise',
  broke_promise: 'Broke a promise',
  rebelled: 'Rebelled against the whip',
  rebelled_together: 'Rebelled together',
  lobbied: 'Lobbied on a vote',
  stayed_loyal: 'Stayed loyal under pressure',
  appointed: 'Appointment',
  passed_over: 'Passed over for promotion',
  sacked: 'Sacked',
  warned_whips: 'Warned the whips',
  reassured_whips: 'Reassured the whips',
  new_intake: 'Same new intake',
  regional_group: 'Same regional group',
  faction_comrade: 'Faction comrades',
  old_colleague: 'Old colleagues',
};

/* ----------------------------------------------------------------------------- small helpers */

function pol(state: GameState, id: PoliticianId): Politician | null {
  return state.politicians.byId[id] ?? null;
}

function name(state: GameState, id: PoliticianId | null): string {
  if (id === null) return '';
  const p = pol(state, id);
  return p ? selectors.displayName(state, id) : String(id);
}

function relSummary(r: Relationship) {
  return {
    trust: Math.round(r.trust),
    respect: Math.round(r.respect),
    affinity: Math.round(r.affinity),
    obligation: r.obligation,
    rivalry: r.rivalry,
  };
}

function headline(h: Headline) {
  return {
    text: h.text,
    importance: h.importance,
    ...(h.standfirst ? { standfirst: h.standfirst } : {}),
  };
}

function article(a: NewsArticle): Article {
  return {
    id: a.id,
    headline: a.headline,
    ...(a.standfirst !== null ? { standfirst: a.standfirst } : {}),
    ...(a.byline !== null ? { byline: a.byline } : {}),
    ...(a.body !== null ? { body: a.body } : {}),
    importance: a.importance,
    filler: a.filler,
    refs: a.refs.map((r) => ({ kind: r.kind, id: r.id })),
  };
}

/** Engine edition → contracts' Newspaper (nulls become absent optional fields). */
function newspaper(e: NewspaperEdition): Newspaper {
  return {
    masthead: { ...e.masthead },
    lead: article(e.lead),
    sections: e.sections.map((s) => ({
      key: s.key,
      title: s.title,
      articles: s.articles.map(article),
    })),
  };
}

function notification(n: Notification) {
  return {
    id: n.id,
    turn: n.turn,
    severity: n.severity,
    title: n.title,
    body: n.body,
    ...(n.link ? { link: { kind: n.link.kind, id: n.link.id } } : {}),
  };
}

function traitsOf(p: Politician) {
  const { content } = ctx();
  return p.traits.map((key) => {
    const t = content.traits[key];
    return { key, label: t?.label ?? key, description: t?.description ?? '' };
  });
}

function plannedDto(a: PlannedAction) {
  return {
    id: a.id,
    kind: a.kind,
    label: a.label,
    slots: a.slots,
    capitalCost: a.capitalCost,
    params: a.params as unknown as Record<string, unknown>,
  };
}

function diaryOf(state: GameState): Diary {
  const d = selectors.diary(state);
  return { slotsTotal: d.slotsTotal, slotsUsed: d.slotsUsed, planned: d.planned.map(plannedDto) };
}

/** The next scheduled division (earliest first) — "the" upcoming vote for list intentions. */
function nextDivision(state: GameState): Division | null {
  let best: Division | null = null;
  for (const id of state.parliament.divisions.ids) {
    const d = state.parliament.divisions.byId[id];
    if (!d || d.status !== 'scheduled') continue;
    if (!best || d.turn < best.turn || (d.turn === best.turn && d.id < best.id)) best = d;
  }
  return best;
}

function divisionDto(r: DivisionReport): DivisionResult {
  return {
    id: r.divisionId,
    billId: r.billId,
    billTitle: r.billTitle,
    stage: stageLabel(r.stage),
    heldOn: r.heldOn,
    ayes: r.ayes,
    noes: r.noes,
    abstentions: r.abstentions,
    passed: r.passed,
    governmentWon: r.governmentWon,
    playerVote: r.playerVote,
    // Largest parties first (the engine lists them in id order).
    byParty: r.byParty
      .map((b) => ({ ...b }))
      .sort(
        (x, y) =>
          y.ayes + y.noes + y.abstentions - (x.ayes + x.noes + x.abstentions) ||
          x.partyId.localeCompare(y.partyId),
      ),
    rebels: r.rebels.map((rb) => ({
      id: rb.politicianId,
      name: rb.name,
      partyShort: rb.partyShort,
      vote: rb.vote,
      ...(rb.reason ? { reason: rb.reason } : {}),
    })),
  };
}

/* --------------------------------------------------------------------------- politicians */

interface SummaryCtx {
  state: GameState;
  playerId: PoliticianId;
  influence: Map<PoliticianId, InfluenceView>;
  next: Division | null;
}

function summaryOf(c: SummaryCtx, p: Politician): PoliticianSummary {
  const { state, playerId } = c;
  const party = p.partyId ? state.parties.byId[p.partyId] : undefined;
  const faction = p.factionId ? state.factions.byId[p.factionId] : undefined;
  const seat = p.constituencyId ? state.constituencies.byId[p.constituencyId] : undefined;
  const isPlayer = p.id === playerId;
  const sitting = p.status === 'mp' && p.constituencyId !== null;
  const intention =
    c.next && sitting && p.id !== state.parliament.speakerId
      ? selectors.knownIntention(state, playerId, p.id, c.next.id, ctx())
      : null;
  return {
    id: p.id,
    name: selectors.displayName(state, p.id),
    partyId: p.partyId,
    partyShort: party?.shortName ?? null,
    partyColour: party?.colour ?? null,
    constituencyName: seat?.name ?? null,
    offices: selectors.officeLabels(state, p.id, ctx()),
    factionId: p.factionId,
    factionName: faction?.name ?? null,
    status: p.status,
    influence: c.influence.get(p.id)?.total ?? 0,
    isPlayer,
    relationshipToPlayer: isPlayer
      ? null
      : relSummary(selectors.relationship(state, p.id, playerId)),
    knownIntention: intention,
  };
}

function summaryCtx(state: GameState): SummaryCtx {
  return {
    state,
    playerId: state.player.politicianId,
    influence: selectors.influenceAll(state, ctx()),
    next: nextDivision(state),
  };
}

function relationshipScore(r: PoliticianSummary['relationshipToPlayer']): number {
  return r ? r.trust + r.respect + r.affinity : Number.NEGATIVE_INFINITY;
}

function politicianList(state: GameState, query: PoliticianListQuery): PoliticianListResponse {
  const search = query.search?.trim().toLowerCase();
  const candidates = state.politicians.ids
    .map((id) => state.politicians.byId[id])
    .filter((p): p is Politician => p !== undefined)
    .filter((p) => query.partyId === undefined || p.partyId === query.partyId)
    .filter((p) => query.factionId === undefined || p.factionId === query.factionId);
  const c = summaryCtx(state);
  let rows = candidates.map((p) => summaryOf(c, p));
  if (search) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(search) ||
        (r.constituencyName?.toLowerCase().includes(search) ?? false),
    );
  }
  const byName = (a: PoliticianSummary, b: PoliticianSummary) => {
    const pa = state.politicians.byId[a.id as PoliticianId];
    const pb = state.politicians.byId[b.id as PoliticianId];
    return (
      (pa?.name.last ?? '').localeCompare(pb?.name.last ?? '') ||
      (pa?.name.first ?? '').localeCompare(pb?.name.first ?? '') ||
      a.id.localeCompare(b.id)
    );
  };
  rows.sort((a, b) => {
    if (query.sort === 'influence') return b.influence - a.influence || byName(a, b);
    if (query.sort === 'relationship') {
      return (
        relationshipScore(b.relationshipToPlayer) - relationshipScore(a.relationshipToPlayer) ||
        byName(a, b)
      );
    }
    return byName(a, b);
  });
  const start = query.cursor && /^\d+$/.test(query.cursor) ? Number(query.cursor) : 0;
  const items = rows.slice(start, start + query.limit);
  const end = start + items.length;
  return { items, nextCursor: end < rows.length ? String(end) : null };
}

function keyRelationships(state: GameState, p: Politician): PoliticianProfile['keyRelationships'] {
  const out: PoliticianProfile['keyRelationships'] = [];
  const seen = new Set<string>();
  const push = (id: PoliticianId, kind: PoliticianProfile['keyRelationships'][number]['kind']) => {
    if (seen.has(id) || id === p.id || !pol(state, id)) return;
    seen.add(id);
    out.push({ id, name: name(state, id), kind });
  };
  for (const id of p.endorsedBy) push(id, 'patron');
  for (const otherId of state.politicians.ids) {
    if (state.politicians.byId[otherId]?.endorsedBy.includes(p.id)) push(otherId, 'protege');
  }
  const edges = Object.values(state.relationships.edges)
    .filter((e) => e.from === p.id)
    .sort((a, b) => a.to.localeCompare(b.to));
  const rivals = edges
    .filter((e) => e.rivalry > 0 || e.affinity <= -40)
    .sort((a, b) => b.rivalry - a.rivalry || a.affinity - b.affinity);
  const allies = edges
    .filter((e) => e.trust + e.affinity >= 60)
    .sort((a, b) => b.trust + b.affinity - (a.trust + a.affinity));
  for (const e of rivals.slice(0, 3)) push(e.to, 'rival');
  for (const e of allies) {
    if (out.length >= KEY_RELATIONSHIPS) break;
    push(e.to, 'ally');
  }
  return out.slice(0, KEY_RELATIONSHIPS);
}

function politicianProfile(state: GameState, politicianId: string): PoliticianProfile | null {
  const p = pol(state, politicianId as PoliticianId);
  if (!p) return null;
  const { content } = ctx();
  const playerId = state.player.politicianId;
  const isPlayer = p.id === playerId;
  const summary = summaryOf(summaryCtx(state), p);
  const towards = isPlayer ? null : selectors.relationship(state, p.id, playerId);
  const from = isPlayer ? null : selectors.relationship(state, playerId, p.id);
  const memories = [...(towards?.memories ?? []), ...(from?.memories ?? [])]
    .sort((a, b) => b.turn - a.turn)
    .slice(0, 10)
    .map((m) => ({ turn: m.turn, text: MEMORY_TEXT[m.kind] }));
  const ambition = content.ambitions[p.ambition.target];
  return {
    ...summary,
    age: selectors.age(state, p.id),
    ideology: { economic: p.ideology.economic, social: p.ideology.social },
    stances: Object.entries(p.stances)
      .filter((e): e is [string, NonNullable<(typeof e)[1]>] => e[1] !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([issueKey, stance]) => ({
        issueKey,
        label: content.issues[issueKey as keyof typeof content.issues]?.label ?? issueKey,
        stance,
      })),
    traits: traitsOf(p),
    skills: { ...p.skills },
    ambition: ambition ? { label: ambition.label, intensity: p.ambition.intensity } : null,
    reputation: { ...p.reputation },
    partyLoyalty: p.partyLoyalty,
    relationship: {
      towardsPlayer: towards ? relSummary(towards) : null,
      fromPlayer: from ? relSummary(from) : null,
      memories,
    },
    career: p.career
      .slice(-CAREER_ENTRIES)
      .reverse()
      .map((c) => ({ date: c.date, text: c.text })),
    keyRelationships: keyRelationships(state, p),
  };
}

/* ---------------------------------------------------------------------------- overview */

function careerOverview(state: GameState, campaign: CampaignSummary): CareerOverview {
  const c = ctx();
  const me = selectors.player(state);
  const party = me.partyId ? state.parties.byId[me.partyId] : undefined;
  const faction = me.factionId ? state.factions.byId[me.factionId] : undefined;
  const seat = me.constituencyId ? state.constituencies.byId[me.constituencyId] : undefined;
  return {
    campaign,
    player: {
      id: me.id,
      name: selectors.displayName(state, me.id),
      partyId: me.partyId ?? '',
      partyName: party?.name ?? 'Independent',
      partyColour: party?.colour ?? '#888888',
      constituencyName: seat?.name ?? '',
      majority: selectors.majority(state, me.id),
      offices: selectors.officeLabels(state, me.id, c),
      factionName: faction?.name ?? null,
      skills: { ...me.skills },
      traits: traitsOf(me),
      ideology: { economic: me.ideology.economic, social: me.ideology.social },
    },
    standing: {
      politicalCapital: me.politicalCapital,
      capitalIncome: selectors.capitalIncome(state, me.id, c).total,
      influence: selectors.influence(state, me.id, c),
      reputation: { ...me.reputation },
      partyLoyalty: me.partyLoyalty,
      endorsements: me.endorsedBy.map((id) => ({ id, name: name(state, id) })),
    },
    diary: diaryOf(state),
    pendingEvents: selectors.pendingEvents(state, me.id, c).map((e) => ({
      id: e.id,
      title: e.title,
      body: e.body,
      raisedOnTurn: e.raisedOnTurn,
      options: e.options,
    })),
    notifications: state.inbox.slice(-MAX_NOTIFICATIONS).reverse().map(notification),
    briefing: {
      turn: state.briefing.turn,
      headlines: state.briefing.headlines.map(headline),
      ...(state.briefing.newspaper ? { newspaper: newspaper(state.briefing.newspaper) } : {}),
    },
    upcoming: selectors.upcoming(state),
    intelligence: selectors
      .intelligence(state)
      .slice(0, MAX_INTEL)
      .map((i) => ({
        turn: i.turn,
        text: i.text,
        ...(i.politicianId ? { politicianId: i.politicianId } : {}),
      })),
  };
}

/* --------------------------------------------------------------------------- parliament */

function parliament(state: GameState): ParliamentView {
  const c = ctx();
  const playerId = state.player.politicianId;
  const seats = selectors.seatTotals(state);
  const gov = new Set(state.parliament.governmentPartyIds);
  const bills = state.parliament.bills.ids
    .map((id) => state.parliament.bills.byId[id])
    .filter((b) => b !== undefined);
  const divisions = state.parliament.divisions.ids
    .map((id) => state.parliament.divisions.byId[id])
    .filter((d) => d !== undefined);
  const upcoming = divisions
    .filter((d) => d.status === 'scheduled')
    .sort((a, b) => a.turn - b.turn || a.id.localeCompare(b.id));
  const held = divisions
    .filter((d) => d.status === 'held' && d.result)
    .sort((a, b) => b.turn - a.turn || a.id.localeCompare(b.id))
    .slice(0, MAX_RECENT_DIVISIONS);
  return {
    session: { ...state.parliament.session },
    composition: state.parties.ids
      .map((pid) => state.parties.byId[pid])
      .filter((p) => p !== undefined)
      .map((p) => ({
        partyId: p.id,
        name: p.name,
        shortName: p.shortName,
        colour: p.colour,
        seats: seats[p.id] ?? 0,
        inGovernment: gov.has(p.id),
      })),
    totalSeats: Object.values(seats).reduce((a, b) => a + b, 0),
    governmentMajority: selectors.governmentMajority(state),
    bills: bills.map((b) => ({
      id: b.id,
      title: b.title,
      summary: b.summary,
      sponsorId: b.sponsorId,
      sponsorName: name(state, b.sponsorId),
      stage: stageLabel(b.stage),
      issues: Object.entries(b.issues)
        .filter((e): e is [string, NonNullable<(typeof e)[1]>] => e[1] !== undefined)
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([issueKey, stance]) => ({
          issueKey,
          label: c.content.issues[issueKey as keyof typeof c.content.issues]?.label ?? issueKey,
          stance,
        })),
      whipping: state.parties.ids
        .filter((pid) => b.whipping[pid] !== undefined)
        .map((pid) => {
          const w = b.whipping[pid] as WhipInstruction;
          return {
            partyId: pid,
            shortName: state.parties.byId[pid]?.shortName ?? pid,
            instruction: WHIP_LABELS[w.line],
            direction: w.direction,
          };
        }),
    })),
    upcomingDivisions: upcoming.map((d) => {
      const f = selectors.divisionForecast(state, d.id, playerId, c);
      const bill = state.parliament.bills.byId[d.billId];
      return {
        id: d.id,
        billId: d.billId,
        billTitle: bill?.title ?? d.billId,
        stage: stageLabel(d.stage),
        scheduledFor: d.scheduledFor,
        forecast: { ayes: f.ayes, noes: f.noes, abstain: f.abstain, unknown: f.unknown },
        waverers: f.waverers.map((w) => ({
          id: w.id,
          name: w.name,
          partyShort: w.partyShort,
          known: w.known,
        })),
        playerIntendedVote: f.viewerIntendedVote,
      };
    }),
    recentDivisions: held.map((d) => divisionDto(selectors.divisionReport(state, d.id))),
  };
}

/* -------------------------------------------------------------------------------- party */

function party(state: GameState): PartyView {
  const c = ctx();
  const me = selectors.player(state);
  const partyId = (me.partyId ?? state.parties.ids[0]) as PartyId;
  const p = state.parties.byId[partyId];
  if (!p) throw new Error(`Party ${partyId} missing`);
  const seats = selectors.seatTotals(state)[partyId] ?? 0;
  const inGovernment = state.parliament.governmentPartyIds.includes(partyId);
  const influence = selectors.influenceAll(state, c);
  const members = state.politicians.ids
    .map((id) => state.politicians.byId[id])
    .filter((x): x is Politician => x !== undefined && x.partyId === partyId && x.status === 'mp');
  const person = (id: PoliticianId | null) => (id ? { id, name: name(state, id) } : null);
  return {
    id: p.id,
    name: p.name,
    shortName: p.shortName,
    colour: p.colour,
    ideology: { ...p.ideology },
    inGovernment,
    seats,
    pollShare: state.opinion.polls[partyId] ?? p.standing.nationalPollShare,
    unity: Math.round(p.unity),
    whipStrength: p.whipStrength,
    leader: person(p.leaderId) ?? { id: '', name: 'Vacant' },
    chiefWhip: person(p.chiefWhipId),
    governmentStability: inGovernment ? Math.round(state.government.stability) : null,
    factions: p.factionIds
      .map((fid) => state.factions.byId[fid])
      .filter((f) => f !== undefined)
      .map((f) => ({
        id: f.id,
        name: f.name,
        leader: person(f.leaderId) ?? { id: '', name: 'Vacant' },
        memberCount: f.memberIds.length,
        cohesion: f.cohesion,
        ideology: { ...f.ideology },
        demands: f.demands.map((k) => c.content.issues[k]?.label ?? k),
        playerIsMember: f.memberIds.includes(me.id),
        leaderTrustInPlayer:
          f.leaderId && f.leaderId !== me.id
            ? Math.round(selectors.relationship(state, f.leaderId, me.id).trust)
            : null,
      })),
    powerMap: members
      .map((m) => ({
        id: m.id,
        name: selectors.displayName(state, m.id),
        influence: influence.get(m.id)?.total ?? 0,
        offices: selectors.officeLabels(state, m.id, c),
      }))
      .sort((a, b) => b.influence - a.influence || a.id.localeCompare(b.id))
      .slice(0, POWER_MAP_SIZE),
  };
}

/* --------------------------------------------------------------------- turn report, misc */

function turnReport(input: {
  before: GameState;
  output: { state: GameState; result: SimulationResult };
  revision: number;
}): TurnReport {
  const { result } = input.output;
  const next = input.output.state;
  return {
    revision: input.revision,
    turn: result.resolvedTurn,
    simDate: result.resolvedDate,
    nextTurn: next.meta.turn,
    nextSimDate: next.meta.date,
    headlines: result.headlines.map(headline),
    actionOutcomes: result.actionOutcomes.map((o) => ({
      plannedActionId: o.plannedActionId,
      kind: o.kind,
      label: o.label,
      status: o.status,
      summary: o.summary,
      effects: [...o.effects],
    })),
    divisions: result.divisions.map(divisionDto),
    notifications: result.notifications.map(notification),
    capitalChange: result.capitalChange,
    newspaper: newspaper(result.newspaper),
  };
}

function historyRecordsToRows(records: readonly HistoryRecord[]): HistoryRowInput[] {
  return records.map((r) => ({
    turn: r.turn,
    simDate: r.date,
    type: r.type,
    importance: r.importance,
    actorIds: [...r.actorIds],
    subjectIds: [...r.subjectIds],
    title: r.title,
    summary: r.summary,
    data: { engineSeq: r.seq, id: r.id, payload: r.payload },
  }));
}

function actionCatalogue(state: GameState): ActionCatalogueResponse {
  const items = selectors.actionCatalogue(state, state.player.politicianId, ctx());
  return {
    items: items.map((i) => ({
      kind: i.kind,
      label: i.label,
      description: i.description,
      slots: i.slots,
      capitalCost: i.capitalCost,
      eligible: i.eligible,
      reasons: [...i.reasons],
      params: i.params.map((p) => ({
        name: p.name,
        label: p.label,
        type: p.type,
        ...(p.max !== undefined ? { max: p.max } : {}),
        ...(p.options
          ? {
              options: p.options.map((o) => ({
                id: o.id,
                label: o.label,
                ...(o.hint ? { hint: o.hint } : {}),
              })),
            }
          : {}),
      })),
    })),
  };
}

export const realProjections: Projections<GameState, SimulationResult, HistoryRecord> = {
  careerOverview,
  actionCatalogue,
  parliament,
  party,
  politicianList,
  politicianProfile,
  diary: (state) => ({
    diary: diaryOf(state),
    politicalCapital: selectors.player(state).politicalCapital,
  }),
  turnReport,
  historyRecordsToRows,
};
