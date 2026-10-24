import { ErrorEnvelopeSchema } from '@whip/contracts';
import { describe, expect, it } from 'vitest';
import { selectEngine } from '../../composition';
import type { Env } from '../../env';
import { createApp } from '../../http/app';
import { assertSafeEnvironment } from '../env-guard';
import { DEV_USER_HEADER, assertDevAuthConfig, resolveDevIdentity } from './dev-identity';

const headers = new Headers({ [DEV_USER_HEADER]: 'alice' });

describe('dev identity', () => {
  it('is honoured only when ENVIRONMENT=local and DEV_AUTH=1', () => {
    expect(resolveDevIdentity({ ENVIRONMENT: 'local', DEV_AUTH: '1' }, headers)).toBe('dev:alice');
    expect(resolveDevIdentity({ ENVIRONMENT: 'local' }, headers)).toBeNull();
    expect(resolveDevIdentity({ ENVIRONMENT: 'local', DEV_AUTH: '0' }, headers)).toBeNull();
    expect(resolveDevIdentity({ ENVIRONMENT: 'production' }, headers)).toBeNull();
    expect(resolveDevIdentity({ ENVIRONMENT: 'staging', DEV_AUTH: '1' }, headers)).toBeNull();
  });

  it('rejects malformed header values', () => {
    const bad = new Headers({ [DEV_USER_HEADER]: 'alice@example.com' });
    expect(resolveDevIdentity({ ENVIRONMENT: 'local', DEV_AUTH: '1' }, bad)).toBeNull();
  });

  it('throws at startup when DEV_AUTH is set outside local', () => {
    expect(() => assertDevAuthConfig({ ENVIRONMENT: 'production', DEV_AUTH: '1' })).toThrow();
    expect(() => assertDevAuthConfig({ ENVIRONMENT: 'staging', DEV_AUTH: '0' })).toThrow();
    expect(() => assertDevAuthConfig({ ENVIRONMENT: 'production' })).not.toThrow();
    expect(() => assertDevAuthConfig({ ENVIRONMENT: 'local', DEV_AUTH: '1' })).not.toThrow();
  });
});

describe('engine composition switch', () => {
  it('allows the fake engine only locally', () => {
    expect(selectEngine({ ENVIRONMENT: 'local', ENGINE: 'fake' })).toBe('fake');
    expect(() => selectEngine({ ENVIRONMENT: 'production', ENGINE: 'fake' })).toThrow();
    expect(() => selectEngine({ ENVIRONMENT: 'staging', ENGINE: 'fake' })).toThrow();
    expect(selectEngine({ ENVIRONMENT: 'production' })).toBe('real');
    expect(() => assertSafeEnvironment({ ENVIRONMENT: 'production', ENGINE: 'fake' })).toThrow();
  });
});

describe('HTTP auth in the production configuration', () => {
  const prodEnv = { ENVIRONMENT: 'production' } as unknown as Env;
  const noSession = () => Promise.resolve(null);

  it('ignores X-Whip-Dev-User and returns 401', async () => {
    const app = createApp({ resolveSession: noSession });
    const res = await app.request('/api/v1/campaigns', { headers }, prodEnv);
    expect(res.status).toBe(401);
    expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('refuses to serve at all when DEV_AUTH is set outside local', async () => {
    const app = createApp({ resolveSession: noSession });
    const env = { ENVIRONMENT: 'production', DEV_AUTH: '1' } as unknown as Env;
    const res = await app.request('/api/v1/health', {}, env);
    expect(res.status).toBe(500);
  });

  it('401s locally without dev header or session', async () => {
    const app = createApp({ resolveSession: noSession });
    const env = { ENVIRONMENT: 'local', DEV_AUTH: '1' } as unknown as Env;
    const res = await app.request('/api/v1/campaigns', {}, env);
    expect(res.status).toBe(401);
  });
});
