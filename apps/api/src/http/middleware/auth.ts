import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../../application/errors';
import type { AppEnv } from '../../env';
import { createAuth, type AuthUser } from '../../infrastructure/auth/better-auth';
import { resolveDevIdentity } from '../../infrastructure/auth/dev-identity';
import { createEmailSender } from '../../infrastructure/auth/email-sender';

export type SessionResolver = (c: Context<AppEnv>) => Promise<AuthUser | null>;

export function authFor(c: Context<AppEnv>) {
  return createAuth(c.env, {
    baseURL: c.env.BETTER_AUTH_URL ?? new URL(c.req.url).origin,
    sender: createEmailSender(c.env),
  });
}

/** Better Auth cookie session → user. */
export const betterAuthSession: SessionResolver = async (c) => {
  const session = await authFor(c).api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name || null,
  };
};

/**
 * Resolves the caller: dev identity first (only when ENVIRONMENT=local and DEV_AUTH=1), else the
 * Better Auth session. No user ⇒ 401 UNAUTHENTICATED.
 */
export function requireUser(resolveSession: SessionResolver = betterAuthSession) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const devUser = resolveDevIdentity(c.env, c.req.raw.headers);
    const user = devUser ? { id: devUser, email: null, name: null } : await resolveSession(c);
    if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in required.');
    c.set('user', user);
    await next();
  });
}

export function currentUser(c: Context<AppEnv>): AuthUser {
  const user = c.get('user');
  if (!user) throw new AppError('UNAUTHENTICATED', 'Sign in required.');
  return user;
}
