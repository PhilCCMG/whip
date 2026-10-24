import {
  DesktopDownloadsResponseSchema,
  DesktopUpdateResponseSchema,
  ErrorEnvelopeSchema,
  type DesktopReleaseManifest,
} from '@whip/contracts';
import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';

// Desktop distribution against the local R2 binding (whip-releases-local), docs/architecture/08 §4.
const BASE = 'http://whip.test';
const fetchWorker = (path: string, init?: RequestInit) =>
  exports.default.fetch(new Request(`${BASE}${path}`, init));

function bucket(): R2Bucket {
  if (!env.RELEASES) throw new Error('RELEASES binding missing from the local config');
  return env.RELEASES;
}

const EXE_BYTES = new Uint8Array(Array.from({ length: 1000 }, (_, i) => i % 251));

function manifestFor(version: string): DesktopReleaseManifest {
  return {
    version,
    notes: `Release ${version}`,
    pub_date: '2026-10-25T12:00:00Z',
    platforms: {
      'windows-x86_64': {
        url_path: `WHIP_${version}_x64-setup.exe`,
        signature: `sig-win-${version}`,
        installer_path: `WHIP_${version}_x64-setup.exe`,
      },
      'darwin-aarch64': {
        url_path: 'WHIP_universal.app.tar.gz',
        signature: `sig-mac-${version}`,
        installer_path: `WHIP_${version}_universal.dmg`,
      },
      'darwin-x86_64': {
        url_path: 'WHIP_universal.app.tar.gz',
        signature: `sig-mac-${version}`,
        installer_path: `WHIP_${version}_universal.dmg`,
      },
      'linux-x86_64': {
        url_path: `WHIP_${version}_amd64.AppImage`,
        signature: `sig-linux-${version}`,
        installer_path: `WHIP_${version}_amd64.AppImage`,
      },
    },
  };
}

async function publishRelease(version: string) {
  const b = bucket();
  await b.put(`desktop/releases/${version}/WHIP_${version}_x64-setup.exe`, EXE_BYTES, {
    httpMetadata: { contentType: 'application/vnd.microsoft.portable-executable' },
  });
  await b.put(`desktop/releases/${version}/manifest.json`, JSON.stringify(manifestFor(version)));
}

const promote = (version: string) =>
  bucket().put(
    'desktop/channels/stable.json',
    JSON.stringify({ version, promotedAt: new Date().toISOString() }),
  );

const update = (target: string, arch: string, current: string) =>
  fetchWorker(`/api/v1/desktop/update/${target}/${arch}/${current}`);

