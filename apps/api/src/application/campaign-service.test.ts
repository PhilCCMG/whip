import { CareerOverviewSchema, PlanActionResponseSchema, TurnReportSchema } from '@whip/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGzipChunkCodec } from '../infrastructure/snapshot/gzip-chunk-codec';
import { sha256Hex } from '../infrastructure/platform';
import { fakeRuntime } from '../testing/fake-engine';
import { InMemoryCampaignStore } from '../testing/in-memory-campaign-store';
import {
  RETAINED_REVISIONS,
  createCampaignService,
  type CampaignServiceApi,
} from './campaign-service';
import type { DoResult } from './ports';

const player = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  gender: 'female',
  strength: 'oratory',
  ideologyPreset: 'moderniser',
} as const;

function value<T>(r: DoResult<T>): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error.code}: ${r.error.message}`);
  return r.value;
}

const meet = { kind: 'meet_politician' as const, params: { politicianId: 'pol-1' } };

describe('CampaignService commit protocol', () => {
  let store: InMemoryCampaignStore;
  let service: CampaignServiceApi;
  let tick = 0;

  beforeEach(async () => {
    store = new InMemoryCampaignStore();
    tick = 0;
    service = createCampaignService({
      runtime: fakeRuntime,
      store,
      // Small chunks so multi-chunk snapshots are exercised.
      codec: createGzipChunkCodec(64),
      clock: { nowIso: () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++)).toISOString() },
      sha256: sha256Hex,
    });
    value(
      await service.initialise({
        campaignId: 'c1',
        ownerId: 'u1',
        name: 'Test',
        scenarioKey: 'first_weeks',
        seed: 42,
        player,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
  });

  it('initialises revision 1 and is idempotent on retry', async () => {
    expect(store.currentRevision()).toBe(1);
    expect(store.readChunks(1).length).toBeGreaterThan(1);
    const again = value(
      await service.initialise({
        campaignId: 'c1',
        ownerId: 'u1',
        name: 'Test',
        scenarioKey: 'first_weeks',
        seed: 42,
        player,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    expect(again).toMatchObject({ id: 'c1', revision: 1, playerName: 'Ada Lovelace' });
    expect(store.currentRevision()).toBe(1);
  });

  it('plans an action, advances, and writes history', async () => {
    const planned = value(
      await service.planAction({ idempotencyKey: 'key-plan-1', expectedRevision: 1, action: meet }),
    );
    expect(planned.replayed).toBe(false);
    expect(PlanActionResponseSchema.parse(planned.response).revision).toBe(2);
    expect(planned.projection).toMatchObject({ revision: 2, turn: 1 });

    const report = value(
      await service.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 2 }),
    );
    expect(TurnReportSchema.parse(report.response)).toMatchObject({
      revision: 3,
      turn: 1,
      nextTurn: 2,
    });

    const history = value(await service.history({ limit: 10 }));
    if (!('page' in history)) throw new Error('expected page');
    expect(history.page.items.map((i) => i.type)).toEqual(['event', 'action_outcome', 'campaign']);
    const byPolitician = value(await service.history({ limit: 10, politicianId: 'pol-1' }));
    if (!('page' in byPolitician)) throw new Error('expected page');
    expect(byPolitician.page.items).toHaveLength(1);
  });

  it('rejects a stale expectedRevision with REVISION_CONFLICT', async () => {
    value(await service.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 1 }));
    const stale = await service.advance({ idempotencyKey: 'key-adv-2', expectedRevision: 1 });
    expect(stale).toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT', details: { currentRevision: 2 } },
    });
  });

  it('serialises concurrent mutations: one wins, one conflicts', async () => {
    const [a, b] = await Promise.all([
      service.advance({ idempotencyKey: 'key-adv-a', expectedRevision: 1 }),
      service.advance({ idempotencyKey: 'key-adv-b', expectedRevision: 1 }),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(store.currentRevision()).toBe(2);
  });

  it('replays the stored response for a duplicate idempotency key without a new revision', async () => {
    const first = value(
      await service.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 1 }),
    );
    // Same key + same body (incl. the now-stale expectedRevision) ⇒ the stored response.
    const second = value(
      await service.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 1 }),
    );
    expect(second.replayed).toBe(true);
    expect(second.response).toEqual(first.response);
    expect(store.currentRevision()).toBe(2);
  });

  it('rejects a reused key with a different body: IDEMPOTENCY_KEY_REUSED', async () => {
    value(
      await service.planAction({ idempotencyKey: 'key-1234', expectedRevision: 1, action: meet }),
    );
    const reused = await service.planAction({
      idempotencyKey: 'key-1234',
      expectedRevision: 2,
      action: { kind: 'meet_politician', params: { politicianId: 'pol-2' } },
    });
    expect(reused).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    const crossOp = await service.advance({ idempotencyKey: 'key-1234', expectedRevision: 2 });
    expect(crossOp).toMatchObject({ ok: false, error: { code: 'IDEMPOTENCY_KEY_REUSED' } });
    expect(store.currentRevision()).toBe(2);
  });

  it('returns ACTION_INELIGIBLE with reasons and commits nothing', async () => {
    const res = await service.planAction({
      idempotencyKey: 'key-resh',
      expectedRevision: 1,
      action: { kind: 'call_reshuffle', params: {} },
    });
    expect(res).toMatchObject({
      ok: false,
      error: { code: 'ACTION_INELIGIBLE', details: { reasons: [expect.any(String)] } },
    });
    expect(store.currentRevision()).toBe(1);
    expect(store.findIdempotency('key-resh')).toBeNull();
  });

  it('keeps memory unchanged when the commit fails (crash before step 6)', async () => {
    store.failNextCommit = true;
    await expect(
      service.planAction({ idempotencyKey: 'key-crash', expectedRevision: 1, action: meet }),
    ).rejects.toThrow('simulated storage failure');
    expect(store.currentRevision()).toBe(1);
    const view = value(await service.getView({ kind: 'state' }));
    if (view.notModified) throw new Error('unexpected 304');
    expect(CareerOverviewSchema.parse(view.data).diary.planned).toHaveLength(0);
    // The retry with the same key now succeeds.
    value(
      await service.planAction({ idempotencyKey: 'key-crash', expectedRevision: 1, action: meet }),
    );
    expect(store.currentRevision()).toBe(2);
  });

  it('prunes to the last 10 revisions', async () => {
    for (let rev = 1; rev <= 12; rev++) {
      value(await service.advance({ idempotencyKey: `key-adv-${rev}`, expectedRevision: rev }));
    }
    expect(store.currentRevision()).toBe(13);
    expect(store.revisionNumbers()).toEqual(
      Array.from({ length: RETAINED_REVISIONS }, (_, i) => 13 - RETAINED_REVISIONS + 1 + i),
    );
  });

  it('restores an earlier revision as a new revision and drops later history', async () => {
    value(await service.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 1 }));
    value(await service.advance({ idempotencyKey: 'key-adv-2', expectedRevision: 2 }));
    const restored = value(await service.restore({ revision: 1, expectedRevision: 3 }));
    expect(restored).toMatchObject({ revision: 4, restoredFrom: 1, projection: { turn: 1 } });
    const view = value(await service.getView({ kind: 'state' }));
    if (view.notModified) throw new Error('unexpected 304');
    expect(CareerOverviewSchema.parse(view.data).campaign).toMatchObject({ revision: 4, turn: 1 });
    const history = value(await service.history({ limit: 10 }));
    if (!('page' in history)) throw new Error('expected page');
    expect(history.page.items.map((i) => i.type)).toEqual(['campaign']);
  });

  it('fails to load a corrupted snapshot (integrity check)', async () => {
    service.evictCache();
    store.corruptChunk(1, 0);
    const res = await service.getView({ kind: 'state' });
    expect(res).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL', details: { reason: 'integrity', revision: 1 } },
    });
  });

  it('answers If-None-Match with notModified', async () => {
    expect(value(await service.getView({ kind: 'party' }, 1))).toEqual({
      notModified: true,
      revision: 1,
    });
  });

  it('paginates history with a seq cursor', async () => {
    for (let rev = 1; rev <= 3; rev++) {
      value(await service.advance({ idempotencyKey: `key-adv-${rev}`, expectedRevision: rev }));
    }
    const seen: number[] = [];
    let cursor: string | undefined;
    do {
      const page = value(await service.history({ limit: 2, ...(cursor && { cursor }) }));
      if (!('page' in page)) throw new Error('expected page');
      seen.push(...page.page.items.map((i) => i.seq));
      cursor = page.page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual([4, 3, 2, 1]);
    expect(await service.history({ limit: 2, cursor: 'abc' })).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION_FAILED' },
    });
  });

  it('stores the latest turn report in the advance commit (NOT_FOUND before; dropped on restore)', async () => {
    expect(await service.getView({ kind: 'turn_report' })).toMatchObject({
      ok: false,
      error: { code: 'NOT_FOUND' },
    });
    const adv = value(await service.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 1 }));
    service.evictCache();
    const latest = value(await service.getView({ kind: 'turn_report' }));
    if (latest.notModified) throw new Error('unexpected 304');
    expect(TurnReportSchema.parse(latest.data)).toEqual(adv.response);
    value(
      await service.planAction({ idempotencyKey: 'key-plan-1', expectedRevision: 2, action: meet }),
    );
    const still = value(await service.getView({ kind: 'turn_report' }));
    expect(still).toMatchObject({ revision: 3, data: { revision: 2 } });
    value(await service.restore({ revision: 1, expectedRevision: 3 }));
    expect(await service.getView({ kind: 'turn_report' })).toMatchObject({ ok: false });
  });

  it('reports per-request timings without PII', async () => {
    const timings: unknown[] = [];
    let t = 0;
    const s2 = createCampaignService({
      runtime: fakeRuntime,
      store: new InMemoryCampaignStore(),
      codec: createGzipChunkCodec(),
      clock: { nowIso: () => '2026-01-01T00:00:00.000Z' },
      sha256: sha256Hex,
      timer: () => (t += 1),
      onTimings: (x) => timings.push(x),
    });
    value(
      await s2.initialise({
        campaignId: 'c2',
        ownerId: 'u1',
        name: 'T',
        scenarioKey: 'first_weeks',
        seed: 1,
        player,
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    value(await s2.advance({ idempotencyKey: 'key-adv-1', expectedRevision: 1 }));
    expect(timings).toHaveLength(2);
    expect(timings[1]).toMatchObject({
      op: 'advance',
      revision: 2,
      coldLoad: false,
      ms: { load: 1, simulate: 1, serialize: 1, compress: 1, commit: 1, total: 5 },
    });
    expect(JSON.stringify(timings)).not.toContain('Lovelace');
  });
});
