import {
  ACTION_KINDS,
  ageOn,
  type ActionKind,
  type ContentRegistry,
  type DivisionId,
  type EventKey,
  type GameState,
  type IneligibilityReason,
  type IntelItem,
  type PartyId,
  type PlannedAction,
  type Politician,
  type PoliticianId,
  type Relationship,
  type SimDate,
} from '@whip/domain';
import { getDefinition } from '../actions/catalogue';
import { reason, upcomingDivisions } from '../actions/common';
import { diaryCapacity, slotsUsed } from '../actions/plan';
import type { ParamDescriptor } from '../actions/types';
import { capitalIncome } from '../careers/capital';
import { stageLabel } from '../chronicle/templates';
import type { SimulationContext } from '../context';
import { renderEvent } from '../events/bind';
import { playerIntendedVote, whipFor } from '../parliament/vote-utility';
import { getRelationship, officeInfluence } from '../relationships/relationships';
import {
  billBeforeHouse,
  displayName,
  getBill,
  getConstituency,
  getPolitician,
  governmentMajority,
  isFactionLeader,
  isPartyLeader,
  isSitting,
  majorityOf,
  sortedKeys,
  compareStrings,
} from '../state/access';
import {
  divisionForecast,
  divisionReport,
  knownIntention,
  knownIntentionDetail,
} from './divisions';

export interface InfluenceView {
  total: number;
  breakdown: { label: string; value: number }[];
}

export interface TargetOption {
  id: string;
  label: string;
  hint?: string;
}

export interface CatalogueParam extends ParamDescriptor {
  options?: TargetOption[];
}

export interface ActionCatalogueItem {
  kind: ActionKind;
  label: string;
  description: string;
  slots: number;
  capitalCost: number;
  eligible: boolean;
  reasons: string[];
  params: CatalogueParam[];
}

export interface PendingEventView {
  id: string;
  definitionKey: EventKey;
  title: string;
  body: string;
  raisedOnTurn: number;
  expiresTurn: number;
  options: { key: string; label: string; description: string; capitalCost: number }[];
}

function respectCounts(state: GameState): Map<PoliticianId, number> {
  const out = new Map<PoliticianId, number>();
  for (const key of sortedKeys(state.relationships.edges)) {
    const e = state.relationships.edges[key];
    if (e && e.respect >= 30) out.set(e.to, (out.get(e.to) ?? 0) + 1);
  }
  return out;
}

function influenceWith(
  state: GameState,
  p: Politician,
  content: ContentRegistry,
  respected: number,
): InfluenceView {
  const breakdown: { label: string; value: number }[] = [];
  const office = officeInfluence(p, content);
  if (office > 0) breakdown.push({ label: 'Office', value: office });
  if (isPartyLeader(state, p.id)) breakdown.push({ label: 'Party leadership', value: 15 });
  if (isFactionLeader(state, p.id)) breakdown.push({ label: 'Faction leadership', value: 10 });
  if (state.parliament.fatherOfHouseId === p.id)
    breakdown.push({ label: 'Father of the House', value: 6 });
  const rep = Math.round(p.reputation.colleagues / 5);
  if (rep !== 0) breakdown.push({ label: 'Reputation among colleagues', value: rep });
  if (respected > 0)
    breakdown.push({ label: 'Colleagues who respect them', value: Math.min(15, respected) });
  if (p.endorsedBy.length > 0)
    breakdown.push({ label: 'Endorsements', value: 3 * p.endorsedBy.length });
  const cap = Math.floor(p.politicalCapital / 2);
  if (cap > 0) breakdown.push({ label: 'Political capital', value: cap });
  return { total: breakdown.reduce((s, b) => s + b.value, 0), breakdown };
}

/** Derived influence with an explainable breakdown (doc 02 §2). */
function influence(
  state: GameState,
  politicianId: PoliticianId,
  ctx: SimulationContext,
): InfluenceView {
  const p = getPolitician(state, politicianId);
  return influenceWith(state, p, ctx.content, respectCounts(state).get(p.id) ?? 0);
}

