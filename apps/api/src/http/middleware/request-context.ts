import { createMiddleware } from 'hono/factory';
import type { AppEnv } from '../../env';
import { logger } from '../../infrastructure/logging/logger';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns a requestId (echoed in the `x-request-id` response header and error envelopes) and emits
 * one structured JSON log line per request. Never logs bodies, emails or tokens.
 */
export function requestContext() {
  return createMiddleware<AppEnv>(async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    const start = Date.now();
    try {
      await next();
    } finally {
      c.header(REQUEST_ID_HEADER, requestId);
      logger.info('request', {
        requestId,
        method: c.req.method,
        userId: c.get('user')?.id,
        route: c.req.routePath,
        path: c.req.path,
        status: c.res.status,
        durationMs: Date.now() - start,
      });
    }
  });
}
