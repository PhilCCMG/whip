import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../infrastructure/platform';
import { createGzipChunkCodec } from '../infrastructure/snapshot/gzip-chunk-codec';
import { fakeRuntime, FAKE_PLAYER_ID } from '../testing/fake-engine';
import { InMemoryCampaignIndex } from '../testing/in-memory-campaign-index';
import { InMemoryCampaignStore } from '../testing/in-memory-campaign-store';
import { createCampaignService, type CampaignServiceApi } from './campaign-service';
import { CampaignUseCases } from './campaigns';
import { AppError } from './errors';
import { CampaignMaintenance, STALE_INITIALISING_MS } from './maintenance';
import type { CampaignDoClient, CampaignDoGateway, Clock } from './ports';

const req = {
  name: 'Test',
  scenarioKey: 'first_weeks',
  player: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    strength: 'oratory',
    ideologyPreset: 'moderniser',
  },
} as const;

/** In-memory "Durable Objects": one CampaignService + store per campaign id. */
class FakeDoGateway implements CampaignDoGateway {
  readonly stores = new Map<string, InMemoryCampaignStore>();
  readonly services = new Map<string, CampaignServiceApi>();
  failDestroy = 0;
  destroyed: string[] = [];

  constructor(private readonly clock: Clock) {}

  get(id: string): CampaignDoClient {
    let service = this.services.get(id);
    if (!service) {
      const store = new InMemoryCampaignStore();
      service = createCampaignService({
        runtime: fakeRuntime,
        store,
        codec: createGzipChunkCodec(),
        clock: this.clock,
        sha256: sha256Hex,
      });
      this.stores.set(id, store);
      this.services.set(id, service);
    }
    const s = service;
    return {
      initialise: (i) => s.initialise(i),
      getView: (r, rev) => s.getView(r, rev),
      planAction: (i) => s.planAction(i),
      cancelAction: (i) => s.cancelAction(i),
      advance: (i) => s.advance(i),
      history: (q, rev) => s.history(q, rev),
      restore: (i) => s.restore(i),
      destroy: async () => {
        if (this.failDestroy > 0) {
          this.failDestroy -= 1;
          throw new Error('simulated DO failure');
        }
        this.destroyed.push(id);
        await s.destroy();
      },
    };
  }

  revisionOf(id: string): number | null {
    return this.stores.get(id)?.currentRevision() ?? null;
  }
}

