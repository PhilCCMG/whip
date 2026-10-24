import { DesktopUpdateResponseSchema, ErrorEnvelopeSchema } from '@whip/contracts';
import { describe, expect, it } from 'vitest';
import type { Env } from '../../env';
import { createApp } from '../app';
import { parseRange, resolveRange } from './desktop';

// Route-level unit tests against a JSON-only fake bucket. Byte streaming, ranges and the real
// R2 binding are covered in tests/integration/test/desktop-releases.test.ts (workerd).
function fakeBucket(objects: Record<string, unknown>): R2Bucket {
  return {
    get: (key: string) =>
      Promise.resolve(
        key in objects
          ? {
              json: () =>
                typeof objects[key] === 'string'
                  ? Promise.resolve(JSON.parse(objects[key]))
                  : Promise.resolve(objects[key]),
            }
          : null,
      ),
  } as unknown as R2Bucket;
}

const manifest = {
  version: '0.2.0',
  notes: '',
  pub_date: '2026-10-25T12:00:00Z',
  platforms: {
    'windows-x86_64': {
      url_path: 'WHIP_0.2.0_x64-setup.exe',
      signature: 'sig',
      installer_path: 'WHIP_0.2.0_x64-setup.exe',
    },
  },
};

const live = {
  'desktop/channels/stable.json': { version: '0.2.0', promotedAt: '2026-10-25T12:00:00Z' },
  'desktop/releases/0.2.0/manifest.json': manifest,
};

const envWith = (objects: Record<string, unknown> | undefined) =>
  ({
    ENVIRONMENT: 'local',
    ...(objects ? { RELEASES: fakeBucket(objects) } : {}),
  }) as unknown as Env;

const get = (path: string, env: Env, headers: Record<string, string> = {}) =>
  createApp().request(`https://playwhip.com${path}`, { headers }, env);

describe('GET /api/v1/desktop/update', () => {
  it('returns the Tauri update JSON with an absolute file URL', async () => {
    const res = await get('/api/v1/desktop/update/windows/x86_64/0.1.0', envWith(live));
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    const body = DesktopUpdateResponseSchema.parse(await res.json());
    expect(body.url).toBe(
      'https://playwhip.com/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe',
    );
  });

  it.each([
    ['up to date', '/api/v1/desktop/update/windows/x86_64/0.2.0'],
    ['newer client', '/api/v1/desktop/update/windows/x86_64/1.0.0'],
    ['unknown target', '/api/v1/desktop/update/freebsd/x86_64/0.1.0'],
    ['unknown arch', '/api/v1/desktop/update/windows/riscv64/0.1.0'],
  ])('204 when %s', async (_label, path) => {
    const res = await get(path, envWith(live));
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('204 with no channel, a corrupt pointer, or no bucket binding', async () => {
    const path = '/api/v1/desktop/update/windows/x86_64/0.1.0';
    expect((await get(path, envWith({}))).status).toBe(204);
    expect(
      (await get(path, envWith({ ...live, 'desktop/channels/stable.json': { version: '../x' } })))
        .status,
    ).toBe(204);
    expect((await get(path, envWith(undefined))).status).toBe(204);
  });

  it('400 for a malformed version or unknown channel', async () => {
    for (const path of [
      '/api/v1/desktop/update/windows/x86_64/latest',
      '/api/v1/desktop/update/windows/x86_64/0.1.0?channel=nightly',
    ]) {
      const res = await get(path, envWith(live));
      expect(res.status).toBe(400);
      expect(ErrorEnvelopeSchema.parse(await res.json()).error.code).toBe('VALIDATION_FAILED');
    }
  });
});

describe('GET /api/v1/desktop/files', () => {
  it.each([
    '/api/v1/desktop/files/0.2.0/..%2Fmanifest.json',
    '/api/v1/desktop/files/0.2.0/%2E%2E',
    '/api/v1/desktop/files/..%2F..%2Fchannels/stable.json',
    '/api/v1/desktop/files/latest/WHIP.exe',
  ])('rejects %s', async (path) => {
    const res = await get(path, envWith(live));
    expect([400, 404]).toContain(res.status);
    ErrorEnvelopeSchema.parse(await res.json());
  });
});

describe('GET /download', () => {
  const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130';

  it('redirects to the installer for the detected OS', async () => {
    const res = await get('/download', envWith(live), { 'user-agent': WIN });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(
      'https://playwhip.com/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe',
    );
  });

  it('lists what exists when the OS has no build or is unknown', async () => {
    const res = await get('/download?os=mac', envWith(live), { 'user-agent': WIN });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('WHIP_0.2.0_x64-setup.exe');
  });

  it('redirects home before the first release', async () => {
    const res = await get('/download', envWith({}), { 'user-agent': WIN });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
  });
});

describe('Range parsing', () => {
  it.each([
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=10-', { start: 10 }],
    ['bytes=-5', { suffix: 5 }],
    ['bytes=5-1', undefined],
    ['bytes=0-1,4-5', undefined],
    ['items=0-1', undefined],
    ['bytes=-', undefined],
    [undefined, undefined],
  ])('parseRange(%j)', (header, expected) => expect(parseRange(header)).toEqual(expected));

  it('resolves against the object size', () => {
    expect(resolveRange({ start: 10, end: 19 }, 1000)).toEqual({ offset: 10, length: 10 });
    expect(resolveRange({ start: 990, end: 5000 }, 1000)).toEqual({ offset: 990, length: 10 });
    expect(resolveRange({ start: 10 }, 1000)).toEqual({ offset: 10, length: 990 });
    expect(resolveRange({ suffix: 5 }, 1000)).toEqual({ offset: 995, length: 5 });
    expect(resolveRange({ suffix: 5000 }, 1000)).toEqual({ offset: 0, length: 1000 });
    expect(resolveRange({ start: 1000 }, 1000)).toBeUndefined();
    expect(resolveRange({ suffix: 0 }, 1000)).toBeUndefined();
  });
});
