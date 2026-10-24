import { defineConfig } from 'vitest/config';

// Unit tests for every package run as Vitest projects from the root (`pnpm test`).
// Integration tests (workerd, @cloudflare/vitest-plugin) run separately: `pnpm test:integration`.
export default defineConfig({
  test: {
    projects: [
      'packages/*/vitest.config.ts',
      'apps/web/vite.config.ts',
      'apps/api/vitest.config.ts',
    ],
  },
});
