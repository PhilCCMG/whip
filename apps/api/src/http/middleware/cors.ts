import { IDEMPOTENCY_HEADER } from '@whip/contracts';
import { cors } from 'hono/cors';
import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../../env';
import { DEV_USER_HEADER } from '../../infrastructure/auth/dev-identity';
import { isAllowedCrossOrigin } from '../../infrastructure/auth/trusted-origins';

/** Request headers the desktop client sends (everything else is CORS-safelisted). */
export const CORS_ALLOW_HEADERS = [
  'Authorization',
  'Content-Type',
  IDEMPOTENCY_HEADER,
  'If-None-Match',
] as const;

/** Response headers the desktop client must be able to read. */
export const CORS_EXPOSE_HEADERS = ['set-auth-token', 'ETag'] as const;

/**
 * CORS for /api/* (ADR-0011). Grants only the Tauri desktop origins (+ local dev servers when
 * ENVIRONMENT=local); any other origin gets no `Access-Control-Allow-Origin`, so browsers block
 * it. No `Allow-Credentials`: the desktop client authenticates with `Authorization: Bearer`, never
 * cookies, so a granted origin can't ride a browser session either.
 */
export function apiCors() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const local = c.env.ENVIRONMENT === 'local';
    const handler = cors({
      origin: (origin) => (isAllowedCrossOrigin(c.env, origin) ? origin : null),
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowHeaders: local ? [...CORS_ALLOW_HEADERS, DEV_USER_HEADER] : [...CORS_ALLOW_HEADERS],
      exposeHeaders: [...CORS_EXPOSE_HEADERS],
      maxAge: 600,
      credentials: false,
    });
    return handler(c, next);
  });
}
