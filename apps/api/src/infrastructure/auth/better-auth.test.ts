import { describe, expect, it } from 'vitest';
import { resolveAuthSecret } from './better-auth';

describe('resolveAuthSecret', () => {
  it('uses BETTER_AUTH_SECRET whenever it is set', () => {
    expect(
      resolveAuthSecret({ ENVIRONMENT: 'production', BETTER_AUTH_SECRET: 's3cret' }, 'https://x.y'),
    ).toBe('s3cret');
  });

  it('falls back to the dev secret only for ENVIRONMENT=local on a loopback host', () => {
    expect(resolveAuthSecret({ ENVIRONMENT: 'local' }, 'http://localhost:8787')).toMatch(/local/);
    expect(resolveAuthSecret({ ENVIRONMENT: 'local' }, 'http://127.0.0.1:5173')).toMatch(/local/);
  });

  it('throws without the secret anywhere else', () => {
    for (const [env, url] of [
      ['production', 'https://whip.game'],
      ['staging', 'https://whip-staging.example.workers.dev'],
      // A local-config Worker that somehow got deployed: still refused.
      ['local', 'https://whip.example.workers.dev'],
    ] as const) {
      expect(() => resolveAuthSecret({ ENVIRONMENT: env }, url), `${env} ${url}`).toThrow(
        'BETTER_AUTH_SECRET is not configured.',
      );
    }
  });
});