/** Influence for every politician in one pass (for power maps and sorting lists). */
function influenceAll(state: GameState, ctx: SimulationContext): Map<PoliticianId, InfluenceView> {
  const counts = respectCounts(state);
  const out = new Map<PoliticianId, InfluenceView>();
  for (const id of state.politicians.ids) {
    const p = state.politicians.byId[id];
    if (p) out.set(id, influenceWith(state, p, ctx.content, counts.get(id) ?? 0));
  }
  return out;
}

function hintFor(state: GameState, p: Politician, ctx: SimulationContext): string {
  const party = p.partyId ? state.parties.byId[p.partyId]?.shortName : null;
  const office = p.offices[0] ? ctx.content.offices[p.offices[0].officeKey]?.label : undefined;
  const faction = p.factionId ? state.factions.byId[p.factionId]?.name : undefined;
  const seat = p.constituencyId ? getConstituency(state, p.constituencyId).name : undefined;
  return [party, office ?? faction ?? seat].filter(Boolean).join(' · ');
}

/** A bounded, sorted list of sensible targets for a politician parameter. */
function suggestedTargets(
  state: GameState,
  actor: Politician,
  kind: ActionKind,
  ctx: SimulationContext,
): TargetOption[] {
  const ids = new Set<PoliticianId>();
  const consider = (id: PoliticianId) => {
    const p = state.politicians.byId[id];
    if (p && p.id !== actor.id && isSitting(p)) ids.add(id);
  };
  if (kind === 'seek_endorsement') {
    for (const id of state.politicians.ids) {
      const p = state.politicians.byId[id];
      if (!p || p.partyId !== actor.partyId || actor.endorsedBy.includes(id)) continue;
      if (
        p.offices.length > 0 ||
        isFactionLeader(state, id) ||
        state.parliament.fatherOfHouseId === id
      )
        consider(id);
    }
  } else {
    for (const key of sortedKeys(state.relationships.edges)) {
      const e = state.relationships.edges[key];
      if (e && e.from === actor.id) consider(e.to);
    }
    for (const id of state.politicians.ids) {
      const p = state.politicians.byId[id];
      if (!p) continue;
      if (
        p.castKey !== null ||
        isFactionLeader(state, id) ||
        (p.partyId === actor.partyId && p.offices.length > 0)
      )
        consider(id);
    }
    for (const id of sortedKeys(state.player.knowledge.intentions) as PoliticianId[]) consider(id);
  }
  return [...ids]
    .map((id) => getPolitician(state, id))
    .sort(
      (a, b) =>
        compareStrings(a.name.last, b.name.last) ||
        compareStrings(a.name.first, b.name.first) ||
        compareStrings(a.id, b.id),
    )
    .slice(0, 60)
    .map((p) => ({ id: p.id, label: displayName(p), hint: hintFor(state, p, ctx) }));
}

/** Kind-specific availability checks for the catalogue (before params are chosen). */
function availability(
  state: GameState,
  actor: Politician,
  kind: ActionKind,
): IneligibilityReason[] {
  const upcoming = upcomingDivisions(state);
  switch (kind) {
    case 'make_political_promise':
      return upcoming.length > 0
        ? []
        : [reason('division_not_scheduled', 'No divisions are coming up.')];
    case 'support_legislation':
    case 'oppose_legislation':
      return state.parliament.bills.ids.some((b) => {
        const bill = state.parliament.bills.byId[b];
        return bill !== undefined && billBeforeHouse(bill) && upcoming.some((d) => d.billId === b);
      })
        ? []
        : [reason('bill_not_before_house', 'No bill before the House has a vote coming up.')];
    case 'rebel_against_party':
      return upcoming.some((d) => {
        const w = whipFor(getBill(state, d.billId), actor);
        return (
          w !== null && (w.line === 'three_line' || w.line === 'two_line') && w.direction !== null
        );
      })
        ? []
        : [reason('not_whipped', 'Your party has not whipped any upcoming division.')];
    case 'respond_to_event':
      return state.events.pending.some((e) => e.addresseeId === actor.id)
        ? []
        : [reason('event_not_pending', 'Nothing is waiting for your decision.')];
    default:
      return [];
  }
}