describe('CampaignUseCases create / delete hardening', () => {
  let now: number;
  let clock: Clock;
  let index: InMemoryCampaignIndex;
  let gateway: FakeDoGateway;
  let useCases: CampaignUseCases;
  let maintenance: CampaignMaintenance;
  let nextId: number;
  const warnings: string[] = [];

  beforeEach(() => {
    now = Date.UTC(2026, 0, 1);
    clock = { nowIso: () => new Date(now).toISOString() };
    index = new InMemoryCampaignIndex();
    gateway = new FakeDoGateway(clock);
    nextId = 1;
    warnings.length = 0;
    const log = {
      warn: (msg: string) => warnings.push(msg),
      error: (msg: string) => warnings.push(msg),
    };
    useCases = new CampaignUseCases({
      index,
      campaigns: gateway,
      clock,
      ids: { campaignId: () => `camp-${nextId++}`, seed: () => 99 },
      sha256: sha256Hex,
      engineVersion: 1,
      log,
    });
    maintenance = new CampaignMaintenance({ index, campaigns: gateway, clock, log });
  });

  it('creates, activates and records the player politician id', async () => {
    const c = await useCases.create('u1', req);
    expect(c).toMatchObject({ id: 'camp-1', status: 'active', revision: 1 });
    expect(index.rows.get('camp-1')).toMatchObject({
      status: 'active',
      playerPoliticianId: FAKE_PLAYER_ID,
    });
  });

  it('a retry with the same Idempotency-Key returns the same campaign (no duplicate)', async () => {
    const a = await useCases.create('u1', req, { idempotencyKey: 'create-key-1' });
    const b = await useCases.create('u1', req, { idempotencyKey: 'create-key-1' });
    expect(b.id).toBe(a.id);
    expect(index.rows.size).toBe(1);
    // Different owner, same key: independent.
    const other = await useCases.create('u2', req, { idempotencyKey: 'create-key-1' });
    expect(other.id).not.toBe(a.id);
  });

  it('resumes after activate failed post-commit: same id, DO initialise is idempotent', async () => {
    index.failNextActivate = true;
    await expect(useCases.create('u1', req, { idempotencyKey: 'create-key-2' })).rejects.toThrow(
      'simulated D1 failure',
    );
    expect(index.rows.get('camp-1')?.status).toBe('initialising');
    expect(gateway.revisionOf('camp-1')).toBe(1);

    const resumed = await useCases.create('u1', req, { idempotencyKey: 'create-key-2' });
    expect(resumed).toMatchObject({ id: 'camp-1', status: 'active', revision: 1 });
    expect(index.rows.size).toBe(1);
    expect(index.rows.get('camp-1')?.status).toBe('active');
    expect(gateway.revisionOf('camp-1')).toBe(1);
    expect((await useCases.list('u1', { limit: 10 })).items.map((i) => i.id)).toEqual(['camp-1']);
  });

  it('rejects reuse of a create key with a different body', async () => {
    await useCases.create('u1', req, { idempotencyKey: 'create-key-3' });
    const err = await useCases
      .create('u1', { ...req, name: 'Other' }, { idempotencyKey: 'create-key-3' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('cleans up an un-keyed create that failed after the DO commit', async () => {
    index.failNextActivate = true;
    await expect(useCases.create('u1', req)).rejects.toThrow();
    expect(index.rows.size).toBe(0);
    expect(gateway.revisionOf('camp-1')).toBeNull();
  });

  it('delete returns even if the DO wipe fails; the sweep retries it and confirms', async () => {
    const c = await useCases.create('u1', req);
    gateway.failDestroy = 1;
    await useCases.delete('u1', c.id);
    expect(warnings).toContain('campaign_wipe_failed');
    expect(index.rows.get(c.id)).toMatchObject({ wipeConfirmedAt: null });
    expect(gateway.revisionOf(c.id)).toBe(1); // data still there…
    await expect(useCases.get('u1', c.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });

    const report = await maintenance.sweep();
    expect(report).toMatchObject({ wipesConfirmed: 1, failures: 0 });
    expect(gateway.revisionOf(c.id)).toBeNull(); // …until the sweep wiped it
    expect(index.rows.get(c.id)?.wipeConfirmedAt).toBe(clock.nowIso());
    expect((await maintenance.sweep()).wipesConfirmed).toBe(0);
  });

  it('a successful delete confirms the wipe immediately', async () => {
    const c = await useCases.create('u1', req);
    await useCases.delete('u1', c.id);
    expect(index.rows.get(c.id)?.wipeConfirmedAt).toBe(clock.nowIso());
    expect(gateway.revisionOf(c.id)).toBeNull();
  });

  it('sweeps initialising rows older than 10 minutes, keeps younger ones', async () => {
    index.failNextActivate = true;
    await expect(useCases.create('u1', req, { idempotencyKey: 'create-key-4' })).rejects.toThrow();
    now += 60_000;
    await index.insertInitialising({
      id: 'young',
      ownerId: 'u1',
      name: 'Young',
      scenarioKey: 'first_weeks',
      simulationVersion: 1,
      createdAt: clock.nowIso(),
    });

    now += STALE_INITIALISING_MS - 30_000; // camp-1 is now 10.5 min old, young 9.5 min
    const report = await maintenance.sweep();
    expect(report).toEqual({ staleRemoved: 1, wipesConfirmed: 0, failures: 0 });
    expect(index.rows.has('camp-1')).toBe(false);
    expect(gateway.destroyed).toContain('camp-1');
    expect(gateway.revisionOf('camp-1')).toBeNull();
    expect(index.rows.has('young')).toBe(true);
    // Active campaigns are never touched.
    const live = await useCases.create('u1', req);
    now += 2 * STALE_INITIALISING_MS;
    await maintenance.sweep();
    expect(index.rows.get(live.id)?.status).toBe('active');
    expect(index.rows.has('young')).toBe(false);
  });

  it('a failed sweep step is counted and retried next run', async () => {
    index.failNextActivate = true;
    await expect(useCases.create('u1', req, { idempotencyKey: 'create-key-5' })).rejects.toThrow();
    now += 2 * STALE_INITIALISING_MS;
    gateway.failDestroy = 1;
    expect(await maintenance.sweep()).toMatchObject({ staleRemoved: 0, failures: 1 });
    expect(index.rows.has('camp-1')).toBe(true);
    expect(await maintenance.sweep()).toMatchObject({ staleRemoved: 1, failures: 0 });
  });
});
