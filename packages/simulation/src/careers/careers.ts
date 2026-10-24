import type {
  ContentRegistry,
  EventInstance,
  GameState,
  OfficeKey,
  Politician,
  PoliticianId,
} from '@whip/domain';
import { memory, rel } from '../actions/common';
import { bindOption, renderEvent } from '../events/bind';
import { getRelationship } from '../relationships/relationships';
import type { Rng } from '../rng';
import {
  chiefWhipId,
  clamp,
  displayName,
  getPolitician,
  isFactionLeader,
  isGovernmentParty,
  isMinister,
  isOnPayroll,
  isSitting,
  nameOf,
  compareStrings,
} from '../state/access';
import type { TurnContext } from '../turn/context';

/** Utility a request must reach for a promotion to be granted. */
const PROMOTION_THRESHOLD = 0.5;
/** New-intake MPs need this much more for a ministerial (not PPS) post. */
const NEW_INTAKE_MINISTER_PENALTY = 0.3;

/**
 * How attractive `p` is to the PM for `officeKey` (07 §4.3): loyalty record, respect of the PM and
 * Chief Whip, endorsements, ability, faction balance, minus rebellions. Includes small seeded jitter.
 */
export function candidateUtility(
  state: GameState,
  p: Politician,
  officeKey: OfficeKey,
  content: ContentRegistry,
  rng: Rng | null,
): number {
  const def = content.offices[officeKey];
  const pm = state.government.primeMinisterId;
  const cw = chiefWhipId(state);
  let u = 0.35 * (p.partyLoyalty / 100);
  const pmRel = getRelationship(state, pm, p.id);
  const cwRel = cw !== null && cw !== p.id ? getRelationship(state, cw, p.id) : null;
  u += 0.25 * ((pmRel.respect + (cwRel ? cwRel.trust : 0)) / 200);
  u += 0.12 * Math.min(4, p.endorsedBy.length);
  const ability =
    def?.kind === 'pps'
      ? (p.skills.negotiation + p.skills.intrigue) / 2
      : (p.skills.administration + p.skills.policy) / 2;
  u += 0.15 * ((ability - 10) / 5);
  const amb = content.ambitions[p.ambition.target];
  if (amb?.careerist) u += 0.03 * p.ambition.intensity;
  u -= 0.5 * p.rebellions.length;
  if (def?.kind !== 'pps' && p.newIntake) u -= NEW_INTAKE_MINISTER_PENALTY;
  if (isFactionLeader(state, p.id)) u -= 0.3;
  // Faction balance: favour factions under-represented on the payroll.
  if (p.factionId !== null) {
    let onPayroll = 0;
    let members = 0;
    const f = state.factions.byId[p.factionId];
    for (const m of f?.memberIds ?? []) {
      const mp = state.politicians.byId[m];
      if (!mp) continue;
      members += 1;
      if (isOnPayroll(state, mp)) onPayroll += 1;
    }
    if (members > 0 && onPayroll / members < 0.05) u += 0.08;
  }
  if (rng) u += rng.range(-0.05, 0.05);
  return u;
}

function hasPendingOffer(state: GameState, officeKey: OfficeKey): boolean {
  return state.events.pending.some(
    (e) => e.definitionKey === 'event.pps_offer' && e.subjects.officeKey === officeKey,
  );
}

function recentlyDeclined(p: Politician, turn: number): boolean {
  return p.career.some((c) => c.kind === 'declined_office' && turn - c.turn < 4);
}

/**
 * Vacant government offices in rank order, skipping any with an outstanding offer. The premiership
 * is never filled by promotion or reshuffle (that is a leadership contest, not built yet).
 */
function vacancies(state: GameState, content: ContentRegistry): OfficeKey[] {
  return (Object.keys(state.government.appointments) as OfficeKey[])
    .filter(
      (k) =>
        k !== 'office.prime_minister' &&
        state.government.appointments[k] === null &&
        !hasPendingOffer(state, k),
    )
    .sort(
      (a, b) =>
        (content.offices[a]?.rank ?? 99) - (content.offices[b]?.rank ?? 99) || compareStrings(a, b),
    );
}

