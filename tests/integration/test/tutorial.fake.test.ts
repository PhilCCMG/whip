import { CampaignSummarySchema, TutorialStateSchema, type TutorialState } from '@whip/contracts';
import { runInDurableObject } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { api, createCampaign, errorCode, newCampaign, uniqueUser } from './helpers';

/** docs/architecture/11-tutorial.md §Persistence: GET/PUT /campaigns/:id/tutorial (workerd + D1). */

async function getTutorial(user: string, id: string): Promise<TutorialState> {
  const res = await api(`/api/v1/campaigns/${id}/tutorial`, { user });
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('etag')).toBeNull();
  return TutorialStateSchema.parse(await res.json());
}

function putTutorial(user: string, id: string, body: unknown): Promise<Response> {
  return api(`/api/v1/campaigns/${id}/tutorial`, { user, method: 'PUT', body });
}

async function putOk(user: string, id: string, body: unknown): Promise<TutorialState> {
  const res = await putTutorial(user, id, body);
  expect(res.status).toBe(200);
  expect(res.headers.get('cache-control')).toBe('no-store');
  return TutorialStateSchema.parse(await res.json());
}

describe('campaign tutorial state', () => {
  it('a new campaign starts with the tutorial enabled by default', async () => {
    const user = uniqueUser();
    const { id, createdAt } = await createCampaign(user);
    expect(await getTutorial(user, id)).toEqual({
      enabled: true,
      completed: [],
      dismissed: false,
      updatedAt: createdAt,
    });
  });

  it('tutorial:false creates it disabled', async () => {
    const user = uniqueUser();
    const res = await api('/api/v1/campaigns', { user, body: { ...newCampaign, tutorial: false } });
    expect(res.status).toBe(201);
    const { id } = CampaignSummarySchema.parse(await res.json());
    expect((await getTutorial(user, id)).enabled).toBe(false);
  });

  it('a campaign without stored state (pre-tutorial save) reads as disabled', async () => {
    const user = uniqueUser();
    const { id } = await createCampaign(user);
    const stub = env.CAMPAIGN.get(env.CAMPAIGN.idFromName(id));
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec("DELETE FROM meta WHERE key = 'tutorial'");
    });
    expect(await getTutorial(user, id)).toEqual({
      enabled: false,
      completed: [],
      dismissed: false,
      updatedAt: null,
    });
  });

  it('completeSteps merge as a union across requests and concurrent PUTs; reset and dismiss', async () => {
    const user = uniqueUser();
    const { id } = await createCampaign(user);

    await putOk(user, id, { completeSteps: ['welcome', 'diary'] });
    const second = await putOk(user, id, { completeSteps: ['diary', 'advance'] });
    expect(second.completed).toEqual(['welcome', 'diary', 'advance']);
    expect(second.updatedAt).not.toBeNull();

    await Promise.all([
      putOk(user, id, { completeSteps: ['parliament'] }),
      putOk(user, id, { completeSteps: ['party'] }),
      putOk(user, id, { completeSteps: ['history'] }),
    ]);
    const merged = await getTutorial(user, id);
    expect(merged.completed.slice(0, 3)).toEqual(['welcome', 'diary', 'advance']);
    expect([...merged.completed].sort()).toEqual(
      ['advance', 'diary', 'history', 'parliament', 'party', 'welcome'].sort(),
    );

    expect(await putOk(user, id, { dismissed: true, enabled: false })).toMatchObject({
      dismissed: true,
      enabled: false,
      completed: merged.completed,
    });
    expect(await putOk(user, id, { reset: true })).toMatchObject({
      enabled: true,
      completed: [],
      dismissed: false,
    });
    expect((await getTutorial(user, id)).completed).toEqual([]);
  });

  it('does not bump the campaign revision or change its ETag', async () => {
    const user = uniqueUser();
    const created = await createCampaign(user);
    const base = `/api/v1/campaigns/${created.id}`;
    const before = await api(`${base}/state`, { user });
    const etag = before.headers.get('etag');
    expect(etag).toBe(`"${created.id}:1"`);

    await putOk(user, created.id, { completeSteps: ['welcome'] });
    await putOk(user, created.id, { reset: true });

    const notModified = await api(`${base}/state`, {
      user,
      headers: { 'If-None-Match': etag ?? '' },
    });
    expect(notModified.status).toBe(304);
    const summary = CampaignSummarySchema.parse(await (await api(base, { user })).json());
    expect(summary.revision).toBe(1);
    expect(summary.updatedAt).toBe(created.updatedAt);
  });

  it('rejects invalid bodies with VALIDATION_FAILED', async () => {
    const user = uniqueUser();
    const { id } = await createCampaign(user);
    const bad: unknown[] = [
      { completeSteps: ['Bad Step'] },
      { completeSteps: ['x'.repeat(41)] },
      { completeSteps: Array.from({ length: 51 }, (_, i) => `s-${i}`) },
      { enabled: true, revision: 3 },
      { dismissed: 'yes' },
    ];
    for (const body of bad) {
      const res = await putTutorial(user, id, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(await errorCode(res)).toBe('VALIDATION_FAILED');
    }
    expect((await getTutorial(user, id)).completed).toEqual([]);
  });

  it("is 404 for another user's campaign and 401 without a session", async () => {
    const owner = uniqueUser();
    const { id } = await createCampaign(owner);
    const other = uniqueUser();
    const read = await api(`/api/v1/campaigns/${id}/tutorial`, { user: other });
    expect(read.status).toBe(404);
    expect(await errorCode(read)).toBe('NOT_FOUND');
    const write = await putTutorial(other, id, { dismissed: true });
    expect(write.status).toBe(404);
    expect(await errorCode(write)).toBe('NOT_FOUND');
    expect((await getTutorial(owner, id)).dismissed).toBe(false);

    expect((await api(`/api/v1/campaigns/${id}/tutorial`)).status).toBe(401);
  });
});
