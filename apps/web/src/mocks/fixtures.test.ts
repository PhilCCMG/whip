import {
  ActionCatalogueResponseSchema,
  CampaignListResponseSchema,
  CampaignSummarySchema,
  CareerOverviewSchema,
  DivisionForecastSchema,
  DivisionResultSchema,
  ErrorEnvelopeSchema,
  HistoryPageSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PlanActionResponseSchema,
  PoliticianListResponseSchema,
  PoliticianProfileSchema,
  PoliticianSummarySchema,
  TurnReportSchema,
} from '@whip/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createMockBackend } from './backend';
import { buildCatalogue } from './catalogue';
import {
  CAMPAIGN_ID,
  campaignSummaryFixture,
  careerOverviewFixture,
  divisionForecastFixture,
  hdbSecondReadingResultFixture,
  historyFixture,
  parliamentFixture,
  partyFixture,
  politicianProfilesFixture,
  seedWorld,
  turnReportFixture,
} from './fixtures';

describe('mock fixtures', () => {
  it('parse with their contracts schemas', () => {
    expect(() => CampaignSummarySchema.parse(campaignSummaryFixture)).not.toThrow();
    expect(() => CareerOverviewSchema.parse(careerOverviewFixture)).not.toThrow();
    expect(() => ActionCatalogueResponseSchema.parse(buildCatalogue(seedWorld))).not.toThrow();
    expect(() => ParliamentViewSchema.parse(parliamentFixture)).not.toThrow();
    expect(() => PartyViewSchema.parse(partyFixture)).not.toThrow();
    expect(() =>
      HistoryPageSchema.parse({ items: historyFixture, nextCursor: null }),
    ).not.toThrow();
    expect(() => TurnReportSchema.parse(turnReportFixture)).not.toThrow();
    expect(() => DivisionForecastSchema.parse(divisionForecastFixture)).not.toThrow();
    expect(() => DivisionResultSchema.parse(hdbSecondReadingResultFixture)).not.toThrow();
    const summaries = politicianProfilesFixture.map((p) => PoliticianSummarySchema.parse(p));
    expect(() =>
      PoliticianListResponseSchema.parse({ items: summaries, nextCursor: null }),
    ).not.toThrow();
    for (const p of politicianProfilesFixture) {
      expect(() => PoliticianProfileSchema.parse(p), p.id).not.toThrow();
    }
  });

  it('models the First Weeks world', () => {
    expect(parliamentFixture.composition.reduce((s, p) => s + p.seats, 0)).toBe(650);
    const f = divisionForecastFixture.forecast;
    expect(f.ayes + f.noes + f.abstain + f.unknown).toBe(649);
    const d = hdbSecondReadingResultFixture;
    expect(d.ayes + d.noes + d.abstentions).toBe(649);
    expect(d.rebels.length).toBe(14);
    expect(politicianProfilesFixture.length).toBeGreaterThanOrEqual(55);
    expect(new Set(politicianProfilesFixture.map((p) => p.id)).size).toBe(
      politicianProfilesFixture.length,
    );
    expect(historyFixture.length).toBeGreaterThanOrEqual(40);
    for (const r of d.rebels)
      expect(politicianProfilesFixture.some((p) => p.id === r.id)).toBe(true);
  });
});

