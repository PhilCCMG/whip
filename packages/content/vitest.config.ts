import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'content',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'test/**/*.test.ts'],
  },
});
