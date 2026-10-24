import type { D1Migration } from 'cloudflare:test';

declare global {
  namespace Cloudflare {
    interface Env {
      /** Injected by vitest.config.ts via miniflare bindings. */
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
