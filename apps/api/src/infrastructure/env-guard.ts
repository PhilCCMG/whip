import { selectEngine } from '../composition';
import type { Env } from '../env';
import { assertDevAuthConfig } from './auth/dev-identity';

/**
 * Refuses to serve with an unsafe configuration: DEV_AUTH outside local, or the test-only fake
 * engine outside local. Throws on the first (and every) request so a misconfigured deploy fails loudly.
 */
export function assertSafeEnvironment(env: Pick<Env, 'ENVIRONMENT' | 'DEV_AUTH' | 'ENGINE'>): void {
  assertDevAuthConfig(env);
  selectEngine(env);
}
