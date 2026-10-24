import { CampaignSummarySchema, HealthResponseSchema, IDEMPOTENCY_HEADER } from '@whip/contracts';
import { describe, expect, it, vi } from 'vitest';
import { createApiClient, type FetchLike } from './client';
import { ApiError } from './errors';

const summary = {
  id: 'cmp_1',
  name: 'Test',
  scenarioKey: 'first_weeks',
  status: 'active',
  simDate: '2029-09-03',
  turn: 1,
  revision: 0,
  playerName: 'Rachel Danby',
  simulationVersion: 1,
  createdAt: '2026-10-24T00:00:00Z',
  updatedAt: '2026-10-24T00:00:00Z',
};

const envelope = (code: string, message: string, details?: unknown) => ({
  error: { code, message, details, requestId: 'req_1' },
});

function headerOf(call: Parameters<FetchLike>, name: string): string | null {
  const init = call[1];
  return new Headers(init?.headers).get(name);
}

function client(fetchImpl: FetchLike, extra: Partial<Parameters<typeof createApiClient>[0]> = {}) {
  return createApiClient({ fetch: () => fetchImpl, retryDelayMs: () => 0, ...extra });
}

describe('api client', () => {
  it('reuses the same Idempotency-Key when retrying a mutation', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(envelope('INTERNAL', 'boom'), { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(Response.json(summary, { status: 201 }));
    const api = client(fetchImpl);

    const res = await api.mutate('POST', '/campaigns', CampaignSummarySchema, { body: { a: 1 } });

    expect(res.id).toBe('cmp_1');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const keys = fetchImpl.mock.calls.map((c) => headerOf(c, IDEMPOTENCY_HEADER));
    expect(keys[0]).toMatch(/^[A-Za-z0-9_-]{8,}$/);
    expect(new Set(keys).size).toBe(1);
  });

  it('uses a fresh key for each logical mutation', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(Response.json(summary)));
    const api = client(fetchImpl);
    await api.mutate('POST', '/campaigns', CampaignSummarySchema);
    await api.mutate('POST', '/campaigns', CampaignSummarySchema);
    const [a, b] = fetchImpl.mock.calls.map((c) => headerOf(c, IDEMPOTENCY_HEADER));
    expect(a).not.toBe(b);
  });

  it('sends the dev user header and puts DELETE revisions in the query string', async () => {
    const fetchImpl = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 204 })));
    const api = client(fetchImpl, { devUser: 'dev-player' });
    await api.mutate('DELETE', '/campaigns/cmp_1/actions/pa_1', null, {
      query: { expectedRevision: 7 },
    });
    const call = fetchImpl.mock.calls[0]!;
    expect(call[0]).toBe('/api/v1/campaigns/cmp_1/actions/pa_1?expectedRevision=7');
    expect(call[1]?.body).toBeNull();
    expect(headerOf(call, 'X-Whip-Dev-User')).toBe('dev-player');
    expect(headerOf(call, IDEMPOTENCY_HEADER)).toBeTruthy();
  });

  it('does not retry client errors', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json(
          envelope('REVISION_CONFLICT', 'Advanced elsewhere', { currentRevision: 42 }),
          {
            status: 409,
          },
        ),
      ),
    );
    const api = client(fetchImpl);
    const err = await api.mutate('POST', '/x', null, { body: {} }).catch((e: unknown) => e);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(err).toBeInstanceOf(ApiError);
    const apiErr = err as ApiError;
    expect(apiErr.code).toBe('REVISION_CONFLICT');
    expect(apiErr.status).toBe(409);
    expect(apiErr.currentRevision).toBe(42);
    expect(apiErr.requestId).toBe('req_1');
  });

  it('parses the error envelope into a typed ApiError with reasons', async () => {
    const fetchImpl = vi.fn<FetchLike>(() =>
      Promise.resolve(
        Response.json(
          envelope('ACTION_INELIGIBLE', 'Not eligible', {
            reasons: ['Needs 2 diary slots — 1 left this week.', { message: 'Not enough capital' }],
          }),
          { status: 422 },
        ),
      ),
    );
    const err = (await client(fetchImpl)
      .mutate('POST', '/x', null)
      .catch((e: unknown) => e)) as ApiError;
    expect(err.code).toBe('ACTION_INELIGIBLE');
    expect(err.message).toBe('Not eligible');
    expect(err.reasons).toEqual(['Needs 2 diary slots — 1 left this week.', 'Not enough capital']);
  });

  it('maps unknown error bodies to INTERNAL and bad success bodies to INVALID_RESPONSE', async () => {
    const bad = client(() => Promise.resolve(new Response('<html>', { status: 502 })), {
      maxRetries: 0,
    });
    await expect(bad.get('/health', HealthResponseSchema)).rejects.toMatchObject({
      code: 'INTERNAL',
      status: 502,
    });
    const wrong = client(() => Promise.resolve(Response.json({ status: 'nope' })));
    await expect(wrong.get('/health', HealthResponseSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('sends credentials, the dev user header and If-None-Match on repeat reads', async () => {
    const health = { status: 'ok', simulationVersion: 1, environment: 'local' };
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(Response.json(health, { headers: { ETag: '"cmp_1:3"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 304 }));
    const api = client(fetchImpl, { devUser: 'dev-alice' });

    await api.get('/health', HealthResponseSchema);
    const second = await api.get('/health', HealthResponseSchema);

    expect(second).toEqual(health);
    const [first, repeat] = fetchImpl.mock.calls;
    expect(first?.[1]?.credentials).toBe('include');
    expect(headerOf(first!, 'X-Whip-Dev-User')).toBe('dev-alice');
    expect(headerOf(repeat!, 'If-None-Match')).toBe('"cmp_1:3"');
  });
});
