import {
  ActionCatalogueResponseSchema,
  CampaignListResponseSchema,
  CampaignSummarySchema,
  CancelActionResponseSchema,
  CareerOverviewSchema,
  HistoryPageSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PlanActionResponseSchema,
  PoliticianListResponseSchema,
  PoliticianProfileSchema,
  TurnReportSchema,
} from '@whip/contracts';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, createCampaign, errorCode, key, uniqueUser } from './helpers';

const meet = { kind: 'meet_politician', params: { politicianId: 'pol-1' } };

function stubFor(id: string) {
  return env.CAMPAIGN.get(env.CAMPAIGN.idFromName(id));
}

describe('campaign lifecycle (fake engine)', () => {
  it('create → list → plan → cancel → advance → history', async () => {
    const user = uniqueUser();
    const created = await createCampaign(user);
    expect(created).toMatchObject({ status: 'active', revision: 1, playerName: 'Ada Lovelace' });

    const list = CampaignListResponseSchema.parse(
      await (await api('/api/v1/campaigns', { user })).json(),
    );
    expect(list.items.map((c) => c.id)).toEqual([created.id]);

    const base = `/api/v1/campaigns/${created.id}`;
    const overview = CareerOverviewSchema.parse(
      await (await api(`${base}/state`, { user })).json(),
    );
    expect(overview.campaign).toMatchObject({ id: created.id, revision: 1 });
    ActionCatalogueResponseSchema.parse(
      await (await api(`${base}/actions/catalogue`, { user })).json(),
    );
    ParliamentViewSchema.parse(await (await api(`${base}/parliament`, { user })).json());
    PartyViewSchema.parse(await (await api(`${base}/party`, { user })).json());
    const pols = PoliticianListResponseSchema.parse(
      await (await api(`${base}/politicians?limit=2`, { user })).json(),
    );
    expect(pols.items).toHaveLength(2);
    expect(pols.nextCursor).not.toBeNull();
    PoliticianProfileSchema.parse(await (await api(`${base}/politicians/pol-1`, { user })).json());
    expect((await api(`${base}/politicians/nobody`, { user })).status).toBe(404);

    const planRes = await api(`${base}/actions`, {
      user,
      idempotencyKey: key('plan'),
      body: { expectedRevision: 1, action: meet },
    });
    expect(planRes.status).toBe(200);
    const planned = PlanActionResponseSchema.parse(await planRes.json());
    expect(planned.revision).toBe(2);
    expect(planRes.headers.get('etag')).toBe(`"${created.id}:2"`);

    // A second plan, then cancel it via ?expectedRevision=
    const second = PlanActionResponseSchema.parse(
      await (
        await api(`${base}/actions`, {
          user,
          idempotencyKey: key('plan2'),
          body: { expectedRevision: 2, action: meet },
        })
      ).json(),
    );
    const cancelRes = await api(`${base}/actions/${second.planned.id}?expectedRevision=3`, {
      user,
      method: 'DELETE',
      idempotencyKey: key('cancel'),
    });
    expect(cancelRes.status).toBe(200);
    const cancelled = CancelActionResponseSchema.parse(await cancelRes.json());
    expect(cancelled).toMatchObject({ revision: 4, diary: { slotsUsed: 1 } });

    const ineligible = await api(`${base}/actions`, {
      user,
      idempotencyKey: key('resh'),
      body: { expectedRevision: 4, action: { kind: 'call_reshuffle', params: {} } },
    });
    expect(ineligible.status).toBe(422);
    expect(await errorCode(ineligible)).toBe('ACTION_INELIGIBLE');

    const advRes = await api(`${base}/advance`, {
      user,
      idempotencyKey: key('adv'),
      body: { expectedRevision: 4 },
    });
    expect(advRes.status).toBe(200);
    const report = TurnReportSchema.parse(await advRes.json());
    expect(report).toMatchObject({ revision: 5, turn: 1, nextTurn: 2 });
    expect(report.actionOutcomes).toHaveLength(1);

    const history = HistoryPageSchema.parse(await (await api(`${base}/history`, { user })).json());
    expect(history.items.map((h) => h.type)).toEqual(['event', 'action_outcome', 'campaign']);
    const filtered = HistoryPageSchema.parse(
      await (await api(`${base}/history?politicianId=pol-1`, { user })).json(),
    );
    expect(filtered.items.map((h) => h.type)).toEqual(['action_outcome']);
    const important = HistoryPageSchema.parse(
      await (await api(`${base}/history?minImportance=3`, { user })).json(),
    );
    expect(important.items.map((h) => h.type)).toEqual(['campaign']);
    const byType = HistoryPageSchema.parse(
      await (await api(`${base}/history?type=event&fromTurn=2`, { user })).json(),
    );
    expect(byType.items).toHaveLength(1);

    // The D1 projection followed the DO.
    const summary = CampaignSummarySchema.parse(await (await api(base, { user })).json());
    expect(summary).toMatchObject({ revision: 5, turn: 2, simDate: report.nextSimDate });
  });

  it('validates input and requires Idempotency-Key on mutations', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    const base = `/api/v1/campaigns/${c.id}`;
    const noKey = await api(`${base}/advance`, { user, body: { expectedRevision: 1 } });
    expect(noKey.status).toBe(400);
    expect(await errorCode(noKey)).toBe('VALIDATION_FAILED');
    const badBody = await api(`${base}/advance`, {
      user,
      idempotencyKey: key('bad'),
      body: { expectedRevision: 'one' },
    });
    expect(badBody.status).toBe(400);
    const badCreate = await api('/api/v1/campaigns', { user, body: { name: '' } });
    expect(badCreate.status).toBe(400);
    expect((await api('/api/v1/campaigns')).status).toBe(401);
  });
});

