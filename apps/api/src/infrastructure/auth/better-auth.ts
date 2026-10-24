import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins/bearer';
import { emailOTP } from 'better-auth/plugins/email-otp';
import type { Env } from '../../env';
import type { EmailSender } from './email-sender';
import { crossOriginAllowlist } from './trusted-origins';

const LOCAL_DEV_SECRET = 'whip-local-dev-secret-not-for-production-0000';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * BETTER_AUTH_SECRET, or — only when ENVIRONMENT === "local" AND the auth base URL is a loopback
 * host — a fixed dev secret. Anything else without the secret throws, so a mis-deployed local config
 * can never sign sessions with a key that is published in this repository.
 */
export function resolveAuthSecret(
  env: Pick<Env, 'ENVIRONMENT' | 'BETTER_AUTH_SECRET'>,
  baseURL: string,
): string {
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  const host = new URL(baseURL).hostname;
  if (env.ENVIRONMENT === 'local' && (LOOPBACK_HOSTS.has(host) || host.endsWith('.localhost'))) {
    return LOCAL_DEV_SECRET;
  }
  throw new Error('BETTER_AUTH_SECRET is not configured.');
}

/** Seconds. */
const TEN_MINUTES = 600;

/**
 * Rate limits for the auth endpoints, per client IP (`cf-connecting-ip`) and path. Stored in D1
 * (`rateLimit` table) because the auth instance — and so any memory store — is per request.
 * Keys are paths relative to `/api/auth`. Cloudflare WAF rate limiting on /api/auth/* is the
 * recommended outer layer (infrastructure/cloudflare/README.md).
 */
export const AUTH_RATE_LIMIT_RULES = {
  '/email-otp/send-verification-otp': { window: TEN_MINUTES, max: 3 },
  '/sign-in/email-otp': { window: TEN_MINUTES, max: 10 },
  '/email-otp/check-verification-otp': { window: TEN_MINUTES, max: 10 },
  '/email-otp/verify-email': { window: TEN_MINUTES, max: 10 },
} as const;

/**
 * Better Auth 1.7.12 on D1 (native Kysely D1 dialect), email one-time code sign-in, DB-backed
 * sessions. Browsers use the session cookie; the desktop client uses the same session as a
 * bearer token (`bearer` plugin: responses that set the session cookie also carry
 * `set-auth-token`, and `Authorization: Bearer <token>` is turned back into the session cookie
 * before Better Auth reads it). Created per request because bindings are per request on Workers.
 */
export function createAuth(env: Env, opts: { baseURL: string; sender: EmailSender }) {
  const secret = resolveAuthSecret(env, opts.baseURL);
  const origin = new URL(opts.baseURL).origin;
  const extraOrigins = (env.AUTH_TRUSTED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return betterAuth({
    appName: 'WHIP',
    baseURL: opts.baseURL,
    basePath: '/api/auth',
    secret,
    database: env.DB,
    // The desktop client's Tauri origins (+ local dev servers, locally only) must pass Better
    // Auth's origin/CSRF checks on sign-in (ADR-0011).
    trustedOrigins: [origin, ...crossOriginAllowlist(env), ...extraOrigins],
    telemetry: { enabled: false },
    session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    // Better Auth only enables this by default when NODE_ENV=production (unset on Workers), and
    // its default memory store would be per request here — so: always on, stored in D1.
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: AUTH_RATE_LIMIT_RULES,
    },
    advanced: {
      // Secure cookies follow the base URL scheme (https everywhere but local http).
      useSecureCookies: origin.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      // Cloudflare sets cf-connecting-ip to the real client address (clients cannot spoof it
      // through Cloudflare). Never trust x-forwarded-for here.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    plugins: [
      // Signed tokens only: the bearer token is the signed session-cookie value from
      // `set-auth-token`, so a raw session id from the DB is never accepted on its own.
      bearer({ requireSignature: true }),
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        storeOTP: 'hashed',
        // Wrong codes burn the OTP after 3 attempts (Better Auth default, made explicit).
        allowedAttempts: 3,
        sendVerificationOTP: async ({ email, otp, type }) => {
          await opts.sender.sendOtp({ to: email, otp, purpose: type });
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
}