/**
 * The action catalogue as seen by `actorId` (07 §5): eligibility from position plus the current
 * diary and capital budget, with human-readable reasons and parameter options for pickers.
 */
function actionCatalogue(
  state: GameState,
  actorId: PoliticianId,
  ctx: SimulationContext,
): ActionCatalogueItem[] {
  const actor = getPolitician(state, actorId);
  const isPlayer = actorId === state.player.politicianId;
  const slotsLeft = isPlayer ? diaryCapacity(state) - slotsUsed(state.player.plannedActions) : 3;
  const divisions = upcomingDivisions(state);
  const bills = state.parliament.bills.ids
    .map((id) => state.parliament.bills.byId[id])
    .filter((b): b is NonNullable<typeof b> => b !== undefined && billBeforeHouse(b));
  const events = state.events.pending.filter((e) => e.addresseeId === actorId);
  return ACTION_KINDS.map((kind) => {
    const def = getDefinition(kind);
    const reasons = [
      ...def.positionEligibility(state, actor, ctx),
      ...availability(state, actor, kind),
    ];
    if (def.slots > slotsLeft)
      reasons.push(
        reason(
          'insufficient_slots',
          `Needs ${def.slots} diary slot${def.slots === 1 ? '' : 's'}; ${slotsLeft} left this week.`,
        ),
      );
    if (def.baseCapitalCost > actor.politicalCapital) {
      reasons.push(
        reason(
          'insufficient_capital',
          `Needs ${def.baseCapitalCost} political capital; you have ${actor.politicalCapital}.`,
        ),
      );
    }
    const params: CatalogueParam[] = def.paramDescriptors.map((d) => {
      switch (d.type) {
        case 'politician':
        case 'politicians':
          return { ...d, options: suggestedTargets(state, actor, kind, ctx) };
        case 'bill':
          return {
            ...d,
            options: bills.map((b) => ({ id: b.id, label: b.title, hint: stageLabel(b.stage) })),
          };
        case 'division':
          return {
            ...d,
            options: divisions.map((dv) => ({
              id: dv.id,
              label: `${getBill(state, dv.billId).title}: ${stageLabel(dv.stage)}`,
              hint: dv.scheduledFor,
            })),
          };
        case 'vote': {
          const votes =
            kind === 'rebel_against_party'
              ? (['no', 'abstain'] as const)
              : (['aye', 'no', 'abstain'] as const);
          return {
            ...d,
            options: votes.map((v) => ({
              id: v,
              label: v === 'aye' ? 'Aye' : v === 'no' ? 'No' : 'Abstain',
            })),
          };
        }
        case 'event_option':
          if (d.name === 'eventId') {
            return {
              ...d,
              options: events.map((e) => ({
                id: e.id,
                label: renderEvent(state, e, ctx.content)?.title ?? e.definitionKey,
              })),
            };
          }
          return {
            ...d,
            options: events.flatMap((e) =>
              (ctx.content.events[e.definitionKey]?.options ?? []).map((o) => ({
                id: o.key,
                label: o.label,
                hint: e.id,
              })),
            ),
          };
      }
    });
    return {
      kind,
      label: def.label,
      description: def.description,
      slots: def.slots,
      capitalCost: def.baseCapitalCost,
      eligible: reasons.length === 0,
      reasons: reasons.map((r) => r.message),
      params,
    };
  });
}

function seatTotals(state: GameState): Record<PartyId, number> {
  const out: Record<PartyId, number> = {};
  for (const pid of state.parties.ids) out[pid] = 0;
  for (const id of state.politicians.ids) {
    const p = state.politicians.byId[id];
    if (p && isSitting(p) && p.partyId !== null) out[p.partyId] = (out[p.partyId] ?? 0) + 1;
  }
  return out;
}

