import { formatSimDate } from '@whip/domain';
import type {
  ContentRegistry,
  Effect,
  EventDefinition,
  EventInstance,
  EventOptionDefinition,
  FactionId,
  GameState,
  OfficeKey,
  PoliticianId,
  RoleRef,
} from '@whip/domain';
import { fillTemplate } from '../chronicle/templates';
import { decideVote } from '../parliament/vote-utility';
import {
  chiefWhipId,
  deputyChiefWhipId,
  findDivision,
  getPolitician,
  nameOf,
} from '../state/access';
import type { ScheduledSpec } from '../actions/types';

const PRIME_MINISTER = 'office.prime_minister' as OfficeKey;

/** Resolve a role reference against an event instance. Null when nobody fills the role. */
export function bindRole(state: GameState, ev: EventInstance, ref: RoleRef): PoliticianId | null {
  switch (ref) {
    case 'addressee':
      return ev.addresseeId;
    case 'chief_whip':
      return chiefWhipId(state);
    case 'deputy_chief_whip':
      return deputyChiefWhipId(state);
    case 'prime_minister':
      return state.government.primeMinisterId;
    case 'bill_sponsor':
      return ev.subjects.billId
        ? (state.parliament.bills.byId[ev.subjects.billId]?.sponsorId ?? null)
        : null;
    case 'subject':
      return ev.subjects.politicianIds[0] ?? null;
    default: {
      const fid = ref.slice('faction:'.length) as FactionId;
      return state.factions.byId[fid]?.leaderId ?? null;
    }
  }
}

export function eventVars(
  state: GameState,
  ev: EventInstance,
  content: ContentRegistry,
): Record<string, string> {
  const bill = ev.subjects.billId ? state.parliament.bills.byId[ev.subjects.billId] : undefined;
  const div = ev.subjects.divisionId ? findDivision(state, ev.subjects.divisionId) : undefined;
  const subject = ev.subjects.politicianIds[0];
  return {
    addressee: state.player.politicianId === ev.addresseeId ? 'you' : nameOf(state, ev.addresseeId),
    bill: bill?.title ?? 'the bill',
    office: ev.subjects.officeKey
      ? (content.offices[ev.subjects.officeKey]?.label ?? ev.subjects.officeKey)
      : 'office',
    subject: subject ? nameOf(state, subject) : 'the MP',
    date: div ? formatSimDate(div.scheduledFor) : 'the vote',
  };
}

export function renderEvent(
  state: GameState,
  ev: EventInstance,
  content: ContentRegistry,
): { def: EventDefinition; title: string; body: string } | null {
  const def = content.events[ev.definitionKey];
  if (!def) return null;
  const vars = eventVars(state, ev, content);
  return { def, title: fillTemplate(def.title, vars), body: fillTemplate(def.body, vars) };
}

/**
 * Turn an option's declarative effect templates into concrete Effects (and scheduled effects) for
 * this instance. Roles that are vacant are skipped.
 */
