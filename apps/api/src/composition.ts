import {
  createCampaignService,
  type CampaignServiceApi,
  type CampaignServiceDeps,
} from './application/campaign-service';
import type { Env } from './env';
import { realRuntime } from './infrastructure/engine';
import { fakeRuntime } from './testing/fake-engine';

/**
 * Composition root for the engine. THE one place that picks the Engine/Projections implementation.
 *
 * - `ENGINE=fake` → the test-only FakeEngine. Refused unless ENVIRONMENT === "local" (the
 *   integration tests set it via miniflare bindings; production config never has it).
 * - otherwise → the real `@whip/simulation` engine + projections.
 */
export type EngineKind = 'fake' | 'real';

type EngineEnv = Pick<Env, 'ENVIRONMENT'> & { ENGINE?: string | undefined };

export function selectEngine(env: EngineEnv): EngineKind {
  if (env.ENGINE === 'fake') {
    if (env.ENVIRONMENT !== 'local') {
      throw new Error('ENGINE=fake is only allowed when ENVIRONMENT === "local".');
    }
    return 'fake';
  }
  if (env.ENGINE !== undefined && env.ENGINE !== '' && env.ENGINE !== 'real') {
    throw new Error(`Unknown ENGINE "${env.ENGINE}".`);
  }
  return 'real';
}

/** Rules version of the selected engine (recorded on new D1 campaign rows). */
export function engineVersion(env: EngineEnv): number {
  return selectEngine(env) === 'fake' ? fakeRuntime.engine.version : realRuntime.engine.version;
}

export function createCampaignServiceForEnv(
  env: EngineEnv,
  deps: Omit<CampaignServiceDeps<unknown, unknown, unknown>, 'runtime'>,
): CampaignServiceApi {
  return selectEngine(env) === 'fake'
    ? createCampaignService({ ...deps, runtime: fakeRuntime })
    : createCampaignService({ ...deps, runtime: realRuntime });
}