function pendingEvents(
  state: GameState,
  viewerId: PoliticianId,
  ctx: SimulationContext,
): PendingEventView[] {
  return state.events.pending
    .filter((e) => e.addresseeId === viewerId)
    .map((e) => {
      const r = renderEvent(state, e, ctx.content);
      return {
        id: e.id,
        definitionKey: e.definitionKey,
        title: r?.title ?? e.definitionKey,
        body: r?.body ?? '',
        raisedOnTurn: e.raisedTurn,
        expiresTurn: e.expiresTurn,
        options: (r?.def.options ?? []).map((o) => ({
          key: o.key,
          label: o.label,
          description: o.description,
          capitalCost: o.capitalCost,
        })),
      };
    });
}

function upcoming(state: GameState): {
  date: SimDate;
  label: string;
  kind: 'division' | 'reading' | 'event' | 'other';
  refId: string;
}[] {
  return upcomingDivisions(state).map((d) => ({
    date: d.scheduledFor,
    label: `${getBill(state, d.billId).title}: ${stageLabel(d.stage)} division`,
    kind: 'division' as const,
    refId: d.id,
  }));
}

/**
 * Pure read helpers used by API projections (07 §5). No DTO types here; the API maps these onto
 * @whip/contracts. Selectors that need content take `ctx`.
 */
export const selectors = {
  player: (state: GameState): Politician => getPolitician(state, state.player.politicianId),
  influence,
  influenceAll,
  actionCatalogue,
  /** Fog-of-war forecast from the viewer's knowledge. Pass ctx so the player's own free-vote intention can be computed. */
  divisionForecast: (
    state: GameState,
    divisionId: DivisionId,
    viewerId: PoliticianId,
    ctx?: SimulationContext,
  ) => divisionForecast(state, divisionId, viewerId, ctx?.content),
  knownIntention: (
    state: GameState,
    viewerId: PoliticianId,
    politicianId: PoliticianId,
    divisionId: DivisionId,
    ctx?: SimulationContext,
  ) => knownIntention(state, viewerId, politicianId, divisionId, ctx?.content),
  knownIntentionDetail: (
    state: GameState,
    viewerId: PoliticianId,
    politicianId: PoliticianId,
    divisionId: DivisionId,
    ctx?: SimulationContext,
  ) => knownIntentionDetail(state, viewerId, politicianId, divisionId, ctx?.content),
  /** Stored edge, or the derived default for unstored pairs. */
  relationship: (state: GameState, from: PoliticianId, to: PoliticianId): Relationship =>
    getRelationship(state, from, to),
  seatTotals,
  // --- additive extras for projections ---
  divisionReport,
  diary: (
    state: GameState,
  ): { slotsTotal: number; slotsUsed: number; planned: PlannedAction[] } => ({
    slotsTotal: diaryCapacity(state),
    slotsUsed: slotsUsed(state.player.plannedActions),
    planned: state.player.plannedActions,
  }),
  capitalIncome: (state: GameState, politicianId: PoliticianId, ctx: SimulationContext) =>
    capitalIncome(getPolitician(state, politicianId), ctx.content),
  pendingEvents,
  upcoming,
  intelligence: (state: GameState): IntelItem[] => state.player.knowledge.intel.slice().reverse(),
  playerIntendedVote: (state: GameState, divisionId: DivisionId, ctx: SimulationContext) => {
    const d = state.parliament.divisions.byId[divisionId];
    return d && d.status === 'scheduled'
      ? playerIntendedVote(state, d, ctx.content)
      : (d?.result?.votes[state.player.politicianId] ?? null);
  },
  majority: (state: GameState, politicianId: PoliticianId): number | null => {
    const p = getPolitician(state, politicianId);
    return p.constituencyId ? majorityOf(getConstituency(state, p.constituencyId)) : null;
  },
  governmentMajority,
  displayName: (state: GameState, politicianId: PoliticianId): string =>
    displayName(getPolitician(state, politicianId)),
  officeLabels: (state: GameState, politicianId: PoliticianId, ctx: SimulationContext): string[] =>
    getPolitician(state, politicianId).offices.map(
      (o) => ctx.content.offices[o.officeKey]?.label ?? o.officeKey,
    ),
  age: (state: GameState, politicianId: PoliticianId): number =>
    ageOn(getPolitician(state, politicianId).dateOfBirth, state.meta.date),
};