export function bindOption(
  state: GameState,
  ev: EventInstance,
  option: EventOptionDefinition,
  content: ContentRegistry,
  turn: number,
): { effects: Effect[]; scheduled: ScheduledSpec[] } {
  const effects: Effect[] = [];
  const scheduled: ScheduledSpec[] = [];
  const vars = eventVars(state, ev, content);
  const reasonText = `${content.events[ev.definitionKey]?.title ?? 'event'}: ${option.label.toLowerCase()}`;
  const addressee = ev.addresseeId;
  for (const t of option.effects) {
    switch (t.kind) {
      case 'relationship': {
        const from = bindRole(state, ev, t.from);
        const to = bindRole(state, ev, t.to);
        if (from === null || to === null || from === to) break;
        effects.push({
          kind: 'relationship.adjust',
          from,
          to,
          trust: t.trust,
          respect: t.respect,
          affinity: t.affinity,
          obligation: 0,
          rivalry: 0,
          memory: null,
          reason: reasonText,
        });
        break;
      }
      case 'reputation': {
        const p = bindRole(state, ev, t.who);
        if (p)
          effects.push({
            kind: 'reputation.adjust',
            politicianId: p,
            audience: t.audience,
            delta: t.delta,
            reason: reasonText,
          });
        break;
      }
      case 'capital': {
        const p = bindRole(state, ev, t.who);
        if (p)
          effects.push({
            kind: 'capital.adjust',
            politicianId: p,
            delta: t.delta,
            reason: reasonText,
          });
        break;
      }
      case 'local_standing': {
        const p = bindRole(state, ev, t.who);
        if (p)
          effects.push({
            kind: 'local_standing.adjust',
            politicianId: p,
            delta: t.delta,
            reason: reasonText,
          });
        break;
      }
      case 'loyalty': {
        const p = bindRole(state, ev, t.who);
        if (p)
          effects.push({
            kind: 'loyalty.adjust',
            politicianId: p,
            delta: t.delta,
            reason: reasonText,
          });
        break;
      }
      case 'stability':
        effects.push({ kind: 'government.stability', delta: t.delta, reason: reasonText });
        break;
      case 'amend_bill':
        if (ev.subjects.billId)
          effects.push({
            kind: 'bill.amend',
            billId: ev.subjects.billId,
            issueKey: t.issueKey,
            stance: t.stance,
            reason: reasonText,
          });
        break;
      case 'slots_next_week': {
        const p = bindRole(state, ev, t.who);
        if (p) {
          scheduled.push({
            effect: {
              kind: 'diary.adjust_slots',
              politicianId: p,
              delta: t.delta,
              reason: reasonText,
            },
            dueTurn: turn + 1,
            conditions: [{ kind: 'politician_sitting', politicianId: p }],
          });
        }
        break;
      }
      case 'whips_learn_intention': {
        const div = ev.subjects.divisionId
          ? findDivision(state, ev.subjects.divisionId)
          : undefined;
        if (div && div.status === 'scheduled') {
          const { vote } = decideVote(state, getPolitician(state, addressee), div, content);
          effects.push({
            kind: 'division.whip_intel',
            divisionId: div.id,
            politicianId: addressee,
            vote,
          });
        }
        break;
      }
      case 'declare_vote': {
        const div = ev.subjects.divisionId
          ? findDivision(state, ev.subjects.divisionId)
          : undefined;
        if (div && div.status === 'scheduled') {
          effects.push({
            kind: 'division.declare',
            divisionId: div.id,
            politicianId: addressee,
            vote: t.vote,
            source: 'promise',
          });
        }
        break;
      }
      case 'resign_office': {
        // The Prime Minister never resigns through an event in the slice: a change of PM belongs to
        // a future leadership-contest system (it must also move the party leadership).
        const p = getPolitician(state, addressee);
        for (const o of p.offices) {
          if (o.officeKey === PRIME_MINISTER) continue;
          if (
            content.offices[o.officeKey]?.ministerial ||
            content.offices[o.officeKey]?.kind === 'pps'
          ) {
            effects.push({
              kind: 'office.vacate',
              officeKey: o.officeKey,
              reason: 'resigned',
              note: reasonText,
            });
          }
        }
        break;
      }
      case 'accept_office': {
        const key: OfficeKey | null = ev.subjects.officeKey;
        if (key && state.government.appointments[key] === null) {
          effects.push({
            kind: 'office.appoint',
            officeKey: key,
            politicianId: addressee,
            reason: 'Accepted an offer from the Prime Minister',
          });
        }
        break;
      }
      case 'decline_office':
        effects.push({
          kind: 'career.record',
          politicianId: addressee,
          entryKind: 'declined_office',
          officeKey: ev.subjects.officeKey,
          text: `Declined ${vars.office}`,
        });
        break;
      case 'intel':
        effects.push({
          kind: 'knowledge.intel',
          text: fillTemplate(t.text, { ...vars, addressee: nameOf(state, addressee) }),
          politicianId: addressee,
        });
        break;
    }
  }
  return { effects, scheduled };
}
