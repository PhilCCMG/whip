import type { BillId, Division, DivisionId, GameState, PoliticianId } from '@whip/domain';
import { pruneRebellions } from '../effects/apply';
import { billBeforeHouse, compareStrings } from './access';

/*
 * End-of-turn compaction (phase 12). The snapshot must stay compact over decades of play, because
 * the full record lives in the history table (doc 01 "historical continuity", ADR-0004): the state
 * keeps only what rules, AI and the player's views still read.
 */

/** Concluded divisions (and then their bills) older than this many turns leave the state. */
export const ARCHIVE_AFTER_TURNS = 26;
/** …except the most recent held divisions, which stay complete for the parliament view. */
export const KEEP_RECENT_HELD_DIVISIONS = 5;

export function compactState(draft: GameState, turn: number): void {
  for (const id of draft.parliament.divisions.ids) {
    const d = draft.parliament.divisions.byId[id];
    if (d && d.status !== 'scheduled') compactConcludedDivision(draft, d);
  }
  archiveOldDivisions(draft, turn);
  pruneKnowledge(draft);
  pruneCooldowns(draft, turn);
  for (const id of draft.politicians.ids) {
    const p = draft.politicians.byId[id];
    if (p) pruneRebellions(p, turn);
  }
}

/** Keep only entries whose key is in `keep`; returns the same object when nothing would go. */
function keepOnly<V>(
  rec: Record<PoliticianId, V>,
  keep: ReadonlySet<string>,
): Record<PoliticianId, V> {
  const keys = Object.keys(rec) as PoliticianId[];
  if (keys.every((k) => keep.has(k))) return rec;
  const out = {} as Record<PoliticianId, V>;
  for (const k of keys) if (keep.has(k)) out[k] = rec[k] as V;
  return out;
}

/**
 * Once a division is over, the per-MP working data (lobbying pressure, declarations, whip intel and
 * attention) is only kept for the MPs whose vote is explained in the result: the player,
 * high-fidelity MPs and rebels. `result.votes` is always kept (career records, promise checks,
 * the division list). Idempotent.
 */
function compactConcludedDivision(draft: GameState, d: Division): void {
  const keep = new Set<string>([draft.player.politicianId]);
  if (d.result) {
    for (const id of Object.keys(d.result.explanations)) keep.add(id);
    for (const r of d.result.rebels) keep.add(r.politicianId);
  }
  d.declarations = keepOnly(d.declarations, keep);
  d.pressure = keepOnly(d.pressure, keep);
  d.whipIntel = keepOnly(d.whipIntel, keep);
  d.whipAttention = keepOnly(d.whipAttention, keep);
}

/**
 * Concluded divisions older than ARCHIVE_AFTER_TURNS are dropped: their history record already
 * holds the counts, outcome and rebel ids. The most recent KEEP_RECENT_HELD_DIVISIONS held ones
 * always stay. A concluded bill goes once none of its divisions remain (concluded bills may keep
 * ids of archived divisions in `divisionIds`; the history table has them).
 */
function archiveOldDivisions(draft: GameState, turn: number): void {
  const table = draft.parliament.divisions;
  const recentHeld = new Set(
    table.ids
      .map((id) => table.byId[id])
      .filter((d): d is Division => d !== undefined && d.status === 'held')
      .sort((a, b) => b.turn - a.turn || compareStrings(a.id, b.id))
      .slice(0, KEEP_RECENT_HELD_DIVISIONS)
      .map((d) => d.id),
  );
  const archived = new Set<DivisionId>();
  for (const id of table.ids) {
    const d = table.byId[id];
    if (!d || d.status === 'scheduled' || recentHeld.has(id)) continue;
    if (d.turn <= turn - ARCHIVE_AFTER_TURNS) archived.add(id);
  }
  if (archived.size === 0) return;
  for (const id of archived) delete table.byId[id];
  table.ids = table.ids.filter((id) => !archived.has(id));

  const bills = draft.parliament.bills;
  const gone = new Set<BillId>();
  for (const id of bills.ids) {
    const b = bills.byId[id];
    if (!b || billBeforeHouse(b)) continue;
    if (b.divisionIds.every((did) => table.byId[did] === undefined)) gone.add(id);
  }
  if (gone.size === 0) return;
  for (const id of gone) delete bills.byId[id];
  bills.ids = bills.ids.filter((id) => !gone.has(id));
  draft.government.agenda = draft.government.agenda.filter((id) => !gone.has(id));
}

/** The player's knowledge of voting intentions only matters while a division is still to come. */
function pruneKnowledge(draft: GameState): void {
  const intentions = draft.player.knowledge.intentions;
  for (const pid of Object.keys(intentions) as PoliticianId[]) {
    const byDivision = intentions[pid];
    if (!byDivision) continue;
    for (const did of Object.keys(byDivision) as DivisionId[]) {
      if (draft.parliament.divisions.byId[did]?.status !== 'scheduled') delete byDivision[did];
    }
    if (Object.keys(byDivision).length === 0) delete intentions[pid];
  }
}

/** A cooldown ending at or before this turn can never block anything again. */
function pruneCooldowns(draft: GameState, turn: number): void {
  const cooldowns = draft.events.cooldowns;
  for (const key of Object.keys(cooldowns)) {
    if ((cooldowns[key] ?? 0) <= turn) delete cooldowns[key];
  }
}
