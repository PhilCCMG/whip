import { defineProject } from 'vitest/config';

// Unit tests for the HTTP/application layers run in Node with fake bindings. Anything that needs
// real bindings or `cloudflare:*` modules belongs in tests/integration (workerd).
export default defineProject({
  test: { name: 'api', environment: 'node', include: ['src/**/*.test.ts'] },
});
