import { defineConfig } from 'vitest/config';
import { integrationConfig } from './vitest.shared';

// Test-only FakeEngine run (`*.fake.test.ts`). See vitest.shared.ts.
export default defineConfig(() => integrationConfig('fake'));
