import {
  ActionCatalogueResponseSchema,
  CareerOverviewSchema,
  DiarySchema,
  HistoryTypeSchema,
  NewspaperSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PoliticianListQuerySchema,
  PoliticianListResponseSchema,
  PoliticianProfileSchema,
  TurnReportSchema,
  type CampaignSummary,
} from '@whip/contracts';
import type { GameState, PoliticianId } from '@whip/domain';
import { describe, expect, it } from 'vitest';
import { contentLoadCount, realRuntime } from '.';

const { engine, projections } = realRuntime;

const player = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  strength: 'negotiation',
  ideologyPreset: 'moderniser',
} as const;

const SEED = 42;
const BILL = 'bill.housing_delivery';
const SECOND_READING = 'div.hdb_second_reading';
const WALSH = 'pol_bernadette_walsh';

const summary = (s: GameState): CampaignSummary => ({
  id: 'c1',
  name: 'Test',
  scenarioKey: 'first_weeks',
  status: 'active',
  simDate: s.meta.date,
  turn: s.meta.turn,
  revision: 1,
  playerName: 'Ada Lovelace',
  simulationVersion: engine.version,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const listQuery = (q: Record<string, unknown> = {}) => PoliticianListQuerySchema.parse(q);

function plan(state: GameState, kind: string, params: Record<string, unknown>): GameState {
  const r = engine.planAction(state, { kind: kind as never, params });
  if (!r.ok) throw new Error(`${kind} rejected: ${r.reasons.join('; ')}`);
  return r.state;
}

const created = engine.create({ scenarioKey: 'first_weeks', seed: SEED, player });
const initial = created.state;

describe('real engine adapter', () => {
  it('creates the First Weeks world and hands over the opening history', () => {
    expect(engine.meta(initial)).toMatchObject({ turn: 1, simDate: '2029-09-03' });
    expect(engine.meta(initial).playerName).toBe('Ada Lovelace');
    const rows = projections.historyRecordsToRows(created.history);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    for (const r of rows) HistoryTypeSchema.parse(r.type);
    expect(engine.deserialize(engine.serialize(initial))).toEqual(initial);
  });

  it('maps ineligibility to readable reasons', () => {
    const r = engine.planAction(initial, { kind: 'call_reshuffle', params: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons.join(' ')).toMatch(/Prime Minister/i);
  });

  it('loads the content registry once per isolate', () => {
    projections.parliament(initial);
    projections.actionCatalogue(initial);
    expect(contentLoadCount()).toBe(1);
  });
});

describe('real projections parse with their contracts schemas', () => {
  it('career overview, catalogue, parliament, party, diary', () => {
    const overview = CareerOverviewSchema.parse(
      projections.careerOverview(initial, summary(initial)),
    );
    expect(overview.player.constituencyName).toMatch(/Ashby/);
    expect(overview.standing.politicalCapital).toBe(3);
    expect(overview.diary.slotsTotal).toBe(5);
    expect(overview.upcoming.some((u) => u.refId === SECOND_READING)).toBe(true);

    const cat = ActionCatalogueResponseSchema.parse(projections.actionCatalogue(initial));
    expect(cat.items.find((i) => i.kind === 'call_reshuffle')?.eligible).toBe(false);
    expect(cat.items.find((i) => i.kind === 'meet_politician')?.params[0]?.name).toBe('targetId');

    const parl = ParliamentViewSchema.parse(projections.parliament(initial));
    expect(parl.totalSeats).toBe(650);
    expect(parl.composition).toHaveLength(7);
    expect(parl.bills.map((b) => b.id)).toContain(BILL);
    const div = parl.upcomingDivisions.find((d) => d.id === SECOND_READING);
    expect(div).toBeDefined();
    // Fog of war: the player knows almost nobody's intention at the start.
    expect(div?.forecast.unknown).toBeGreaterThan(500);

    const party = PartyViewSchema.parse(projections.party(initial));
    expect(party).toMatchObject({ id: 'party.npp', inGovernment: true });
    expect(party.factions.map((f) => f.id)).toContain('faction.heartlands');
    expect(party.powerMap.length).toBeLessThanOrEqual(12);

    DiarySchema.parse(projections.diary(initial).diary);
  });

  it('politician list paginates and filters in the projection', () => {
    const page = PoliticianListResponseSchema.parse(
      projections.politicianList(initial, listQuery({ limit: 25 })),
    );
    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).toBe('25');
    const next = PoliticianListResponseSchema.parse(
      projections.politicianList(initial, listQuery({ limit: 25, cursor: page.nextCursor })),
    );
    expect(next.items[0]?.id).not.toBe(page.items[0]?.id);

    const heartlands = projections.politicianList(
      initial,
      listQuery({ factionId: 'faction.heartlands', limit: 100 }),
    );
    expect(heartlands.items.length).toBeGreaterThan(10);
    expect(heartlands.items.every((p) => p.factionId === 'faction.heartlands')).toBe(true);

    const walsh = projections.politicianList(initial, listQuery({ search: 'walsh' }));
    expect(walsh.items.map((p) => p.id)).toContain(WALSH);

    const byInfluence = projections.politicianList(
      initial,
      listQuery({ sort: 'influence', limit: 5 }),
    );
    const inf = byInfluence.items.map((p) => p.influence);
    expect([...inf].sort((a, b) => b - a)).toEqual(inf);
  });

  it('profiles respect fog of war and 404 unknown ids', () => {
    const profile = PoliticianProfileSchema.parse(projections.politicianProfile(initial, WALSH));
    expect(profile.factionId).toBe('faction.heartlands');
    expect(profile.knownIntention).toBe('unknown');
    expect(projections.politicianProfile(initial, 'pol_nobody')).toBeNull();
    const me = PoliticianProfileSchema.parse(
      projections.politicianProfile(initial, initial.player.politicianId),
    );
    expect(me.isPlayer).toBe(true);
    expect(me.relationshipToPlayer).toBeNull();
  });

  it('meeting an MP reveals their intention; turn report covers the Second Reading', () => {
    let s = plan(initial, 'meet_politician', { targetId: WALSH });
    s = plan(s, 'support_legislation', { billId: BILL, lobbyTargetIds: [] });
    let report = null;
    for (let i = 0; i < 4; i++) {
      const before = s;
      const out = engine.advance(s);
      report = TurnReportSchema.parse(
        projections.turnReport({ before, output: out, revision: i + 2 }),
      );
      expect(report).toMatchObject({ turn: i + 1, nextTurn: i + 2 });
      for (const r of projections.historyRecordsToRows(out.history))
        HistoryTypeSchema.parse(r.type);
      s = out.state;
      if (i === 0) {
        const walsh = projections.politicianProfile(s, WALSH);
        expect(walsh?.knownIntention).not.toBe('unknown');
        expect(report.actionOutcomes.map((o) => o.kind)).toEqual([
          'meet_politician',
          'support_legislation',
        ]);
      }
    }
    expect(report?.divisions.map((d) => d.id)).toEqual([SECOND_READING]);
    const parl = ParliamentViewSchema.parse(projections.parliament(s));
    expect(parl.recentDivisions[0]).toMatchObject({ id: SECOND_READING });
    const d = parl.recentDivisions[0];
    expect((d?.ayes ?? 0) + (d?.noes ?? 0) + (d?.abstentions ?? 0)).toBe(649);
    CareerOverviewSchema.parse(projections.careerOverview(s, summary(s)));
    PartyViewSchema.parse(projections.party(s));
    // After the division the list shows the next division's intention (third reading) or votes.
    PoliticianListResponseSchema.parse(projections.politicianList(s, listQuery()));
    expect(s.politicians.byId[WALSH as PoliticianId]).toBeDefined();
  });

  it('maps the newspaper into the turn report and career overview, keeping headlines', () => {
    const opening = CareerOverviewSchema.parse(
      projections.careerOverview(initial, summary(initial)),
    );
    const paper = NewspaperSchema.parse(opening.briefing.newspaper);
    expect(paper.masthead.date).toBe('2029-09-03');
    expect(opening.briefing.headlines[0]?.text).toBe(paper.lead.headline);
    // Optional article fields are omitted, never null.
    for (const a of [paper.lead, ...paper.sections.flatMap((x) => x.articles)]) {
      for (const k of ['standfirst', 'byline', 'body'] as const) expect(a[k]).not.toBeNull();
    }

    const out = engine.advance(initial);
    const report = TurnReportSchema.parse(
      projections.turnReport({ before: initial, output: out, revision: 2 }),
    );
    expect(report.newspaper).toBeDefined();
    const politics = report.newspaper?.sections.find((x) => x.key === 'politics')?.articles ?? [];
    expect(report.headlines.map((h) => h.text)).toEqual(
      [report.newspaper!.lead, ...politics].slice(0, 5).map((a) => a.headline),
    );
    const after = CareerOverviewSchema.parse(
      projections.careerOverview(out.state, summary(out.state)),
    );
    expect(after.briefing.newspaper).toEqual(report.newspaper);
  });

  it('still parses stored turn reports and states from before the newspaper', () => {
    const legacy = {
      revision: 3,
      turn: 2,
      simDate: '2029-09-10',
      nextTurn: 3,
      nextSimDate: '2029-09-17',
      headlines: [{ text: 'All eyes on the housing bill', importance: 1 }],
      actionOutcomes: [],
      divisions: [],
      notifications: [],
      capitalChange: 1,
    };
    expect(TurnReportSchema.parse(legacy).newspaper).toBeUndefined();
    // A v2 save migrates with no edition: the overview simply omits the paper until next week.
    const v2 = JSON.parse(engine.serialize(initial)) as {
      meta: { schemaVersion: number };
      briefing: Record<string, unknown>;
    };
    v2.meta.schemaVersion = 2;
    delete v2.briefing.newspaper;
    delete v2.briefing.recentStoryTemplates;
    const migrated = engine.deserialize(JSON.stringify(v2));
    const overview = CareerOverviewSchema.parse(
      projections.careerOverview(migrated, summary(migrated)),
    );
    expect(overview.briefing.newspaper).toBeUndefined();
    expect(overview.briefing.headlines.length).toBeGreaterThan(0);
  });
});
