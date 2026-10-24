import {
  addDays,
  formatSimDate,
  MAX_RECENT_HISTORY,
  RECENT_HISTORY_TURNS,
  type GameState,
  type Headline,
  type HeadlineTemplateKey,
  type HistoryRecord,
  type PartyId,
  type PoliticianId,
} from '@whip/domain';
import { cappedIncome } from '../careers/capital';
import { SIMULATION_VERSION } from '../context';
import {
  displayName,
  getBill,
  getConstituency,
  getPolitician,
  isSitting,
  scheduledDivisions,
  compareStrings,
} from '../state/access';
import { compactState } from '../state/compaction';
import type { TurnContext } from '../turn/context';
import { headlineText, stageLabel, VOTE_LABEL, type TemplateVars } from './templates';

const MAX_HEADLINES = 5;
/** Government rebellions at least this big make their own headline. */
const REBELLION_HEADLINE = 15;

interface HeadlineCandidate {
  key: HeadlineTemplateKey;
  vars: TemplateVars;
  importance: number;
}

/** Build the weekly briefing from the turn's records and signals (deterministic templates). */
export function compileHeadlines(draft: GameState, tc: TurnContext): Headline[] {
  const c: HeadlineCandidate[] = [];
  const me = getPolitician(draft, draft.player.politicianId);
  for (const r of tc.history) headlineFor(draft, tc, r, me.id, c);
  for (const f of tc.flags) {
    if (f === 'headline:concession') {
      const bill = draft.parliament.bills.ids
        .map((id) => draft.parliament.bills.byId[id])
        .find((b) => b && b.amendments.some((a) => a.turn === tc.turn));
      if (bill)
        c.push({
          key: 'concession',
          vars: { bill: bill.title, detail: 'A social-housing quota is added.' },
          importance: 4,
        });
    }
    if (f.startsWith('headline:reshuffle:')) {
      const count = Number(f.split(':')[2] ?? 0);
      if (count > 0) c.push({ key: 'reshuffle', vars: { count }, importance: 4 });
    }
  }
  if (draft.government.stability <= -20)
    c.push({ key: 'stability.low', vars: { count: draft.government.stability }, importance: 3 });
  const next = scheduledDivisions(draft).find((d) => d.turn > tc.turn && d.turn - tc.turn <= 2);
  if (next) {
    c.push({
      key: 'division.upcoming',
      vars: {
        bill: getBill(draft, next.billId).title,
        stage: stageLabel(next.stage).toLowerCase(),
        date: formatSimDate(next.scheduledFor),
      },
      importance: next.turn - tc.turn === 1 ? 3 : 2,
    });
  }
  if (c.length < 2) c.push({ key: 'quiet_week', vars: {}, importance: 1 });
  // Stable order: importance desc, then key; dedupe keys.
  const seen = new Set<string>();
  return c
    .sort((a, b) => b.importance - a.importance || compareStrings(a.key, b.key))
    .filter((h) => (seen.has(h.key) ? false : (seen.add(h.key), true)))
    .slice(0, MAX_HEADLINES)
    .map((h) => {
      const t = headlineText(tc.content, h.key, h.vars, draft.meta.seed, tc.turn);
      return {
        text: t.text,
        standfirst: t.standfirst === '' ? null : t.standfirst,
        importance: h.importance,
      };
    });
}

