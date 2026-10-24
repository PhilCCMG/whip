import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { resolve } from 'node:path';
import type { ViteUserConfig } from 'vitest/config';

const apiDir = resolve(import.meta.dirname, '../../apps/api');

/**
 * Runs tests inside workerd against the real Worker (apps/api/wrangler.jsonc): D1, R2 and the
 * Campaign DO are local Miniflare instances. D1 migrations are read here (Node) and applied in
 * test/apply-migrations.ts (workerd). The SPA assets dir must exist: `pretest` creates a placeholder.
 *
 * Two runs share this: the real @whip/simulation engine (default) and the test-only FakeEngine
 * (`*.fake.test.ts`: persistence/concurrency/idempotency against tiny deterministic states).
 */
export async function integrationConfig(engine: 'real' | 'fake'): Promise<ViteUserConfig> {
  const migrations = await readD1Migrations({ projectPath: apiDir, migrationsDir: 'migrations' });
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: '../../apps/api/wrangler.jsonc' },
        miniflare: {
          // ENGINE=fake selects the FakeEngine (refused outside ENVIRONMENT=local).
          bindings: {
            TEST_MIGRATIONS: migrations,
            ENGINE: engine,
            BETTER_AUTH_SECRET: 'integration-test-secret-0123456789abcdef',
          },
        },
      }),
    ],
    test: {
      name: `integration-${engine}`,
      include: engine === 'fake' ? ['test/**/*.fake.test.ts'] : ['test/**/*.test.ts'],
      exclude: engine === 'fake' ? [] : ['test/**/*.fake.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
      // The real engine generates a 650-MP world per campaign; give workerd some headroom.
      testTimeout: engine === 'real' ? 60_000 : 5_000,
    },
  };
}