describe('desktop releases (workerd + R2)', () => {
  beforeAll(async () => {
    await publishRelease('0.2.0');
    await publishRelease('0.3.0');
  });

  it('a release is not live until the channel points at it', async () => {
    await bucket().delete('desktop/channels/stable.json');
    expect((await update('windows', 'x86_64', '0.1.0')).status).toBe(204);
    const latest = DesktopDownloadsResponseSchema.parse(
      await (await fetchWorker('/download/latest.json')).json(),
    );
    expect(latest.version).toBeNull();
  });

  it('200 with the Tauri shape when outdated; 204 when current, newer or unknown', async () => {
    await promote('0.3.0');
    const res = await update('windows', 'x86_64', '0.2.0');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(DesktopUpdateResponseSchema.parse(await res.json())).toEqual({
      version: '0.3.0',
      notes: 'Release 0.3.0',
      pub_date: '2026-10-25T12:00:00Z',
      url: `${BASE}/api/v1/desktop/files/0.3.0/WHIP_0.3.0_x64-setup.exe`,
      signature: 'sig-win-0.3.0',
    });

    const mac = DesktopUpdateResponseSchema.parse(
      await (await update('darwin', 'x86_64', '0.1.0')).json(),
    );
    expect(mac.url).toBe(`${BASE}/api/v1/desktop/files/0.3.0/WHIP_universal.app.tar.gz`);

    for (const [t, a, cur] of [
      ['windows', 'x86_64', '0.3.0'],
      ['windows', 'x86_64', '0.4.0'],
      ['windows', 'aarch64', '0.1.0'],
      ['haiku', 'x86_64', '0.1.0'],
    ] as const) {
      expect((await update(t, a, cur)).status, `${t}/${a}/${cur}`).toBe(204);
    }
  });

  it('rollback: pointing the channel back stops offering the bad version (never downgrades)', async () => {
    await promote('0.3.0');
    expect(
      DesktopUpdateResponseSchema.parse(await (await update('windows', 'x86_64', '0.1.0')).json())
        .version,
    ).toBe('0.3.0');

    await promote('0.2.0');
    expect(
      DesktopUpdateResponseSchema.parse(await (await update('windows', 'x86_64', '0.1.0')).json())
        .version,
    ).toBe('0.2.0');
    // A client already on 0.3.0 is not downgraded.
    expect((await update('windows', 'x86_64', '0.3.0')).status).toBe(204);
  });

  it('a channel pointing at a missing manifest means no update', async () => {
    await promote('9.9.9');
    expect((await update('windows', 'x86_64', '0.1.0')).status).toBe(204);
  });

  it('serves release bytes with type, length, ETag and immutable caching', async () => {
    const res = await fetchWorker('/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.microsoft.portable-executable');
    expect(res.headers.get('content-length')).toBe('1000');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    const etag = res.headers.get('etag');
    expect(etag).toMatch(/^"/);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(EXE_BYTES);

    const cached = await fetchWorker('/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe', {
      headers: { 'if-none-match': etag ?? '' },
    });
    expect(cached.status).toBe(304);
    await cached.arrayBuffer();
  });

  it('supports byte ranges', async () => {
    const res = await fetchWorker('/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe', {
      headers: { range: 'bytes=10-19' },
    });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 10-19/1000');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(EXE_BYTES.slice(10, 20));

    const suffix = await fetchWorker('/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe', {
      headers: { range: 'bytes=-5' },
    });
    expect(suffix.status).toBe(206);
    expect(suffix.headers.get('content-range')).toBe('bytes 995-999/1000');
    expect(new Uint8Array(await suffix.arrayBuffer())).toEqual(EXE_BYTES.slice(995));

    const beyond = await fetchWorker('/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe', {
      headers: { range: 'bytes=5000-6000' },
    });
    expect(beyond.status).toBe(416);
    expect(beyond.headers.get('content-range')).toBe('bytes */1000');
  });

  it('404 for a missing file; rejects traversal and malformed params', async () => {
    const missing = await fetchWorker('/api/v1/desktop/files/0.2.0/nope.exe');
    expect(missing.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await missing.json()).error.code).toBe('NOT_FOUND');

    for (const path of [
      '/api/v1/desktop/files/0.2.0/..%2F..%2Fchannels%2Fstable.json',
      '/api/v1/desktop/files/0.2.0/%2E%2E',
      '/api/v1/desktop/files/..%2Fchannels/stable.json',
      '/api/v1/desktop/files/0.2.0/.manifest.json',
    ]) {
      const res = await fetchWorker(path);
      expect([400, 404], path).toContain(res.status);
      ErrorEnvelopeSchema.parse(await res.json());
    }
  });

  it('/download redirects per User-Agent, honours ?os=, and exposes latest.json', async () => {
    await promote('0.3.0');
    const cases: [string, string][] = [
      ['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'WHIP_0.3.0_x64-setup.exe'],
      ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'WHIP_0.3.0_universal.dmg'],
      ['Mozilla/5.0 (X11; Linux x86_64)', 'WHIP_0.3.0_amd64.AppImage'],
    ];
    for (const [ua, file] of cases) {
      const res = await fetchWorker('/download', {
        headers: { 'user-agent': ua },
        redirect: 'manual',
      });
      expect(res.status, ua).toBe(302);
      expect(res.headers.get('location')).toBe(`${BASE}/api/v1/desktop/files/0.3.0/${file}`);
    }

    const forced = await fetchWorker('/download?os=linux', {
      headers: { 'user-agent': cases[0]![0] },
      redirect: 'manual',
    });
    expect(forced.headers.get('location')).toContain('AppImage');

    const unknown = await fetchWorker('/download', { headers: { 'user-agent': 'curl/8' } });
    expect(unknown.status).toBe(200);
    expect(await unknown.text()).toContain('Download WHIP 0.3.0');

    const latest = DesktopDownloadsResponseSchema.parse(
      await (await fetchWorker('/download/latest.json')).json(),
    );
    expect(latest).toEqual({
      version: '0.3.0',
      downloads: {
        windows: `${BASE}/api/v1/desktop/files/0.3.0/WHIP_0.3.0_x64-setup.exe`,
        mac: `${BASE}/api/v1/desktop/files/0.3.0/WHIP_0.3.0_universal.dmg`,
        linux: `${BASE}/api/v1/desktop/files/0.3.0/WHIP_0.3.0_amd64.AppImage`,
      },
    });
  });
});
