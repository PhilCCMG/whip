import { ErrorEnvelopeSchema, HealthResponseSchema } from '@whip/contracts';
import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { API_BODY_LIMIT_BYTES, createApp } from './app';

// Unit tests run in Node against the Hono app with a fake env. Binding-dependent behaviour is
// covered by tests/integration (workerd).
const env = { ENVIRONMENT: 'local' } as unknown as Env;

describe('http app', () => {
  it('serves /api/v1/health', async () => {
    const res = await createApp().request('/api/v1/health', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    expect(HealthResponseSchema.parse(await res.json()).environment).toBe('local');
  });

  it('returns the error envelope for unknown API routes', async () => {
    const res = await createApp().request('/api/v1/nope', {}, env);
    expect(res.status).toBe(404);
    const body = ErrorEnvelopeSchema.parse(await res.json());
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(res.headers.get('x-request-id'));
  });

  it('rejects /api/v1 bodies over 64 KB with 413 PAYLOAD_TOO_LARGE', async () => {
    const res = await createApp().request(
      '/api/v1/campaigns',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'x'.repeat(API_BODY_LIMIT_BYTES) }),
      },
      env,
    );
    expect(res.status).toBe(413);
    const body = ErrorEnvelopeSchema.parse(await res.json());
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
