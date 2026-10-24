import { ErrorEnvelopeSchema, HealthResponseSchema } from '@whip/contracts';
import { env, exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('GET /api/v1/health (workerd)', () => {
  it('returns ok with the simulation version', async () => {
    const res = await exports.default.fetch('http://whip.test/api/v1/health');
    expect(res.status).toBe(200);
    const body = HealthResponseSchema.parse(await res.json());
    expect(body).toMatchObject({ status: 'ok', environment: 'local' });
  });

  it('returns the error envelope for unknown API routes', async () => {
    const res = await exports.default.fetch('http://whip.test/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('NOT_FOUND');
  });
});

describe('bindings', () => {
  it('has D1 migrations applied', async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('campaigns', 'user_preferences') ORDER BY name",
    ).all<{ name: string }>();
    expect(tables.results.map((r) => r.name)).toEqual(['campaigns', 'user_preferences']);
  });

  it('reaches the Campaign DO over RPC', async () => {
    const stub = env.CAMPAIGN.get(env.CAMPAIGN.idFromName('integration-test'));
    const pong = await stub.ping();
    expect(pong).toMatchObject({ ok: true, engine: 'real', schemaVersion: 3 });
  });
});
