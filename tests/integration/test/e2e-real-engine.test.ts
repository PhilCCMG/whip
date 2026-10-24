import {
  ActionCatalogueResponseSchema,
  CampaignSummarySchema,
  CareerOverviewSchema,
  HistoryPageSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PlanActionResponseSchema,
  PoliticianListResponseSchema,
  PoliticianProfileSchema,
  TurnReportSchema,
  type CampaignSummary,
  type HistoryItem,
  type TurnReport,
} from '@whip/contracts';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, errorCode, key, newCampaign, uniqueUser } from './helpers';

/**
 * The vertical slice end to end through the Worker, the Campaign DO and the real
 * @whip/simulation engine (docs/architecture/07-vertical-slice.md §6).
 */

const BILL = 'bill.housing_delivery';
const SECOND_READING = 'div.hdb_second_reading';
const FAIRLEY = 'pol_tom_fairley';
const WALSH = 'pol_bernadette_walsh';
const OSEI = 'pol_daniel_osei';
const SEED = 20290903;

function stubFor(id: string) {
  return env.CAMPAIGN.get(env.CAMPAIGN.idFromName(id));
}

async function json(path: string, user: string): Promise<unknown> {
  const res = await api(path, { user });
  expect(res.status, path).toBe(200);
  return res.json();
}

async function create(user: string): Promise<CampaignSummary> {
  const res = await api('/api/v1/campaigns', { user, body: { ...newCampaign, seed: SEED } });
  expect(res.status).toBe(201);
  return CampaignSummarySchema.parse(await res.json());
}

async function plan(
  user: string,
  base: string,
  revision: number,
  action: { kind: string; params: Record<string, unknown> },
) {
  const res = await api(`${base}/actions`, {
    user,
    idempotencyKey: key('plan'),
    body: { expectedRevision: revision, action },
  });
  expect(res.status, `${action.kind}: ${await res.clone().text()}`).toBe(200);
  return PlanActionResponseSchema.parse(await res.json());
}

async function advance(user: string, base: string, revision: number): Promise<TurnReport> {
  const res = await api(`${base}/advance`, {
    user,
    idempotencyKey: key('adv'),
    body: { expectedRevision: revision },
  });
  expect(res.status).toBe(200);
  return TurnReportSchema.parse(await res.json());
}

/** The scripted slice: returns every turn report. */
async function playSlice(user: string, c: CampaignSummary): Promise<TurnReport[]> {
  const base = `/api/v1/campaigns/${c.id}`;
  let rev = c.revision;
  const reports: TurnReport[] = [];
  // Turn 1: meet a waverer and publicly back the bill, lobbying three likely rebels.
  rev = (await plan(user, base, rev, { kind: 'meet_politician', params: { targetId: FAIRLEY } }))
    .revision;
  rev = (
    await plan(user, base, rev, {
      kind: 'support_legislation',
      params: { billId: BILL, lobbyTargetIds: [FAIRLEY, WALSH, OSEI] },
    })
  ).revision;
  reports.push(await advance(user, base, rev));
  rev += 1;
  // Turn 2: meet Walsh. Turns 3–4: no player actions.
  rev = (await plan(user, base, rev, { kind: 'meet_politician', params: { targetId: WALSH } }))
    .revision;
  for (let i = 0; i < 3; i++) {
    reports.push(await advance(user, base, rev));
    rev += 1;
  }
  return reports;
}

async function readAll(user: string, base: string) {
  return {
    summary: await json(base, user),
    state: await json(`${base}/state`, user),
    catalogue: await json(`${base}/actions/catalogue`, user),
    parliament: await json(`${base}/parliament`, user),
    party: await json(`${base}/party`, user),
    politicians: await json(`${base}/politicians?limit=50&sort=influence`, user),
    fairley: await json(`${base}/politicians/${FAIRLEY}`, user),
    history: await json(`${base}/history?limit=100`, user),
    report: await json(`${base}/turn-report/latest`, user),
  };
}

