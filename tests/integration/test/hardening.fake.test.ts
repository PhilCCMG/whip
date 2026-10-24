import { CampaignSummarySchema, TurnReportSchema } from '@whip/contracts';
import { createScheduledController, runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import worker from '../../../apps/api/src/index';
import { api, createCampaign, errorCode, key, newCampaign, uniqueUser } from './helpers';

function stubFor(id: string) {
  return env.CAMPAIGN.get(env.CAMPAIGN.idFromName(id));
}

/** Runs the Worker's cron handler (wrangler.jsonc `triggers.crons`) against the test bindings. */
async function runCron(): Promise<void> {
  await worker.scheduled(
    createScheduledController({ cron: '17 * * * *', scheduledTime: Date.now() }),
    env,
  );
}

async function d1Row(id: string) {
  return env.DB.prepare('SELECT status, deleted_at, wipe_confirmed_at FROM campaigns WHERE id = ?')
    .bind(id)
    .first<{ status: string; deleted_at: string | null; wipe_confirmed_at: string | null }>();
}

describe('create with Idempotency-Key', () => {
  it('a retried create returns the same campaign instead of a duplicate', async () => {
    const user = uniqueUser();
    const k = key('create');
    const first = await api('/api/v1/campaigns', { user, idempotencyKey: k, body: newCampaign });
    expect(first.status).toBe(201);
    const a = CampaignSummarySchema.parse(await first.json());
    const second = await api('/api/v1/campaigns', { user, idempotencyKey: k, body: newCampaign });
    expect(second.status).toBe(201);
    expect(CampaignSummarySchema.parse(await second.json()).id).toBe(a.id);
    const list = await (await api('/api/v1/campaigns', { user })).json<{ items: unknown[] }>();
    expect(list.items).toHaveLength(1);

    const reused = await api('/api/v1/campaigns', {
      user,
      idempotencyKey: k,
      body: { ...newCampaign, name: 'Different' },
    });
    expect(reused.status).toBe(409);
    expect(await errorCode(reused)).toBe('IDEMPOTENCY_KEY_REUSED');

    const bad = await api('/api/v1/campaigns', {
      user,
      body: newCampaign,
      headers: { 'Idempotency-Key': 'bad key!' },
    });
    expect(bad.status).toBe(400);
  });

  it('resumes a create whose activation never happened', async () => {
    const user = uniqueUser();
    const k = key('resume');
    const a = CampaignSummarySchema.parse(
      await (await api('/api/v1/campaigns', { user, idempotencyKey: k, body: newCampaign })).json(),
    );
    // Simulate "DO committed, D1 activate failed".
    await env.DB.prepare("UPDATE campaigns SET status = 'initialising' WHERE id = ?")
      .bind(a.id)
      .run();
    expect((await api(`/api/v1/campaigns/${a.id}`, { user })).status).toBe(404);

    const retry = await api('/api/v1/campaigns', { user, idempotencyKey: k, body: newCampaign });
    expect(retry.status).toBe(201);
    expect(CampaignSummarySchema.parse(await retry.json())).toMatchObject({
      id: a.id,
      revision: 1,
    });
    expect((await d1Row(a.id))?.status).toBe('active');
    expect((await api(`/api/v1/campaigns/${a.id}/state`, { user })).status).toBe(200);
  });
});

describe('cron maintenance sweep', () => {
  it('removes stale initialising campaigns (row + DO) and keeps fresh ones', async () => {
    const user = uniqueUser();
    const stale = await createCampaign(user, 'Stale');
    const fresh = await createCampaign(user, 'Fresh');
    const old = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    await env.DB.prepare(
      "UPDATE campaigns SET status = 'initialising', created_at = ? WHERE id = ?",
    )
      .bind(old, stale.id)
      .run();
    await env.DB.prepare("UPDATE campaigns SET status = 'initialising' WHERE id = ?")
      .bind(fresh.id)
      .run();

    await runCron();

    expect(await d1Row(stale.id)).toBeNull();
    expect(await stubFor(stale.id).getView({ kind: 'state' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    expect((await d1Row(fresh.id))?.status).toBe('initialising');
  });

  it('delete records wipe_confirmed_at; the sweep re-wipes unconfirmed deletions', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    expect((await api(`/api/v1/campaigns/${c.id}`, { user, method: 'DELETE' })).status).toBe(204);
    const row = await d1Row(c.id);
    expect(row?.deleted_at).toBeTruthy();
    expect(row?.wipe_confirmed_at).toBeTruthy();

    // A deletion whose DO wipe failed: soft-deleted, unconfirmed, data still in the DO.
    const orphan = await createCampaign(user);
    await env.DB.prepare('UPDATE campaigns SET deleted_at = ? WHERE id = ?')
      .bind(new Date().toISOString(), orphan.id)
      .run();
    expect((await stubFor(orphan.id).getView({ kind: 'state' })).ok).toBe(true);

    await runCron();

    expect((await d1Row(orphan.id))?.wipe_confirmed_at).toBeTruthy();
    expect(await stubFor(orphan.id).getView({ kind: 'state' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
  });
});

describe('row-size caps (Campaign DO SQLite, 2 MB rows)', () => {
  it('an advance with a ~3 MB report and history commits, replays and serves the report', async () => {
    const user = uniqueUser();
    const c = await createCampaign(user);
    const base = `/api/v1/campaigns/${c.id}`;
    const plan = await api(`${base}/actions`, {
      user,
      idempotencyKey: key('pad'),
      body: {
        expectedRevision: 1,
        action: { kind: 'meet_politician', params: { politicianId: 'pol-1', padBytes: 3_000_000 } },
      },
    });
    expect(plan.status).toBe(200);

    const k = key('huge');
    const adv = await api(`${base}/advance`, {
      user,
      idempotencyKey: k,
      body: { expectedRevision: 2 },
    });
    expect(adv.status).toBe(200);
    const text = await adv.text();
    expect(text.length).toBeGreaterThan(3_000_000);
    const report = TurnReportSchema.parse(JSON.parse(text));
    expect(report.revision).toBe(3);

    const replay = await api(`${base}/advance`, {
      user,
      idempotencyKey: k,
      body: { expectedRevision: 2 },
    });
    expect(replay.status).toBe(200);
    expect(await replay.text()).toBe(text);

    const latest = await api(`${base}/turn-report/latest`, { user });
    expect(latest.status).toBe(200);
    expect(await latest.json()).toEqual(report);

    await runInDurableObject(stubFor(c.id), (_instance, state) => {
      const sql = state.storage.sql;
      const maxPayload = sql
        .exec<{ n: number }>('SELECT MAX(LENGTH(payload)) AS n FROM history')
        .one().n;
      expect(maxPayload).toBeLessThanOrEqual(64 * 1024);
      const idem = sql
        .exec<{ response: string }>('SELECT response FROM idempotency WHERE key = ?', k)
        .one();
      expect(JSON.parse(idem.response)).toEqual({ storedRef: 'turn_report', revision: 3 });
      expect(
        sql.exec<{ encoding: string }>('SELECT encoding FROM turn_reports').one().encoding,
      ).toBe('gzip_chunks');
    });

    // Still playable afterwards.
    const next = await api(`${base}/advance`, {
      user,
      idempotencyKey: key('after'),
      body: { expectedRevision: 3 },
    });
    expect(next.status).toBe(200);
  });
});

describe('request body limit', () => {
  it('returns 413 PAYLOAD_TOO_LARGE for /api/v1 bodies over 64 KB', async () => {
    const user = uniqueUser();
    const res = await api('/api/v1/campaigns', {
      user,
      body: { ...newCampaign, name: 'x'.repeat(70 * 1024) },
    });
    expect(res.status).toBe(413);
    expect(await errorCode(res)).toBe('PAYLOAD_TOO_LARGE');
  });
});
