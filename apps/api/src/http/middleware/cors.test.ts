import { HealthResponseSchema } from '@whip/contracts';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../env';
import { crossOriginAllowlist } from '../../infrastructure/auth/trusted-origins';
import { createApp } from '../app';

const prod = { ENVIRONMENT: 'production' } as unknown as Env;
const local = { ENVIRONMENT: 'local' } as unknown as Env;

function preflight(origin: string, env: Env, requestHeaders = 'authorization,content-type') {
  return createApp().request(
    '/api/v1/campaigns',
    {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': requestHeaders,
      },
    },
    env,
  );
}

describe('API CORS (desktop origins only)', () => {
  it('grants the Tauri origins in production, without credentials', async () => {
    for (const origin of [
      'http://tauri.localhost',
      'https://tauri.localhost',
      'tauri://localhost',
    ]) {
      const res = await preflight(origin, prod);
      expect(res.status, origin).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
      const allowed = res.headers.get('access-control-allow-headers')?.toLowerCase() ?? '';
      for (const h of ['authorization', 'content-type', 'idempotency-key', 'if-none-match']) {
        expect(allowed).toContain(h);
      }
      expect(allowed).not.toContain('x-whip-dev-user');
      expect(res.headers.get('vary')).toContain('Origin');
    }
  });

  it('gives unknown origins and local dev origins no grant in production', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:5173', 'null']) {
      const res = await preflight(origin, prod);
      expect(res.headers.get('access-control-allow-origin'), origin).toBeNull();
    }
  });

  it('allows the local dev servers (and the dev identity header) only locally', async () => {
    const res = await preflight('http://localhost:5173', local, 'x-whip-dev-user');
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
      'x-whip-dev-user',
    );
    expect(crossOriginAllowlist(prod)).not.toContain('http://localhost:5173');
  });

  it('adds the grant and exposed headers to actual responses', async () => {
    const res = await createApp().request(
      '/api/v1/health',
      { headers: { origin: 'http://tauri.localhost' } },
      prod,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://tauri.localhost');
    const exposed = res.headers.get('access-control-expose-headers')?.toLowerCase() ?? '';
    expect(exposed).toContain('set-auth-token');
    expect(exposed).toContain('etag');
    const body = HealthResponseSchema.parse(await res.json());
    expect(body.apiVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps the grant on error responses so the client can read the envelope', async () => {
    const res = await createApp({ resolveSession: () => Promise.resolve(null) }).request(
      '/api/v1/campaigns',
      { headers: { origin: 'tauri://localhost' } },
      prod,
    );
    expect(res.status).toBe(401);
    expect(res.headers.get('access-control-allow-origin')).toBe('tauri://localhost');
  });

  it('reports minDesktopVersion only when configured and well-formed', async () => {
    const get = async (MIN_DESKTOP_VERSION?: string) =>
      HealthResponseSchema.parse(
        await (
          await createApp().request('/api/v1/health', {}, { ...prod, MIN_DESKTOP_VERSION })
        ).json(),
      ).minDesktopVersion;
    expect(await get()).toBeUndefined();
    expect(await get('0.2.0')).toBe('0.2.0');
    expect(await get('soon')).toBeUndefined();
  });
});
