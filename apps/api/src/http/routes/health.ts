import { HealthResponseSchema, type HealthResponse } from '@whip/contracts';
import { SIMULATION_VERSION } from '@whip/simulation';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';

/**
 * API contract version. Bump MINOR for additive changes, MAJOR for breaking ones (which also
 * means a new `/api/vN`). Desktop clients compare it (and `minDesktopVersion`) on launch.
 */
export const API_VERSION = '1.1.0';

const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/;

/** GET /api/v1/health — unauthenticated liveness + version info. */
export const healthRoutes = new Hono<AppEnv>().get('/', (c) => {
  const minDesktopVersion = c.env.MIN_DESKTOP_VERSION?.trim();
  const body: HealthResponse = HealthResponseSchema.parse({
    status: 'ok',
    simulationVersion: SIMULATION_VERSION,
    environment: c.env.ENVIRONMENT,
    apiVersion: API_VERSION,
    // A malformed var is dropped rather than failing the health check.
    ...(minDesktopVersion && VERSION_PATTERN.test(minDesktopVersion) ? { minDesktopVersion } : {}),
  });
  return c.json(body);
});
