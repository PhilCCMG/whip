import { Hono } from 'hono';
import type { MeResponse } from '../../application/dto';
import type { AppEnv } from '../../env';
import { createDb } from '../../infrastructure/db/client';
import { getUserPreferences } from '../../infrastructure/db/preferences';
import { currentUser, requireUser, type SessionResolver } from '../middleware/auth';

/** GET /api/v1/me — current user + preferences. */
export function meRoutes(resolveSession?: SessionResolver) {
  return new Hono<AppEnv>().use('*', requireUser(resolveSession)).get('/', async (c) => {
    const user = currentUser(c);
    const body: MeResponse = {
      user,
      preferences: await getUserPreferences(createDb(c.env.DB), user.id),
    };
    return c.json(body);
  });
}
