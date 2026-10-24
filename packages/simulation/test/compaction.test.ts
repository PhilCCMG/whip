import type { Division, DivisionId } from '@whip/domain';
import { relationshipKey } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { advanceSimulation, checkInvariants, selectors } from '../src';
import { MAX_ROUTINE_CAREER_ENTRIES, pushCareer } from '../src/effects/apply';
import { defaultRelationship } from '../src/relationships/relationships';
import { cloneJson } from '../src/state/clone';
import {
  ARCHIVE_AFTER_TURNS,
  compactState,
  KEEP_RECENT_HELD_DIVISIONS,
} from '../src/state/compaction';
import { BILL, ctx, newGame, play, SECOND_READING } from './helpers';

describe('end-of-turn compaction', () => {
  const afterVote = play(newGame(201), 4).state; // the second reading was held in turn 4

  it('keeps votes but only explained MPs’ working data on a held division', () => {
    const d = afterVote.parliament.divisions.byId[SECOND_READING]!;
    const r = d.result!;
    expect(Object.keys(r.votes).length).toBe(r.eligible);
    const keep = new Set<string>([
      afterVote.player.politicianId,
      ...Object.keys(r.explanations),
      ...r.rebels.map((x) => x.politicianId),
    ]);
    for (const rec of [d.pressure, d.declarations, d.whipIntel, d.whipAttention])
      for (const id of Object.keys(rec)) expect(keep.has(id)).toBe(true);
    // Projections still work on the compacted division.
    const report = selectors.divisionReport(afterVote, SECOND_READING);
    expect(report.ayes + report.noes + report.abstentions).toBe(r.eligible);
  });

  it('prunes knowledge of held divisions and expired cooldowns', () => {
    for (const byDiv of Object.values(afterVote.player.knowledge.intentions))
      for (const did of Object.keys(byDiv))
        expect(afterVote.parliament.divisions.byId[did as DivisionId]?.status).toBe('scheduled');
    for (const until of Object.values(afterVote.events.cooldowns))
      expect(until).toBeGreaterThan(afterVote.meta.turn - 1);
  });

  it('archives old concluded divisions (keeping the most recent) and then their bills', () => {
    const s = cloneJson(afterVote);
    const div = s.parliament.divisions.byId[SECOND_READING]!;
    // Add synthetic held divisions on turns 1..7 so there is more than the keep-recent window.
    const extra: Division[] = Array.from({ length: 7 }, (_, i) => ({
      ...cloneJson(div),
      id: `div.synthetic_${i + 1}` as DivisionId,
      turn: i + 1,
    }));
    for (const d of extra) s.parliament.divisions.byId[d.id] = d;
    s.parliament.divisions.ids = Object.keys(s.parliament.divisions.byId).sort() as DivisionId[];
    const bill = s.parliament.bills.byId[BILL as never]!;
    bill.divisionIds = [...bill.divisionIds, ...extra.map((d) => d.id)];
    const now = 10 + ARCHIVE_AFTER_TURNS;
    compactState(s, now);
    const heldLeft = s.parliament.divisions.ids.filter(
      (id) => s.parliament.divisions.byId[id]!.status === 'held',
    );
    expect(heldLeft.length).toBe(KEEP_RECENT_HELD_DIVISIONS);
    // The most recent ones survive and still project.
    expect(heldLeft).toContain('div.synthetic_7');
    for (const id of heldLeft) expect(() => selectors.divisionReport(s, id)).not.toThrow();
    // The bill is still before the House or still has divisions, so it stays.
    expect(s.parliament.bills.byId[BILL as never]).toBeDefined();
    expect(checkInvariants(s, ctx)).toEqual([]);

    // A concluded bill whose divisions are all archived leaves the state and the agenda.
    const t = cloneJson(afterVote);
    const b = t.parliament.bills.byId[BILL as never]!;
    b.stage = 'defeated';
    for (const id of b.divisionIds) {
      const d = t.parliament.divisions.byId[id];
      if (d) {
        d.status = d.result ? 'held' : 'cancelled';
        d.turn = 1;
      }
    }
    // Five newer held divisions on another (synthetic) bill take the keep-recent slots.
    for (let i = 0; i < KEEP_RECENT_HELD_DIVISIONS; i++) {
      const d = { ...cloneJson(div), id: `div.newer_${i}` as DivisionId, turn: 20 + i };
      t.parliament.divisions.byId[d.id] = d;
    }
    t.parliament.divisions.ids = Object.keys(t.parliament.divisions.byId).sort() as DivisionId[];
    compactState(t, 1 + ARCHIVE_AFTER_TURNS);
    expect(t.parliament.bills.byId[BILL as never]).toBeUndefined();
    expect(t.government.agenda).not.toContain(BILL);
  });

  it('drops settled relationship edges (within ±1 of the default, no memories)', () => {
    const s = cloneJson(newGame(202));
    const ids = s.politicians.ids.filter((id) => !s.politicians.byId[id]!.isPlayer);
    const a = ids[10]!;
    const b = ids[11]!;
    const c = ids[12]!;
    const settled = {
      ...defaultRelationship(s, a, b),
      trust: defaultRelationship(s, a, b).trust + 1,
    };
    const kept = {
      ...defaultRelationship(s, a, c),
      respect: defaultRelationship(s, a, c).respect + 2,
    };
    s.relationships.edges[relationshipKey(a, b)] = settled;
    s.relationships.edges[relationshipKey(a, c)] = kept;
    const next = advanceSimulation(s, [], ctx).state;
    expect(next.relationships.edges[relationshipKey(a, b)]).toBeUndefined();
    expect(next.relationships.edges[relationshipKey(a, c)]).toBeDefined();
  });

  it('caps routine career entries but keeps every milestone', () => {
    const p = cloneJson(newGame(203).politicians.byId[afterVote.player.politicianId]!);
    const milestones = p.career.length;
    for (let i = 0; i < 40; i++)
      pushCareer(p, {
        date: '2030-01-01' as never,
        turn: i,
        kind: 'endorsed',
        officeKey: null,
        text: `e${i}`,
      });
    pushCareer(p, {
      date: '2030-01-01' as never,
      turn: 41,
      kind: 'appointed',
      officeKey: null,
      text: 'x',
    });
    expect(p.career.filter((c) => c.kind === 'endorsed').length).toBe(MAX_ROUTINE_CAREER_ENTRIES);
    expect(p.career.filter((c) => c.kind !== 'endorsed').length).toBe(milestones + 1);
    expect(p.career.at(-2)?.text).toBe('e39');
  });
});
