import { TurnReportSchema } from '@whip/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../infrastructure/platform';
import { createGzipChunkCodec } from '../infrastructure/snapshot/gzip-chunk-codec';
import { fakeRuntime } from '../testing/fake-engine';
import { InMemoryCampaignStore } from '../testing/in-memory-campaign-store';
import { createCampaignService, type CampaignServiceApi } from './campaign-service';
import type { DoResult } from './ports';
import {
  boundHistoryRow,
  ROW_LIMITS,
  TRUNCATED_MARKER,
  truncateUtf8,
  utf8Bytes,
} from './row-limits';

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

const init = {
  campaignId: 'c1',
  ownerId: 'u1',
  name: 'Test',
  scenarioKey: 'first_weeks',
  seed: 42,
  player,
  createdAt: '2026-01-01T00:00:00.000Z',
} as const;

/** A planned action whose outcome text is `bytes` long (FakeEngine `padBytes` hook). */
const padded = (bytes: number) => ({
  kind: 'meet_politician' as const,
  params: { politicianId: 'pol-1', padBytes: bytes },
});

describe('row-limits helpers', () => {
  it('truncates by UTF-8 bytes without splitting code points', () => {
    const s = 'é'.repeat(100); // 200 bytes
    const cut = truncateUtf8(s, 51);
    expect(utf8Bytes(cut)).toBeLessThanOrEqual(51);
    expect(cut.endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(truncateUtf8('short', 100)).toBe('short');
  });

  it('bounds a history row: drops data first, then cuts text; small rows are untouched', () => {
    const small = {
      turn: 1,
      simDate: '2026-01-01',
      type: 'event' as const,
      importance: 1,
      actorIds: ['a'],
      subjectIds: [],
      title: 't',
      summary: 's',
    };
    expect(boundHistoryRow(small)).toBe(small);
    const big = boundHistoryRow({
      ...small,
      summary: '"'.repeat(200_000), // JSON-escapes to 400 KB
      data: { blob: 'y'.repeat(200_000) },
      actorIds: Array.from({ length: 5000 }, (_, i) => `politician-${i}`),
    });
    const payload = JSON.stringify({ title: big.title, summary: big.summary, data: big.data });
    expect(utf8Bytes(payload)).toBeLessThanOrEqual(ROW_LIMITS.historyPayloadBytes);
    expect(big.data).toEqual({ truncated: true });
    expect(big.summary.endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(utf8Bytes(JSON.stringify(big.actorIds))).toBeLessThanOrEqual(ROW_LIMITS.historyIdsBytes);
  });
});

describe('CampaignService row-size caps', () => {
  let store: InMemoryCampaignStore;
  let service: CampaignServiceApi;
  // Shrunk limits so the test stays fast; the logic is identical at production sizes.
  const limits = {
    historyPayloadBytes: 4096,
    historyIdsBytes: 1024,
    idempotencyResponseBytes: 8 * 1024,
    turnReportInlineBytes: 32 * 1024,
  };

  beforeEach(async () => {
    store = new InMemoryCampaignStore();
    service = createCampaignService({
      runtime: fakeRuntime,
      store,
      codec: createGzipChunkCodec(),
      clock: { nowIso: () => '2026-01-01T00:00:00.000Z' },
      sha256: sha256Hex,
      limits,
    });
    value(await service.initialise(init));
  });

  async function advanceWith(padBytes: number, key: string, expectedRevision = 1) {
    value(
      await service.planAction({
        idempotencyKey: `${key}-plan`,
        expectedRevision,
        action: padded(padBytes),
      }),
    );
    return service.advance({ idempotencyKey: key, expectedRevision: expectedRevision + 1 });
  }

  it('a huge advance output commits: history capped, report chunked, idempotency by reference', async () => {
    const adv = value(await advanceWith(100_000, 'key-adv-huge'));
    expect(adv.replayed).toBe(false);
    expect(adv.response.actionOutcomes[0]?.summary.length).toBeGreaterThan(100_000);

    expect(Math.max(...store.historyPayloadBytes())).toBeLessThanOrEqual(
      limits.historyPayloadBytes,
    );
    expect(store.turnReportEncoding()).toBe('gzip_chunks');
    expect(JSON.parse(store.storedResponse('key-adv-huge') ?? 'null')).toEqual({
      storedRef: 'turn_report',
      revision: 3,
    });

    // Replay rebuilds the identical response from the stored turn report.
    const replay = value(
      await service.advance({ idempotencyKey: 'key-adv-huge', expectedRevision: 2 }),
    );
    expect(replay.replayed).toBe(true);
    expect(replay.response).toEqual(adv.response);

    // GET turn-report/latest decodes the chunked report.
    service.evictCache();
    const latest = value(await service.getView({ kind: 'turn_report' }));
    if (latest.notModified) throw new Error('unexpected 304');
    expect(TurnReportSchema.parse(latest.data)).toEqual(adv.response);

    // And the campaign keeps going.
    value(await service.advance({ idempotencyKey: 'key-adv-next', expectedRevision: 3 }));
    expect(store.currentRevision()).toBe(4);
    expect(store.turnReportEncoding()).toBe('json');
  });

  it('a medium report stays inline but is replayed by reference', async () => {
    const adv = value(await advanceWith(16 * 1024, 'key-adv-mid'));
    expect(store.turnReportEncoding()).toBe('json');
    expect(store.storedResponse('key-adv-mid')).toContain('storedRef');
    const replay = value(
      await service.advance({ idempotencyKey: 'key-adv-mid', expectedRevision: 2 }),
    );
    expect(replay.response).toEqual(adv.response);
  });

  it('replaying a by-reference response after a later advance asks the client to re-sync', async () => {
    value(await advanceWith(16 * 1024, 'key-adv-old'));
    value(await service.advance({ idempotencyKey: 'key-adv-new', expectedRevision: 3 }));
    const replay = await service.advance({ idempotencyKey: 'key-adv-old', expectedRevision: 2 });
    expect(replay).toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT', details: { currentRevision: 4 } },
    });
  });

  it('small responses are still stored verbatim', async () => {
    value(await advanceWith(0, 'key-adv-small'));
    expect(store.storedResponse('key-adv-small')).toContain('"actionOutcomes"');
  });
});

describe('CampaignService initialise idempotency', () => {
  it('returns the existing result for the same input and refuses a different one', async () => {
    const service = createCampaignService({
      runtime: fakeRuntime,
      store: new InMemoryCampaignStore(),
      codec: createGzipChunkCodec(),
      clock: { nowIso: () => '2026-01-01T00:00:00.000Z' },
      sha256: sha256Hex,
    });
    const first = value(await service.initialise(init));
    expect(value(await service.initialise(init))).toEqual(first);
    expect(await service.initialise({ ...init, seed: 43 })).toMatchObject({
      ok: false,
      error: { code: 'IDEMPOTENCY_KEY_REUSED' },
    });
  });

  it('an engine failure during create is a typed INTERNAL result, not a throw', async () => {
    const service = createCampaignService({
      runtime: {
        ...fakeRuntime,
        engine: {
          ...fakeRuntime.engine,
          create: () => {
            throw new Error('boom');
          },
        },
      },
      store: new InMemoryCampaignStore(),
      codec: createGzipChunkCodec(),
      clock: { nowIso: () => '2026-01-01T00:00:00.000Z' },
      sha256: sha256Hex,
    });
    expect(await service.initialise(init)).toMatchObject({
      ok: false,
      error: { code: 'INTERNAL' },
    });
  });
});
