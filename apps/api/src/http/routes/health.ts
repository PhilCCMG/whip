import { HealthResponseSchema, type HealthResponse } from '@whip/contracts';
import { SIMULATION_VERSION } from '@whip/simulation';
import { Hono } from 'hono';
import type { AppEnv } from '../../env';

/** GET /api/v1/health — unauthenticated liveness + version info. */
export const healthRoutes = new Hono<AppEnv>().get('/', (c) => {
  const body: HealthResponse = HealthResponseSchema.parse({
    status: 'ok',
    simulationVersion: SIMULATION_VERSION,
    environment: c.env.ENVIRONMENT,
  });
  return c.json(body);
});