function headlineFor(
  draft: GameState,
  tc: TurnContext,
  r: HistoryRecord,
  me: PoliticianId,
  out: HeadlineCandidate[],
): void {
  switch (r.type) {
    case 'division': {
      const p = r.payload;
      const bill = getBill(draft, p.billId);
      const govRebels = p.rebelIds.filter((id) =>
        draft.parliament.governmentPartyIds.includes(getPolitician(draft, id).partyId as PartyId),
      ).length;
      const vars = {
        bill: bill.title,
        stage: stageLabel(p.stage).toLowerCase(),
        ayes: p.ayes,
        noes: p.noes,
        margin: Math.abs(p.ayes - p.noes),
        count: govRebels,
      };
      const key: HeadlineTemplateKey = !p.governmentWon
        ? 'division.lost'
        : p.ayes - p.noes >= 40
          ? 'division.won_comfortably'
          : 'division.won_narrowly';
      out.push({ key, vars, importance: 5 });
      if (govRebels >= REBELLION_HEADLINE)
        out.push({ key: 'division.rebellion', vars, importance: 4 });
      if (p.rebelIds.includes(me)) {
        const player = getPolitician(draft, me);
        const vote = draft.parliament.divisions.byId[p.divisionId]?.result?.votes[me];
        out.push({
          key: 'player.rebelled',
          vars: {
            actor: displayName(player),
            constituency: player.constituencyId
              ? getConstituency(draft, player.constituencyId).name
              : '',
            vote: vote ? VOTE_LABEL[vote] : '',
            bill: bill.title,
          },
          importance: 3,
        });
      }
      return;
    }
    case 'resignation':
      if (r.importance >= 3)
        out.push({
          key: 'resignation',
          vars: {
            actor: nameFrom(draft, r.payload.politicianId),
            office: officeLabel(tc, r.payload.officeKey),
          },
          importance: 4,
        });
      return;
    case 'appointment':
      if (r.payload.politicianId === me) {
        out.push({
          key: 'player.promoted',
          vars: { actor: nameFrom(draft, me), office: officeLabel(tc, r.payload.officeKey) },
          importance: 4,
        });
      } else if (r.importance >= 3) {
        out.push({
          key: 'appointment',
          vars: {
            actor: nameFrom(draft, r.payload.politicianId),
            office: officeLabel(tc, r.payload.officeKey),
          },
          importance: 3,
        });
      }
      return;
    default:
      return;
  }
}

function nameFrom(draft: GameState, id: PoliticianId): string {
  return displayName(getPolitician(draft, id));
}
function officeLabel(tc: TurnContext, key: string): string {
  return tc.content.offices[key as keyof typeof tc.content.offices]?.label ?? key;
}

/**
 * Phase 12 — chronicle: weekly capital income, the briefing, ring-buffer trimming, compaction, and the
 * calendar rollover to the next week (the returned state is ready for the next planning phase).
 */
export function chroniclePhase(draft: GameState, tc: TurnContext): Headline[] {
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    if (!p || !isSitting(p)) continue;
    const income = cappedIncome(p, tc.content);
    if (income > 0)
      tc.emit(draft, {
        kind: 'capital.adjust',
        politicianId: id,
        delta: income,
        reason: 'weekly income',
      });
  }

  const headlines = compileHeadlines(draft, tc);
  // The briefing is read while planning the next week, so it belongs to that week (as at creation).
  draft.briefing = { turn: tc.turn + 1, date: addDays(tc.date, 7), headlines };

  // Seats are derived: recompute from sitting MPs.
  const seats: Record<PartyId, number> = {};
  for (const pid of draft.parties.ids) seats[pid] = 0;
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    if (p && isSitting(p) && p.partyId !== null) seats[p.partyId] = (seats[p.partyId] ?? 0) + 1;
  }
  draft.parliament.seats = seats;

  const minTurn = tc.turn - RECENT_HISTORY_TURNS + 1;
  draft.recentHistory = draft.recentHistory.filter((h) => h.turn >= minTurn);
  if (draft.recentHistory.length > MAX_RECENT_HISTORY) {
    // Keep the most important records, then the newest.
    const keep = draft.recentHistory
      .slice()
      .sort((a, b) => b.importance - a.importance || b.seq - a.seq)
      .slice(0, MAX_RECENT_HISTORY);
    const keepSet = new Set(keep.map((h) => h.seq));
    draft.recentHistory = draft.recentHistory.filter((h) => keepSet.has(h.seq));
  }

  // Keep the snapshot compact over decades (concluded divisions, stale knowledge, cooldowns…).
  compactState(draft, tc.turn);

  draft.player.plannedActions = [];
  draft.meta.turn = tc.turn + 1;
  draft.meta.date = addDays(tc.date, 7);
  draft.meta.simulationVersion = SIMULATION_VERSION;
  return headlines;
}