describe('ownership', () => {
  it("returns 404 for every route on another user's campaign", async () => {
    const owner = uniqueUser('owner');
    const intruder = uniqueUser('intruder');
    const c = await createCampaign(owner);
    const base = `/api/v1/campaigns/${c.id}`;
    const routes: [string, string, unknown?][] = [
      ['GET', base],
      ['DELETE', base],
      ['GET', `${base}/state`],
      ['GET', `${base}/actions/catalogue`],
      ['POST', `${base}/actions`, { expectedRevision: 1, action: meet }],
      ['DELETE', `${base}/actions/pa-1?expectedRevision=1`],
      ['POST', `${base}/advance`, { expectedRevision: 1 }],
      ['GET', `${base}/history`],
      ['GET', `${base}/politicians`],
      ['GET', `${base}/politicians/pol-1`],
      ['GET', `${base}/parliament`],
      ['GET', `${base}/party`],
      ['GET', `${base}/turn-report/latest`],
    ];
    for (const [method, path, body] of routes) {
      const res = await api(path, { user: intruder, method, body, idempotencyKey: key('own') });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(await errorCode(res)).toBe('NOT_FOUND');
    }
    const list = CampaignListResponseSchema.parse(
      await (await api('/api/v1/campaigns', { user: intruder })).json(),
    );
    expect(list.items).toHaveLength(0);
    // Untouched for the owner.
    const summary = CampaignSummarySchema.parse(await (await api(base, { user: owner })).json());
    expect(summary.revision).toBe(1);
  });
});

describe('concurrency and idempotency', () => {
  it('two advances with the same expectedRevision: one 200, one 409 REVISION_CONFLICT', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    const path = `/api/v1/campaigns/${c.id}/advance`;
    const [a, b] = await Promise.all([
      api(path, { user, idempotencyKey: key('a'), body: { expectedRevision: 1 } }),
      api(path, { user, idempotencyKey: key('b'), body: { expectedRevision: 1 } }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const body = await loser.json<{ error: { code: string; details: unknown } }>();
    expect(body.error).toMatchObject({
      code: 'REVISION_CONFLICT',
      details: { currentRevision: 2 },
    });
  });

  it('duplicate submission with the same Idempotency-Key returns the identical response', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    const path = `/api/v1/campaigns/${c.id}/advance`;
    const k = key('dup');
    const first = await api(path, { user, idempotencyKey: k, body: { expectedRevision: 1 } });
    const second = await api(path, { user, idempotencyKey: k, body: { expectedRevision: 1 } });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.text()).toBe(await first.text());
    const summary = CampaignSummarySchema.parse(
      await (await api(`/api/v1/campaigns/${c.id}`, { user })).json(),
    );
    expect(summary.revision).toBe(2);

    const reused = await api(`/api/v1/campaigns/${c.id}/actions`, {
      user,
      idempotencyKey: k,
      body: { expectedRevision: 2, action: meet },
    });
    expect(reused.status).toBe(409);
    expect(await errorCode(reused)).toBe('IDEMPOTENCY_KEY_REUSED');
  });
});

describe('conditional GETs', () => {
  it('returns ETag "<id>:<revision>" and 304 for If-None-Match', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    for (const suffix of ['', '/state', '/party', '/history', '/politicians']) {
      const path = `/api/v1/campaigns/${c.id}${suffix}`;
      const res = await api(path, { user });
      expect(res.status).toBe(200);
      const etag = res.headers.get('etag');
      expect(etag).toBe(`"${c.id}:1"`);
      const cached = await api(path, { user, headers: { 'If-None-Match': etag ?? '' } });
      expect(cached.status, path).toBe(304);
    }
    await api(`/api/v1/campaigns/${c.id}/advance`, {
      user,
      idempotencyKey: key('etag'),
      body: { expectedRevision: 1 },
    });
    const stale = await api(`/api/v1/campaigns/${c.id}/state`, {
      user,
      headers: { 'If-None-Match': `"${c.id}:1"` },
    });
    expect(stale.status).toBe(200);
    expect(stale.headers.get('etag')).toBe(`"${c.id}:2"`);
  });
});

