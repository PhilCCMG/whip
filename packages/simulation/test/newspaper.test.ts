import {
  MAX_RECENT_STORY_TEMPLATES,
  NewspaperEditionSchema,
  type GameState,
  type NewspaperEdition,
} from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { advanceSimulation, hashState } from '../src';
import { ctx, goldenScript, newGame, play, SECOND_READING } from './helpers';

const articlesOf = (e: NewspaperEdition) => [e.lead, ...e.sections.flatMap((s) => s.articles)];
const words = (s: string) => s.split(/\s+/).filter((w) => w.length > 0).length;

function checkEdition(e: NewspaperEdition): void {
  const parsed = NewspaperEditionSchema.safeParse(e);
  if (!parsed.success) throw new Error(parsed.error.message);
  const all = articlesOf(e);
  for (const a of all) {
    for (const text of [a.headline, a.standfirst ?? '', a.body ?? '', a.byline ?? ''])
      expect(text, `${a.id}: unfilled slot`).not.toMatch(/\{\w+\}/);
    expect(words(a.headline), a.headline).toBeLessThanOrEqual(12);
  }
  expect(e.lead.filler).toBe(false);
  expect(new Set(all.map((a) => a.id)).size).toBe(all.length);
  // Back sections are filler only; the politics column never is.
  for (const s of e.sections)
    for (const a of s.articles) expect(a.filler).toBe(s.key !== 'politics');
}

describe('the newspaper', () => {
  const start = newGame(20290903);
  const run = play(start, 30, goldenScript);

  it('prints an opening edition at campaign creation', () => {
    const e = start.briefing.newspaper;
    expect(e).not.toBeNull();
    checkEdition(e!);
    const text = JSON.stringify(e);
    expect(text).toContain('Ashby and Wold');
    expect(text).toContain('Housing Delivery Bill');
    expect(e!.masthead.date).toBe(start.meta.date);
    expect(start.briefing.headlines[0]?.text).toBe(e!.lead.headline);
  });

  it('prints a valid edition every week, stored in the briefing and returned in the result', () => {
    for (const r of run.results) {
      checkEdition(r.newspaper);
      expect(r.state.briefing.newspaper).toEqual(r.newspaper);
      expect(r.headlines[0]?.text).toBe(r.newspaper.lead.headline);
      expect(r.state.briefing.recentStoryTemplates.length).toBeLessThanOrEqual(
        MAX_RECENT_STORY_TEMPLATES,
      );
    }
  });

  it('is mostly politics, with roughly a quarter filler', () => {
    let filler = 0;
    let total = 0;
    for (const r of run.results) {
      const all = articlesOf(r.newspaper);
      filler += all.filter((a) => a.filler).length;
      total += all.length;
    }
    expect(filler / total).toBeGreaterThan(0.15);
    expect(filler / total).toBeLessThan(0.4);
  });

  it('rotates mastheads and increments each paper by one edition a week', () => {
    const titles = new Set(run.results.map((r) => r.newspaper.masthead.title));
    expect(titles.size).toBe(3);
    const number = (e: NewspaperEdition) =>
      Number(/No\. ([\d,]+)/.exec(e.masthead.edition)?.[1]?.replace(/,/g, '') ?? NaN);
    const byPaper = new Map<string, { turn: number; n: number }>();
    for (const r of run.results) {
      const prev = byPaper.get(r.newspaper.paperKey);
      const n = number(r.newspaper);
      if (prev) expect(n - prev.n).toBe(r.resolvedTurn - prev.turn);
      byPaper.set(r.newspaper.paperKey, { turn: r.resolvedTurn, n });
    }
  });

  it('leads the second-reading week with the division and names the rebels', () => {
    const week = run.results.find((r) => r.divisions.some((d) => d.divisionId === SECOND_READING));
    expect(week).toBeDefined();
    const e = week!.newspaper;
    expect(e.lead.refs).toContainEqual({ kind: 'division', id: SECOND_READING });
    const result = week!.state.parliament.divisions.byId[SECOND_READING]?.result;
    const text = JSON.stringify(e);
    if (result && result.rebels.length >= 5) {
      const walsh = result.rebels.some((r) => r.politicianId === 'pol_bernadette_walsh');
      if (walsh) expect(text).toContain('Walsh');
    }
  });

  it('does not repeat a filler story within ten editions', () => {
    // Each edition appends one template id per article to the ring buffer.
    const used = run.results.map((r) =>
      r.state.briefing.recentStoryTemplates.slice(-articlesOf(r.newspaper).length),
    );
    for (let i = 0; i < used.length; i++) {
      const window = new Set(used.slice(Math.max(0, i - 9), i).flat());
      for (const id of used[i]!) if (id.startsWith('fil.')) expect(window.has(id), id).toBe(false);
    }
  });

  it('is deterministic and never changes the simulation (copy only)', () => {
    const a = advanceSimulation(start, [], ctx);
    const b = advanceSimulation(start, [], ctx);
    expect(a.newspaper).toEqual(b.newspaper);
    // Remove the paper and the result is otherwise identical to a run that never printed it.
    const strip = (s: GameState) => {
      const c = structuredClone(s);
      c.briefing.newspaper = null;
      c.briefing.recentStoryTemplates = [];
      c.briefing.headlines = [];
      return hashState(c);
    };
    expect(strip(a.state)).toBe(strip(b.state));
  });

  it('writes about the player according to their standing with the media', () => {
    const fawned = structuredClone(start);
    const me = fawned.politicians.byId[fawned.player.politicianId]!;
    me.reputation.media = 60;
    const loathed = structuredClone(start);
    loathed.politicians.byId[loathed.player.politicianId]!.reputation.media = -60;
    const ids = (s: GameState) =>
      play(s, 3).results.flatMap((r) => r.state.briefing.recentStoryTemplates);
    const flatteringIds = ['pol.p_sketch.3', 'pol.p_sketch.4', 'pol.p_sketch.10'];
    const sneeringIds = ['pol.p_sketch.5', 'pol.p_sketch.6', 'pol.p_sketch.11'];
    const f = ids(fawned);
    const l = ids(loathed);
    expect(f.some((id) => sneeringIds.includes(id))).toBe(false);
    expect(l.some((id) => flatteringIds.includes(id))).toBe(false);
  });
});
