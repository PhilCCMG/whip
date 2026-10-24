import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'simulation',
    benchmark: { include: ['src/**/*.bench.ts', 'bench/**/*.bench.ts'] },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
  },
});