async function currentHash(id: string): Promise<{ revision: number; hash: string }> {
  return runInDurableObject(stubFor(id), (_instance, state) => {
    const row = state.storage.sql
      .exec<{ revision: number; state_hash: string }>(
        "SELECT r.revision, r.state_hash FROM revisions r JOIN meta m ON m.key = 'current_revision' AND CAST(m.value AS INTEGER) = r.revision",
      )
      .one();
    return { revision: row.revision, hash: row.state_hash };
  });
}

describe('vertical slice end to end (real engine)', () => {
  it('create → world → plan → advance ×4 → persisted → reload → history', async () => {
    const user = uniqueUser('e2e');

    // (1) Create.
    const c = await create(user);
    expect(c).toMatchObject({ revision: 1, turn: 1, simDate: '2029-09-03', status: 'active' });
    const base = `/api/v1/campaigns/${c.id}`;
    const row = await env.DB.prepare(
      'SELECT player_politician_id, player_name FROM campaigns WHERE id = ?',
    )
      .bind(c.id)
      .first<{ player_politician_id: string | null; player_name: string }>();
    expect(row?.player_politician_id).toBe('pol_player');

    // (2) Initial world.
    const overview = CareerOverviewSchema.parse(await json(`${base}/state`, user));
    expect(overview.player.partyId).toBe('party.npp');
    expect(overview.standing.politicalCapital).toBe(3);
    expect(overview.diary).toMatchObject({ slotsTotal: 5, slotsUsed: 0 });
    const parl0 = ParliamentViewSchema.parse(await json(`${base}/parliament`, user));
    expect(parl0.totalSeats).toBe(650);
    expect(parl0.composition).toHaveLength(7);
    expect(parl0.bills.map((b) => b.id)).toContain(BILL);
    expect(parl0.upcomingDivisions.map((d) => d.id)).toContain(SECOND_READING);
    const before = PoliticianProfileSchema.parse(
      await json(`${base}/politicians/${FAIRLEY}`, user),
    );
    expect(before.knownIntention).toBe('unknown'); // fog of war
    const npp = PoliticianListResponseSchema.parse(
      await json(`${base}/politicians?partyId=party.npp&limit=100`, user),
    );
    expect(npp.items).toHaveLength(100);
    expect(npp.nextCursor).toBe('100');
    const heartlands = PoliticianListResponseSchema.parse(
      await json(`${base}/politicians?factionId=faction.heartlands&limit=100`, user),
    );
    expect(heartlands.items.every((p) => p.factionId === 'faction.heartlands')).toBe(true);
    PartyViewSchema.parse(await json(`${base}/party`, user));
    ActionCatalogueResponseSchema.parse(await json(`${base}/actions/catalogue`, user));
    const noReport = await api(`${base}/turn-report/latest`, { user });
    expect(noReport.status).toBe(404);
    expect(await errorCode(noReport)).toBe('NOT_FOUND');

    // (3) An ineligible action is refused with reasons and commits nothing.
    const resh = await api(`${base}/actions`, {
      user,
      idempotencyKey: key('resh'),
      body: { expectedRevision: 1, action: { kind: 'call_reshuffle', params: {} } },
    });
    expect(resh.status).toBe(422);
    const reshBody = await resh.json<{ error: { code: string; details: { reasons: string[] } } }>();
    expect(reshBody.error.code).toBe('ACTION_INELIGIBLE');
    expect(reshBody.error.details.reasons.join(' ')).toMatch(/Prime Minister/i);
    expect(CampaignSummarySchema.parse(await json(base, user)).revision).toBe(1);

    // (3–4) Plan and advance through turn 4.
    const reports = await playSlice(user, c);
    expect(reports.map((r) => r.turn)).toEqual([1, 2, 3, 4]);
    expect(reports.map((r) => r.nextTurn)).toEqual([2, 3, 4, 5]);
    expect(reports[0]?.actionOutcomes.map((o) => o.kind)).toEqual([
      'meet_politician',
      'support_legislation',
    ]);
    const met = PoliticianProfileSchema.parse(await json(`${base}/politicians/${FAIRLEY}`, user));
    expect(met.knownIntention).not.toBe('unknown');
    const last = reports[3];
    expect(last?.divisions.map((d) => d.id)).toEqual([SECOND_READING]);
    const division = last?.divisions[0];
    expect((division?.ayes ?? 0) + (division?.noes ?? 0) + (division?.abstentions ?? 0)).toBe(649);
    expect(division?.playerVote).toBe('aye');

    // (5) Persisted: the projection and the parliament view agree with the report.
    const summary = CampaignSummarySchema.parse(await json(base, user));
    expect(summary).toMatchObject({ turn: 5, revision: last?.revision });
    const parl = ParliamentViewSchema.parse(await json(`${base}/parliament`, user));
    expect(parl.recentDivisions[0]).toEqual(division);
    expect(parl.upcomingDivisions.map((d) => d.id)).not.toContain(SECOND_READING);
    expect(TurnReportSchema.parse(await json(`${base}/turn-report/latest`, user))).toEqual(last);

    // (6) Reload: everything identical after dropping the DO's hot state (cold decode from storage).
    const hot = await readAll(user, base);
    const hashBefore = await currentHash(c.id);
    await runInDurableObject(stubFor(c.id), (instance) => instance.service.evictCache());
    const cold = await readAll(user, base);
    expect(cold).toEqual(hot);
    expect(await currentHash(c.id)).toEqual(hashBefore);
    expect(hashBefore.revision).toBe(summary.revision);

    // (7) History: division record, pagination, filters.
    const divisions = HistoryPageSchema.parse(await json(`${base}/history?type=division`, user));
    expect(divisions.items).toHaveLength(1);
    expect(divisions.items[0]).toMatchObject({ type: 'division', turn: 4 });
    const seqs: number[] = [];
    const pages: HistoryItem[][] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor ? `?limit=10&cursor=${cursor}` : '?limit=10';
      const page = HistoryPageSchema.parse(await json(`${base}/history${q}`, user));
      pages.push(page.items);
      seqs.push(...page.items.map((i) => i.seq));
      cursor = page.nextCursor;
    } while (cursor);
    expect(pages.length).toBeGreaterThan(1);
    expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
    expect(new Set(seqs).size).toBe(seqs.length);
    const flat = pages.flat();
    expect(HistoryPageSchema.parse(hot.history).items).toEqual(flat.slice(0, 100));
    // The engine's two opening records (campaign created, player elected) were persisted first.
    expect(flat.slice(-2).map((i) => i.seq)).toEqual([2, 1]);
    expect(flat.slice(-2).map((i) => i.type)).toContain('campaign');
    const fairley = HistoryPageSchema.parse(
      await json(`${base}/history?politicianId=${FAIRLEY}`, user),
    );
    expect(fairley.items.length).toBeGreaterThan(0);
    expect(
      fairley.items.every((i) => i.actorIds.includes(FAIRLEY) || i.subjectIds.includes(FAIRLEY)),
    ).toBe(true);
    expect(fairley.items.some((i) => i.type === 'action_outcome')).toBe(true);
  });

  it('is deterministic across the API: same seed + same actions ⇒ identical payloads', async () => {
    const user = uniqueUser('det');
    const a = await create(user);
    const b = await create(user);
    const ra = await playSlice(user, a);
    const rb = await playSlice(user, b);
    expect(rb).toEqual(ra);
    const pa = await json(`/api/v1/campaigns/${a.id}/parliament`, user);
    const pb = await json(`/api/v1/campaigns/${b.id}/parliament`, user);
    expect(pb).toEqual(pa);
    expect((await currentHash(b.id)).hash).toBe((await currentHash(a.id)).hash);
  });
});