function eligibleFor(
  state: GameState,
  p: Politician,
  officeKey: OfficeKey,
  content: ContentRegistry,
  turn: number,
): boolean {
  if (!isSitting(p) || !isGovernmentParty(state, p.partyId) || state.parliament.speakerId === p.id)
    return false;
  if (recentlyDeclined(p, turn)) return false;
  if (
    p.isPlayer &&
    state.events.pending.some(
      (e) => e.definitionKey === 'event.pps_offer' && e.addresseeId === p.id,
    )
  )
    return false;
  const kind = content.offices[officeKey]?.kind;
  if (p.offices.some((o) => o.officeKey === 'office.prime_minister')) return false;
  if (kind === 'pps') return !isOnPayroll(state, p);
  if (kind === 'minister') return !isMinister(p, content);
  // Cabinet / whip posts: experienced members not already in Cabinet.
  return (
    !p.newIntake &&
    !p.offices.some(
      (o) =>
        content.offices[o.officeKey]?.kind === 'cabinet' ||
        content.offices[o.officeKey]?.kind === 'whip',
    )
  );
}

/** Appoint (NPC) or offer (player) an office. */
function fill(
  draft: GameState,
  tc: TurnContext,
  p: Politician,
  officeKey: OfficeKey,
  reasonText: string,
): void {
  if (p.isPlayer) {
    tc.emit(draft, {
      kind: 'event.raise',
      definitionKey: 'event.pps_offer',
      addresseeId: p.id,
      subjects: { politicianIds: [p.id], billId: null, divisionId: null, officeKey },
    });
    tc.flags.add('player_offered');
  } else {
    tc.emit(draft, { kind: 'office.appoint', officeKey, politicianId: p.id, reason: reasonText });
  }
}

/** NPC-addressed events are decided here by trait-weighted option scores (07 §4.5). */
function resolveNpcEvents(draft: GameState, tc: TurnContext): void {
  const pending = draft.events.pending
    .filter((e) => e.addresseeId !== draft.player.politicianId)
    .sort((a, b) => compareStrings(a.id, b.id));
  for (const ev of pending) resolveNpcEvent(draft, tc, ev);
}

function resolveNpcEvent(draft: GameState, tc: TurnContext, ev: EventInstance): void {
  const rendered = renderEvent(draft, ev, tc.content);
  const npc = draft.politicians.byId[ev.addresseeId];
  if (!rendered || !npc) return;
  const rng = tc.rng(`npc_event:${ev.id}`);
  let best = rendered.def.options[0];
  let bestScore = -Infinity;
  for (const o of rendered.def.options) {
    let s = o.ai.base + rng.range(-0.25, 0.25);
    for (const t of npc.traits) s += o.ai.traitModifiers[t] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = o;
    }
  }
  if (!best) return;
  const bound = bindOption(draft, ev, best, tc.content, tc.turn);
  const { effectIds } = tc.emitAll(draft, [
    ...bound.effects,
    { kind: 'event.resolve', eventId: ev.id, optionKey: best.key, expired: false },
  ]);
  for (const s of bound.scheduled)
    tc.schedule(draft, s.effect, s.dueTurn, { kind: 'event', id: ev.id }, s.conditions);
  const concession = ev.definitionKey === 'event.government_concession' && best.key === 'concede';
  const important =
    ev.definitionKey === 'event.government_concession' ||
    ev.definitionKey === 'event.minister_considers_position';
  if (concession) {
    const bill = ev.subjects.billId ? draft.parliament.bills.byId[ev.subjects.billId] : undefined;
    const amendment = bill?.amendments[bill.amendments.length - 1];
    if (bill && amendment) {
      tc.record(draft, {
        type: 'policy_announcement',
        payload: {
          billId: bill.id,
          issueKey: amendment.issueKey,
          from: amendment.from,
          to: amendment.to,
        },
        importance: 4,
        template: 'policy.concession',
        vars: { bill: bill.title, detail: 'a social-housing quota in every new development' },
        actorIds: [npc.id],
        subjectIds: [bill.id],
        effectIds,
      });
      tc.flags.add('headline:concession');
    }
  } else {
    tc.record(draft, {
      type: 'event',
      payload: { eventId: ev.id, definitionKey: ev.definitionKey, optionKey: best.key },
      importance: important ? 3 : npc.castKey !== null ? 2 : 1,
      template: 'event.resolved',
      vars: { actor: displayName(npc), event: rendered.title, option: best.label.toLowerCase() },
      actorIds: [npc.id],
      subjectIds: [ev.id],
      effectIds,
    });
  }
  if (important || npc.castKey !== null) {
    tc.notify(draft, {
      severity: concession ? 'info' : important ? 'warning' : 'info',
      title: `${rendered.title}: ${nameOf(draft, npc.id)} chose to ${best.label.toLowerCase()}`,
      body: rendered.body,
      link: { kind: 'politician', id: npc.id },
    });
  }
}

