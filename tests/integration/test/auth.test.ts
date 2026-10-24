import { MeResponseSchema } from '@whip/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE, api, createCampaign } from './helpers';

/** Pulls the OTP printed by the local ConsoleEmailSender (`{"msg":"dev_email_otp","otp":…}`). */
function captureOtps() {
  const otps: string[] = [];
  const spy = vi.spyOn(console, 'log').mockImplementation((line: unknown) => {
    if (typeof line === 'string' && line.includes('"dev_email_otp"')) {
      otps.push((JSON.parse(line) as { otp: string }).otp);
    }
  });
  return { otps, spy };
}

let ipCounter = 0;
/** A fresh client IP per test, so the D1-backed rate-limit buckets don't leak between tests. */
function freshIp(): string {
  ipCounter += 1;
  return `203.0.113.${(Date.now() + ipCounter) % 250}`;
}

let currentIp = freshIp();

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return api(path, {
    body,
    headers: { origin: BASE, 'cf-connecting-ip': currentIp, ...headers },
  });
}

function cookieHeader(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
}

describe('Better Auth email OTP (workerd + D1)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    currentIp = freshIp();
  });

  it('rate-limits OTP sends per client IP: the 4th in the window is 429 (D1-backed)', async () => {
    const { otps } = captureOtps();
    const send = (n: number) =>
      post('/api/auth/email-otp/send-verification-otp', {
        email: `limited-${n}-${Date.now()}@example.test`,
        type: 'sign-in',
      });
    for (let n = 1; n <= 3; n++) expect((await send(n)).status, `send ${n}`).toBe(200);
    const fourth = await send(4);
    expect(fourth.status).toBe(429);
    expect(Number(fourth.headers.get('x-retry-after'))).toBeGreaterThan(60);
    expect(otps).toHaveLength(3);

    // Counted in D1 (shared by every isolate), keyed by cf-connecting-ip.
    const { env } = await import('cloudflare:workers');
    const rows = await env.DB.prepare('SELECT key, count FROM rateLimit').all<{
      key: string;
      count: number;
    }>();
    expect(rows.results.some((r) => r.key.includes(currentIp) && r.count === 3)).toBe(true);

    // Another client IP is unaffected.
    currentIp = freshIp();
    expect((await send(5)).status).toBe(200);
  });

  it('rate-limits OTP sign-in attempts (10 per 10 minutes per IP)', async () => {
    const attempt = () =>
      post('/api/auth/sign-in/email-otp', { email: 'nobody@example.test', otp: '123456' });
    for (let n = 1; n <= 10; n++) expect((await attempt()).status, `try ${n}`).not.toBe(429);
    expect((await attempt()).status).toBe(429);
  });

  it('send code → verify → session cookie → /api/v1/me', async () => {
    const { otps } = captureOtps();
    const email = `player-${Date.now()}@example.test`;

    const sent = await post('/api/auth/email-otp/send-verification-otp', {
      email,
      type: 'sign-in',
    });
    expect(sent.status).toBe(200);
    expect(otps).toHaveLength(1);
    expect(otps[0]).toMatch(/^\d{6}$/);

    // Codes are stored hashed, never in plain text.
    const { env } = await import('cloudflare:workers');
    const stored = await env.DB.prepare('SELECT value FROM verification').all<{ value: string }>();
    expect(stored.results.some((r) => r.value.includes(otps[0] ?? '-'))).toBe(false);

    const wrong = await post('/api/auth/sign-in/email-otp', { email, otp: '000000' });
    expect(wrong.ok).toBe(false);

    const signedIn = await post('/api/auth/sign-in/email-otp', { email, otp: otps[0] });
    expect(signedIn.status).toBe(200);
    const cookie = cookieHeader(signedIn);
    expect(cookie).toContain('session_token');
    const setCookie = signedIn.headers.getSetCookie().join('\n').toLowerCase();
    expect(setCookie).toContain('httponly');
    expect(setCookie).toContain('samesite=lax');

    const me = await api('/api/v1/me', { headers: { cookie } });
    expect(me.status).toBe(200);
    const body = MeResponseSchema.parse(await me.json());
    expect(body.user.email).toBe(email);

    // The session user can create and list their own campaigns.
    const res = await api('/api/v1/campaigns', { headers: { cookie } });
    expect(res.status).toBe(200);

    const signedOut = await post('/api/auth/sign-out', {}, { cookie });
    expect(signedOut.status).toBe(200);
    expect((await api('/api/v1/me', { headers: { cookie } })).status).toBe(401);
  });

  it('dev identity works alongside Better Auth locally', async () => {
    const c = await createCampaign('dev-alice');
    const me = MeResponseSchema.parse(
      await (await api('/api/v1/me', { user: 'dev-alice' })).json(),
    );
    expect(me.user.id).toBe('dev:dev-alice');
    expect(c.status).toBe('active');
  });

  it('rejects a bogus session cookie', async () => {
    const res = await api('/api/v1/me', {
      headers: { cookie: 'better-auth.session_token=bogus.value' },
    });
    expect(res.status).toBe(401);
  });
});
