import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import { AppError } from '../application/errors';
import type { AppEnv } from '../env';
import { assertSafeEnvironment } from '../infrastructure/env-guard';
import { errorHandler, notFoundHandler } from './errors';
import { authFor, type SessionResolver } from './middleware/auth';
import { apiCors } from './middleware/cors';
import { requestContext } from './middleware/request-context';
import { campaignRoutes } from './routes/campaigns';
import { desktopRoutes, downloadRoutes } from './routes/desktop';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';

/** Largest accepted request body on /api/v1 (all v1 bodies are small JSON). */
export const API_BODY_LIMIT_BYTES = 64 * 1024;
/** Better Auth bodies are tiny (email, code). */
export const AUTH_BODY_LIMIT_BYTES = 16 * 1024;

function limitBody(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: () => {
      throw new AppError('PAYLOAD_TOO_LARGE', `Request body exceeds ${maxSize} bytes.`);
    },
  });
}

export interface AppOptions {
  /** Override session resolution (unit tests). Defaults to Better Auth cookie/bearer sessions. */
  resolveSession?: SessionResolver;
}

/**
 * Builds the Hono app. Routes live under /api/v1 and Better Auth under /api/auth/*; everything
 * else is served by Static Assets (wrangler.jsonc `run_worker_first: ["/api/*", "/download",
 * "/download/*"]`), except `/download*` (desktop installers, routes/desktop.ts).
 */
export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>();

  app.use('*', requestContext());
  // Refuse to serve with DEV_AUTH / ENGINE=fake outside local.
  app.use(
    '*',
    createMiddleware<AppEnv>(async (c, next) => {
      assertSafeEnvironment(c.env);
      await next();
    }),
  );

  // Desktop client (Tauri) origins only; the browser SPA is same-origin (ADR-0011).
  app.use('/api/*', apiCors());
  app.use('/api/auth/*', limitBody(AUTH_BODY_LIMIT_BYTES));
  app.use('/api/v1/*', limitBody(API_BODY_LIMIT_BYTES));

  app.on(['GET', 'POST'], '/api/auth/*', (c) => authFor(c).handler(c.req.raw));

  const v1 = new Hono<AppEnv>()
    .route('/health', healthRoutes)
    .route('/me', meRoutes(options.resolveSession))
    .route('/campaigns', campaignRoutes(options.resolveSession))
    .route('/desktop', desktopRoutes);
  app.route('/api/v1', v1);
  // Desktop installer redirect + latest.json (wrangler.jsonc run_worker_first covers /download*).
  app.route('/download', downloadRoutes);

  app.notFound(notFoundHandler);
  app.onError(errorHandler);
  return app;
}

export type App = ReturnType<typeof createApp>;