describe('pagination', () => {
  it('pages campaigns with a cursor over (updated_at, id)', async () => {
    const user = uniqueUser();
    const ids = new Set<string>();
    for (let i = 0; i < 5; i++) ids.add((await createCampaign(user, `Campaign ${i}`)).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor ? `?limit=2&cursor=${encodeURIComponent(cursor)}` : '?limit=2';
      const page = CampaignListResponseSchema.parse(
        await (await api(`/api/v1/campaigns${q}`, { user })).json(),
      );
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((c) => c.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(new Set(seen)).toEqual(ids);
    expect(seen).toHaveLength(5);
    const bad = await api('/api/v1/campaigns?cursor=garbage', { user });
    expect(bad.status).toBe(400);
  });

  it('pages history with a seq cursor', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    for (let rev = 1; rev <= 3; rev++) {
      const res = await api(`/api/v1/campaigns/${c.id}/advance`, {
        user,
        idempotencyKey: key(`h${rev}`),
        body: { expectedRevision: rev },
      });
      expect(res.status).toBe(200);
    }
    const seqs: number[] = [];
    let cursor: string | null = null;
    do {
      const q: string = cursor ? `?limit=2&cursor=${cursor}` : '?limit=2';
      const page = HistoryPageSchema.parse(
        await (await api(`/api/v1/campaigns/${c.id}/history${q}`, { user })).json(),
      );
      seqs.push(...page.items.map((i) => i.seq));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seqs).toHaveLength(4);
    expect([...seqs].sort((a, b) => b - a)).toEqual(seqs);
  });
});

describe('Campaign DO persistence', () => {
  it('restore creates a new revision equal to the old state and drops later history', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    for (let rev = 1; rev <= 2; rev++) {
      await api(`/api/v1/campaigns/${c.id}/advance`, {
        user,
        idempotencyKey: key(`r${rev}`),
        body: { expectedRevision: rev },
      });
    }
    const stub = stubFor(c.id);
    const restored = await stub.restore({ revision: 1, expectedRevision: 3 });
    expect(restored).toMatchObject({ ok: true, value: { revision: 4, restoredFrom: 1 } });
    const stale = await stub.restore({ revision: 1, expectedRevision: 3 });
    expect(stale).toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT' } });

    const overview = CareerOverviewSchema.parse(
      await (await api(`/api/v1/campaigns/${c.id}/state`, { user })).json(),
    );
    expect(overview.campaign).toMatchObject({ revision: 4, turn: 1 });
    const history = HistoryPageSchema.parse(
      await (await api(`/api/v1/campaigns/${c.id}/history`, { user })).json(),
    );
    expect(history.items.map((h) => h.type)).toEqual(['campaign']);
  });

  it('stores gzip chunks with a SHA-256 hash and refuses a corrupted chunk on load', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    const stub = stubFor(c.id);
    await runInDurableObject(stub, (instance, state) => {
      const rev = state.storage.sql
        .exec<{ state_hash: string; chunk_count: number }>(
          'SELECT state_hash, chunk_count FROM revisions WHERE revision = 1',
        )
        .one();
      expect(rev.state_hash).toMatch(/^[0-9a-f]{64}$/);
      expect(rev.chunk_count).toBeGreaterThanOrEqual(1);
      const chunk = state.storage.sql
        .exec<{ data: ArrayBuffer }>(
          'SELECT data FROM snapshot_chunks WHERE revision = 1 AND idx = 0',
        )
        .one();
      const bytes = new Uint8Array(chunk.data);
      // gzip magic header
      expect([bytes[0], bytes[1]]).toEqual([0x1f, 0x8b]);
      const mid = Math.floor(bytes.length / 2);
      bytes[mid] = (bytes[mid] ?? 0) ^ 0xff;
      state.storage.sql.exec(
        'UPDATE snapshot_chunks SET data = ? WHERE revision = 1 AND idx = 0',
        bytes.buffer,
      );
      instance.service.evictCache();
    });
    const res = await api(`/api/v1/campaigns/${c.id}/state`, { user });
    expect(res.status).toBe(500);
    expect(await errorCode(res)).toBe('INTERNAL');
    // Mutations also refuse to build on a corrupted save.
    const adv = await api(`/api/v1/campaigns/${c.id}/advance`, {
      user,
      idempotencyKey: key('corrupt'),
      body: { expectedRevision: 1 },
    });
    expect(adv.status).toBe(500);
  });

  it('delete soft-deletes the index row and wipes the DO', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    const del = await api(`/api/v1/campaigns/${c.id}`, { user, method: 'DELETE' });
    expect(del.status).toBe(204);
    expect((await api(`/api/v1/campaigns/${c.id}`, { user })).status).toBe(404);
    expect((await api(`/api/v1/campaigns/${c.id}/state`, { user })).status).toBe(404);
    expect((await api(`/api/v1/campaigns/${c.id}`, { user, method: 'DELETE' })).status).toBe(404);
    const row = await env.DB.prepare('SELECT deleted_at FROM campaigns WHERE id = ?')
      .bind(c.id)
      .first<{ deleted_at: string | null }>();
    expect(row?.deleted_at).toBeTruthy();
    const view = await stubFor(c.id).getView({ kind: 'state' });
    expect(view).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
  });
});
