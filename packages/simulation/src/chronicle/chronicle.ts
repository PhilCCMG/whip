import {
  addDays,
  MAX_RECENT_HISTORY,
  RECENT_HISTORY_TURNS,
  type GameState,
  type Headline,
  type PartyId,
} from '@whip/domain';
import { cappedIncome } from '../careers/capital';
import { SIMULATION_VERSION } from '../context';
import { isSitting } from '../state/access';
import { compactState } from '../state/compaction';
import type { TurnContext } from '../turn/context';
import { compileNewspaper, headlinesFrom } from './newspaper';

/**
 * Phase 12 — chronicle: weekly capital income, the briefing and newspaper, ring-buffer trimming, compaction, and the
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

  // The weekly paper, built before compaction while this week's division results are intact.
  const { edition, recentStoryTemplates } = compileNewspaper(draft, tc);
  const headlines = headlinesFrom(edition);
  // The briefing is read while planning the next week, so it belongs to that week (as at creation).
  draft.briefing = {
    turn: tc.turn + 1,
    date: addDays(tc.date, 7),
    headlines,
    newspaper: edition,
    recentStoryTemplates,
  };

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
