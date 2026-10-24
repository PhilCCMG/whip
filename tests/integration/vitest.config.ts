import { defineConfig } from 'vitest/config';
import { integrationConfig } from './vitest.shared';

// Real @whip/simulation engine. See vitest.shared.ts; the FakeEngine run is vitest.fake.config.ts.
export default defineConfig(() => integrationConfig('real'));
