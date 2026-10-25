import { CampaignSummarySchema, MeResponseSchema, TutorialStateSchema } from '@whip/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, errorCode, key, newCampaign } from './helpers';

/**
 * Desktop (Tauri) client: CORS from the Tauri origins and Better Auth bearer sessions
 * (ADR-0011, docs/architecture/08-desktop.md). Runs on the FakeEngine: it is about auth, not rules.
 */
const TAURI = 'http://tauri.localhost';

/** What a browser fetch from the Tauri webview to https://playwhip.com adds by itself. */
const crossSite = { origin: TAURI, 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' };

let ipCounter = 0;
function freshIp(): string {
  ipCounter += 1;
  return `198.51.100.${(Date.now() + ipCounter) % 250}`;
}

function captureOtps() {
  const otps: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    if (typeof line === 'string' && line.includes('"dev_email_otp"')) {
      otps.push((JSON.parse(line) as { otp: string }).otp);
    }
  });
  return otps;
}

function preflight(path: string, origin: string) {
  return api(path, {
    method: 'OPTIONS',
    headers: {
      origin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'authorization,content-type,idempotency-key',
    },
  });
}

/** Email OTP sign-in exactly as the desktop client does it; returns the bearer token. */
async function desktopSignIn(email: string): Promise<{ res: Response; token: string }> {
  const otps = captureOtps();
  const ip = freshIp();
  const headers = { ...crossSite, 'cf-connecting-ip': ip };
  const sent = await api('/api/auth/email-otp/send-verification-otp', {
    body: { email, type: 'sign-in' },
    headers,
  });
  expect(sent.status).toBe(200);
  expect(otps).toHaveLength(1);
  const res = await api('/api/auth/sign-in/email-otp', { body: { email, otp: otps[0] }, headers });
  expect(res.status).toBe(200);
  const token = res.headers.get('set-auth-token');
  expect(token, 'set-auth-token header').toBeTruthy();
  return { res, token: token ?? '' };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}`, origin: TAURI });

describe('desktop client: CORS + bearer sessions (workerd + D1)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('answers preflights from the Tauri origin with a grant', async () => {
    for (const path of ['/api/v1/campaigns', '/api/auth/sign-in/email-otp']) {
      const res = await preflight(path, TAURI);
      expect(res.status, path).toBe(204);
      expect(res.headers.get('access-control-allow-origin')).toBe(TAURI);
      expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain(
        'authorization',
      );
      expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    }
  });

  it('gives an unknown origin no CORS grant', async () => {
    const res = await preflight('/api/v1/campaigns', 'https://evil.example');
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
    const get = await api('/api/v1/health', { headers: { origin: 'https://evil.example' } });
    expect(get.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a cross-site sign-in from an untrusted origin (Better Auth CSRF check)', async () => {
    const res = await api('/api/auth/email-otp/send-verification-otp', {
      body: { email: `x-${Date.now()}@example.test`, type: 'sign-in' },
      headers: { ...crossSite, origin: 'https://evil.example', 'cf-connecting-ip': freshIp() },
    });
    expect(res.status).toBe(403);
  });

  it('OTP sign-in returns set-auth-token (exposed); the bearer authenticates /me and campaigns', async () => {
    const email = `desk-${Date.now()}@example.test`;
    const { res, token } = await desktopSignIn(email);
    expect(res.headers.get('access-control-allow-origin')).toBe(TAURI);
    expect(res.headers.get('access-control-expose-headers')?.toLowerCase()).toContain(
      'set-auth-token',
    );

    const me = await api('/api/v1/me', { headers: bearer(token) });
    expect(me.status).toBe(200);
    expect(MeResponseSchema.parse(await me.json()).user.email).toBe(email);

    const created = await api('/api/v1/campaigns', {
      body: newCampaign,
      headers: { ...bearer(token), 'Idempotency-Key': key('desk') },
    });
    expect(created.status).toBe(201);
    const summary = CampaignSummarySchema.parse(await created.json());

    const read = await api(`/api/v1/campaigns/${summary.id}/state`, { headers: bearer(token) });
    expect(read.status).toBe(200);
    expect(read.headers.get('etag')).toBeTruthy();
    expect(read.headers.get('access-control-expose-headers')?.toLowerCase()).toContain('etag');

    // Tutorial progress (PUT, preflighted from the webview) works with the bearer too.
    const tutorialUrl = `/api/v1/campaigns/${summary.id}/tutorial`;
    const put = await api(tutorialUrl, {
      method: 'PUT',
      body: { completeSteps: ['welcome'] },
      headers: bearer(token),
    });
    expect(put.status).toBe(200);
    expect(put.headers.get('access-control-allow-origin')).toBe(TAURI);
    const tutorial = await api(tutorialUrl, { headers: bearer(token) });
    expect(TutorialStateSchema.parse(await tutorial.json())).toMatchObject({
      enabled: true,
      completed: ['welcome'],
    });

    // Ownership still applies: another desktop player cannot see it (404, not 403).
    const other = await desktopSignIn(`desk-other-${Date.now()}@example.test`);
    const theirs = await api(`/api/v1/campaigns/${summary.id}/state`, {
      headers: bearer(other.token),
    });
    expect(theirs.status).toBe(404);
    expect(await errorCode(theirs)).toBe('NOT_FOUND');

    // Sign-out with the bearer revokes the session server-side.
    const out = await api('/api/auth/sign-out', {
      body: {},
      headers: { ...bearer(token), 'cf-connecting-ip': freshIp() },
    });
    expect(out.status).toBe(200);
    expect((await api('/api/v1/me', { headers: bearer(token) })).status).toBe(401);
  });

  it('rejects tampered, unsigned and non-bearer tokens', async () => {
    const { token } = await desktopSignIn(`desk-bad-${Date.now()}@example.test`);
    const [id] = decodeURIComponent(token).split('.');
    for (const bad of [`${token}x`, id ?? 'x', 'bogus.value', '']) {
      const res = await api('/api/v1/me', { headers: bearer(bad) });
      expect(res.status, `token ${bad.slice(0, 8)}…`).toBe(401);
    }
    const basic = await api('/api/v1/me', { headers: { authorization: `Basic ${token}` } });
    expect(basic.status).toBe(401);
  });
});