/** Ministers and PPSs who voted against the government lose their posts (collective responsibility). */
function disciplinePayroll(draft: GameState, tc: TurnContext): void {
  for (const id of [...tc.rebelsThisTurn].sort()) {
    const p = getPolitician(draft, id);
    if (!isGovernmentParty(draft, p.partyId)) continue;
    for (const o of p.offices.slice()) {
      const def = tc.content.offices[o.officeKey];
      if (
        !def ||
        o.officeKey === 'office.prime_minister' ||
        !(o.officeKey in draft.government.appointments)
      )
        continue;
      tc.emit(draft, {
        kind: 'office.vacate',
        officeKey: o.officeKey,
        reason: def.kind === 'pps' ? 'sacked' : 'resigned',
        note: 'Voted against the government',
      });
    }
  }
}

function resolvePromotionRequests(draft: GameState, tc: TurnContext): void {
  const requests = draft.careers.promotionRequests
    .slice()
    .sort((a, b) => compareStrings(a.politicianId, b.politicianId));
  const content = tc.content;
  for (const r of requests) {
    // Per-request stream: another MP's request never shifts this one's jitter (ADR-0008 §2).
    const rng = tc.rng(`promotions:${r.politicianId}`);
    const p = draft.politicians.byId[r.politicianId];
    if (!p) continue;
    const open = vacancies(draft, content).filter((k) =>
      eligibleFor(draft, p, k, content, tc.turn),
    );
    // Requests are answered with PPS posts; ministerial posts are filled in reshuffles.
    const ranked = open
      .filter((k) => content.offices[k]?.kind === 'pps')
      .map((k) => ({ k, u: candidateUtility(draft, p, k, content, rng) }))
      .sort((a, b) => b.u - a.u || compareStrings(a.k, b.k));
    const best = ranked[0];
    if (best && best.u >= PROMOTION_THRESHOLD) {
      fill(draft, tc, p, best.k, 'Promoted after asking the whips for a job');
      continue;
    }
    const cw = chiefWhipId(draft);
    if (cw !== null && cw !== p.id)
      tc.emit(
        draft,
        rel(
          cw,
          p.id,
          { respect: -3 },
          'asked for promotion too soon',
          memory('passed_over', -5, 1),
        ),
      );
    tc.record(draft, {
      type: 'action_outcome',
      payload: { kind: 'request_promotion', status: 'failed', plannedActionId: null, effects: [] },
      importance: p.isPlayer ? 2 : 1,
      template: 'promotion.refused',
      vars: { actor: displayName(p) },
      actorIds: [p.id],
      subjectIds: [],
    });
    if (p.isPlayer) {
      const why =
        open.length === 0
          ? 'There are no suitable vacancies.'
          : `Your case was not strong enough (score ${clamp(Math.round((best?.u ?? 0) * 100), -99, 99)} of ${PROMOTION_THRESHOLD * 100} needed). Endorsements, loyalty and the Chief Whip's regard all help.`;
      tc.notify(draft, { severity: 'warning', title: 'Not this time', body: why, link: null });
    }
  }
  draft.careers.promotionRequests = [];
}

/** Fill vacancies by candidate utility (several passes so promotions cascade). */
function reshuffle(draft: GameState, tc: TurnContext): void {
  const content = tc.content;
  let changes = 0;
  for (let pass = 0; pass < 3; pass++) {
    const open = vacancies(draft, content);
    if (open.length === 0) break;
    for (const k of open) {
      if (draft.government.appointments[k] !== null || hasPendingOffer(draft, k)) continue;
      let bestId: PoliticianId | null = null;
      // Per-office stream, so filling one post never shifts the jitter for another.
      const rng = tc.rng(`reshuffle:${pass}:${k}`);
      let bestU = -Infinity;
      for (const id of draft.politicians.ids) {
        const p = draft.politicians.byId[id];
        if (!p || !eligibleFor(draft, p, k, content, tc.turn)) continue;
        let u = candidateUtility(draft, p, k, content, rng);
        if (content.offices[k]?.kind === 'cabinet' && isMinister(p, content)) u += 0.2;
        if (u > bestU) {
          bestU = u;
          bestId = id;
        }
      }
      if (bestId !== null) {
        fill(draft, tc, getPolitician(draft, bestId), k, 'Appointed in a reshuffle');
        changes += 1;
      }
    }
  }
  draft.careers.lastReshuffleTurn = tc.turn;
  draft.careers.reshuffleRequestedTurn = null;
  tc.flags.add(`headline:reshuffle:${changes}`);
}

/** Phase 11 — careers & crises (after events, so a crisis can cause a resignation the same week). */
export function careersPhase(draft: GameState, tc: TurnContext): void {
  resolveNpcEvents(draft, tc);
  disciplinePayroll(draft, tc);
  resolvePromotionRequests(draft, tc);
  if (draft.careers.reshuffleRequestedTurn === tc.turn) reshuffle(draft, tc);
}