describe('mock backend', () => {
  const backend = createMockBackend();
  beforeEach(() => backend.reset());

  const base = `/api/v1/campaigns/${CAMPAIGN_ID}`;
  const json = async (res: Response): Promise<unknown> => res.json();
  const post = (path: string, body: unknown, key: string, method = 'POST') =>
    backend.fetch(`${base}${path}`, {
      method,
      headers: { 'content-type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(body),
    });
  const state = async () =>
    CareerOverviewSchema.parse(await json(await backend.fetch(`${base}/state`)));

  it('lists campaigns', async () => {
    const res = await backend.fetch('/api/v1/campaigns');
    const list = CampaignListResponseSchema.parse(await json(res));
    expect(list.items.map((c) => c.id)).toContain(CAMPAIGN_ID);
  });

  it('plans an action, consuming slots and capital, and replays by Idempotency-Key', async () => {
    const before = await state();
    const body = {
      expectedRevision: before.campaign.revision,
      action: { kind: 'build_relationship', params: { targetId: 'pol_fairley' } },
    };
    const res = await post('/actions', body, 'key-build-fairley');
    expect(res.status).toBe(201);
    expect(res.headers.get('ETag')).toBe(`"${CAMPAIGN_ID}:${before.campaign.revision + 1}"`);
    const planned = PlanActionResponseSchema.parse(await json(res));
    expect(planned.revision).toBe(before.campaign.revision + 1);
    expect(planned.diary.slotsUsed).toBe(before.diary.slotsUsed + 2);
    expect(planned.politicalCapital).toBe(before.standing.politicalCapital - 1);
    expect(planned.planned.label).toBe('Build relationship with Tom Fairley');

    const replay = PlanActionResponseSchema.parse(
      await json(await post('/actions', body, 'key-build-fairley')),
    );
    expect(replay.planned.id).toBe(planned.planned.id);
    expect((await state()).diary.planned).toHaveLength(before.diary.planned.length + 1);

    const reused = await post(
      '/actions',
      { ...body, action: { kind: 'meet_politician', params: { targetId: 'pol_walsh' } } },
      'key-build-fairley',
    );
    expect(reused.status).toBe(409);
    expect(ErrorEnvelopeSchema.parse(await json(reused)).error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('rejects stale revisions and ineligible actions', async () => {
    const s = await state();
    backend.bumpRevision(CAMPAIGN_ID);
    const res = await post(
      '/actions',
      {
        expectedRevision: s.campaign.revision,
        action: { kind: 'meet_politician', params: { targetId: 'pol_walsh' } },
      },
      'key-stale-1',
    );
    expect(res.status).toBe(409);
    const env = ErrorEnvelopeSchema.parse(await json(res));
    expect(env.error.code).toBe('REVISION_CONFLICT');
    expect(env.error.details).toEqual({ currentRevision: s.campaign.revision + 1 });

    const res2 = await post(
      '/actions',
      { expectedRevision: s.campaign.revision + 1, action: { kind: 'call_reshuffle', params: {} } },
      'key-reshuffle',
    );
    expect(res2.status).toBe(422);
    expect(ErrorEnvelopeSchema.parse(await json(res2)).error.code).toBe('ACTION_INELIGIBLE');

    const noKey = await backend.fetch(`${base}/advance`, {
      method: 'POST',
      body: JSON.stringify({ expectedRevision: s.campaign.revision + 1 }),
    });
    expect(noKey.status).toBe(400);
  });

  it('cancels a planned action and refunds it', async () => {
    const s = await state();
    const first = s.diary.planned[0];
    expect(first).toBeDefined();
    const res = await post(
      `/actions/${first?.id ?? ''}`,
      { expectedRevision: s.campaign.revision },
      'key-cancel-1',
      'DELETE',
    );
    expect(res.status).toBe(200);
    expect((await state()).diary.slotsUsed).toBe(s.diary.slotsUsed - 1);
  });

  it('responds to an event and restores it on cancel', async () => {
    const s = await state();
    const res = await post(
      '/actions',
      {
        expectedRevision: s.campaign.revision,
        action: {
          kind: 'respond_to_event',
          params: { eventId: 'evt_whips_summons', optionKey: 'reassure' },
        },
      },
      'key-event-1',
    );
    const planned = PlanActionResponseSchema.parse(await json(res));
    expect((await state()).pendingEvents.map((e) => e.id)).not.toContain('evt_whips_summons');
    const del = await backend.fetch(
      `${base}/actions/${planned.planned.id}?expectedRevision=${planned.revision}`,
      { method: 'DELETE', headers: { 'Idempotency-Key': 'key-event-cancel' } },
    );
    expect(del.status).toBe(200);
    expect((await state()).pendingEvents.map((e) => e.id)).toContain('evt_whips_summons');
  });

  it('advances the week and resolves the second reading in week 4', async () => {
    const none = await backend.fetch(`${base}/turn-report/latest`);
    expect(none.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await json(none)).error.code).toBe('NOT_FOUND');

    const s = await state();
    const r1 = TurnReportSchema.parse(
      await json(await post('/advance', { expectedRevision: s.campaign.revision }, 'key-adv-1')),
    );
    // turn/simDate are the week just resolved; nextTurn/nextSimDate the week now open.
    expect(r1.turn).toBe(3);
    expect(r1.simDate).toBe('2029-09-17');
    expect(r1.nextTurn).toBe(4);
    expect(r1.nextSimDate).toBe('2029-09-24');
    expect(r1.actionOutcomes[0]?.effects.some((e) => e.startsWith('Revealed: Daniel Osei'))).toBe(
      true,
    );
    expect(r1.divisions).toHaveLength(0);
    const s2 = await state();
    expect(s2.diary.planned).toHaveLength(0);
    expect(s2.campaign.turn).toBe(4);

    const r2 = TurnReportSchema.parse(
      await json(await post('/advance', { expectedRevision: s2.campaign.revision }, 'key-adv-2')),
    );
    expect(r2.turn).toBe(4);
    expect(r2.nextTurn).toBe(5);
    expect(r2.divisions[0]?.billTitle).toBe('Housing Delivery Bill');
    const latest = await backend.fetch(`${base}/turn-report/latest`);
    expect(latest.status).toBe(200);
    expect(TurnReportSchema.parse(await json(latest))).toEqual(r2);
    expect((await backend.fetch('/api/v1/campaigns/cmp_nope/turn-report/latest')).status).toBe(404);
    const parl = ParliamentViewSchema.parse(await json(await backend.fetch(`${base}/parliament`)));
    expect(parl.recentDivisions[0]?.id).toBe('div_hdb_2r');
    expect(parl.bills.find((b) => b.id === 'bill_hdb')?.stage).toBe('Committee stage');
  });

  it('paginates history by cursor and filters politicians', async () => {
    const p1 = HistoryPageSchema.parse(await json(await backend.fetch(`${base}/history?limit=20`)));
    expect(p1.items).toHaveLength(20);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = HistoryPageSchema.parse(
      await json(await backend.fetch(`${base}/history?limit=20&cursor=${p1.nextCursor ?? ''}`)),
    );
    expect(p2.items[0]?.seq).toBeLessThan(p1.items[19]?.seq ?? 0);
    const ids = new Set([...p1.items, ...p2.items].map((h) => h.seq));
    expect(ids.size).toBe(p1.items.length + p2.items.length);

    const npp = PoliticianListResponseSchema.parse(
      await json(
        await backend.fetch(
          `${base}/politicians?partyId=party.npp&factionId=faction.heartlands&limit=100`,
        ),
      ),
    );
    expect(npp.items.length).toBeGreaterThan(5);
    expect(npp.items.every((p) => p.factionId === 'faction.heartlands')).toBe(true);
    expect(npp.items.every((p) => p.factionName === 'Heartlands')).toBe(true);
    const search = PoliticianListResponseSchema.parse(
      await json(await backend.fetch(`${base}/politicians?search=osei`)),
    );
    expect(search.items.map((p) => p.id)).toEqual(['pol_osei']);
    const profile = PoliticianProfileSchema.parse(
      await json(await backend.fetch(`${base}/politicians/pol_walsh`)),
    );
    expect(profile.name).toBe('Bernadette Walsh');
  });

  it('creates and deletes campaigns', async () => {
    const res = await backend.fetch('/api/v1/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test run',
        scenarioKey: 'first_weeks',
        player: {
          firstName: 'Ann',
          lastName: 'Lee',
          gender: 'female',
          strength: 'policy',
          ideologyPreset: 'heartlands',
        },
      }),
    });
    expect(res.status).toBe(201);
    const created = CampaignSummarySchema.parse(await json(res));
    expect(created.turn).toBe(1);
    expect(created.playerName).toBe('Ann Lee');
    const del = await backend.fetch(`/api/v1/campaigns/${created.id}`, { method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await backend.fetch(`/api/v1/campaigns/${created.id}`)).status).toBe(404);
  });
});
