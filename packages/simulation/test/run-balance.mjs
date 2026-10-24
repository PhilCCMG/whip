// Runs the 07 §6.6 balance check over 200 seeds (the normal test suite runs 40).
// Usage: pnpm --filter @whip/simulation balance   (BALANCE_SEEDS=n overrides the count)
import { spawnSync } from 'child_process';

const result = spawnSync('vitest', ['run', 'test/balance.test.ts', '--reporter=verbose'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, BALANCE_SEEDS: process.env.BALANCE_SEEDS ?? '200' },
});
process.exit(result.status ?? 1);
