/**
 * Better Auth email one-time-code sign-in (apps/api/src/infrastructure/auth/better-auth.ts).
 * These live under /api/auth, outside the versioned API, and return Better Auth's own error
 * bodies ({ code, message }) rather than the WHIP error envelope.
 */
import { apiUrl, getPlatform } from '../platform';
import { resolveFetch } from './runtime';

const AUTH_BASE = '/api/auth';

export class AuthError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

function messageFor(status: number, body: unknown, fallback: string): string {
  if (status === 429)
    return 'Too many attempts from this connection. Wait a few minutes and try again.';
  if (status === 0) return 'Could not reach the server. Check your connection.';
  const code = body && typeof body === 'object' && 'code' in body ? String(body.code) : '';
  if (/INVALID_OTP|INVALID_CODE/i.test(code))
    return 'That code didn’t match. Check it and try again.';
  if (/OTP_EXPIRED|EXPIRED/i.test(code)) return 'That code has expired. Send a new one.';
  if (/TOO_MANY/i.test(code)) return 'Too many wrong codes. Send a new one.';
  if (/INVALID_EMAIL/i.test(code)) return 'Enter a valid email address.';
  return fallback;
}

/**
 * POSTs to Better Auth. Web: same-origin cookies. Desktop: the API origin, no cookies, the
 * bearer token if any; a sign-in response's `set-auth-token` is stored in the OS credential store.
 */
async function post(path: string, body: unknown, fallback: string): Promise<unknown> {
  const [doFetch, platform] = await Promise.all([resolveFetch(), getPlatform()]);
  let res: Response;
  try {
    res = await doFetch(apiUrl(`${AUTH_BASE}${path}`, platform.apiBase), {
      method: 'POST',
      credentials: platform.fetchCredentials,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...platform.getAuthHeaders(),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new AuthError(0, messageFor(0, null, fallback));
  }
  if (res.ok) await platform.captureSessionToken(res);
  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new AuthError(res.status, messageFor(res.status, json, fallback));
  return json;
}

/** Email a 6-digit sign-in code. */
export const sendSignInCode = (email: string) =>
  post(
    '/email-otp/send-verification-otp',
    { email, type: 'sign-in' },
    'Couldn’t send a code to that address.',
  );

/** Exchange the code for a session cookie. */
export const signInWithCode = (email: string, otp: string) =>
  post('/sign-in/email-otp', { email, otp }, 'That code didn’t work. Check it and try again.');

/**
 * Revokes the session server-side. On desktop the stored token is forgotten even if the server
 * call fails (offline): signing out on this machine must always work.
 */
export async function signOut(): Promise<unknown> {
  try {
    return await post('/sign-out', {}, 'Couldn’t sign out. Try again.');
  } finally {
    await (await getPlatform()).clearSessionToken();
  }
}
