import type { DesktopReleaseManifest } from '@whip/contracts';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  contentTypeFor,
  detectOs,
  downloadsSummary,
  liveRelease,
  parseVersion,
  resolveUpdate,
  type ReleaseStore,
} from './desktop-releases';

const v = (s: string) => {
  const parsed = parseVersion(s);
  if (!parsed) throw new Error(`bad version ${s}`);
  return parsed;
};

const ORIGIN = 'https://playwhip.com';

const manifest: DesktopReleaseManifest = {
  version: '0.2.0',
  notes: 'Fixes',
  pub_date: '2026-10-25T12:00:00Z',
  platforms: {
    'windows-x86_64': {
      url_path: 'WHIP_0.2.0_x64-setup.exe',
      signature: 'sig-win',
      installer_path: 'WHIP_0.2.0_x64-setup.exe',
    },
    'darwin-aarch64': {
      url_path: 'WHIP_universal.app.tar.gz',
      signature: 'sig-mac',
      installer_path: 'WHIP_0.2.0_universal.dmg',
    },
  },
};

describe('parseVersion / compareVersions', () => {
  it('parses x.y.z with optional pre-release and ignores build metadata', () => {
    expect(parseVersion('1.2.3')).toEqual({ core: [1, 2, 3], pre: [] });
    expect(parseVersion('1.2.3-beta.1+sha.abc')).toEqual({ core: [1, 2, 3], pre: ['beta', '1'] });
  });

  it.each(['1.2', '01.2.3', '1.2.3-', '1.2.3-..', '../1.2.3', 'v1.2.3', '1.2.3/x', ''])(
    'rejects %j',
    (s) => expect(parseVersion(s)).toBeNull(),
  );

  it.each([
    ['0.1.0', '0.2.0', -1],
    ['0.10.0', '0.9.0', 1],
    ['1.0.0', '1.0.0', 0],
    ['1.0.0-beta.1', '1.0.0', -1],
    ['1.0.0-alpha', '1.0.0-beta', -1],
    ['1.0.0-beta.2', '1.0.0-beta.11', -1],
    ['1.0.0-beta', '1.0.0-beta.1', -1],
    ['1.0.0-1', '1.0.0-alpha', -1],
  ])('%s vs %s → %i', (a, b, sign) => {
    expect(Math.sign(compareVersions(v(a), v(b)))).toBe(sign);
    expect(Math.sign(compareVersions(v(b), v(a))) + 0).toBe(-sign + 0);
  });
});

describe('resolveUpdate', () => {
  it('offers the live release to an older client on a known platform', () => {
    expect(resolveUpdate(manifest, 'windows-x86_64', v('0.1.0'), ORIGIN)).toEqual({
      version: '0.2.0',
      notes: 'Fixes',
      pub_date: '2026-10-25T12:00:00Z',
      url: 'https://playwhip.com/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe',
      signature: 'sig-win',
    });
  });

  it('offers nothing when up to date, newer, unknown platform or no release', () => {
    expect(resolveUpdate(manifest, 'windows-x86_64', v('0.2.0'), ORIGIN)).toBeNull();
    expect(resolveUpdate(manifest, 'windows-x86_64', v('0.3.0'), ORIGIN)).toBeNull();
    expect(resolveUpdate(manifest, 'linux-x86_64', v('0.1.0'), ORIGIN)).toBeNull();
    expect(resolveUpdate(null, 'windows-x86_64', v('0.1.0'), ORIGIN)).toBeNull();
  });
});

describe('liveRelease', () => {
  const store = (pointer: string | null, manifests: DesktopReleaseManifest[]): ReleaseStore => ({
    channel: () =>
      Promise.resolve(pointer ? { version: pointer, promotedAt: '2026-10-25T12:00:00Z' } : null),
    manifest: (version) => Promise.resolve(manifests.find((m) => m.version === version) ?? null),
  });

  it('follows the channel pointer', async () => {
    expect(await liveRelease(store('0.2.0', [manifest]), 'stable')).toBe(manifest);
  });

  it('is null without a channel or when the pointed manifest is missing', async () => {
    expect(await liveRelease(store(null, [manifest]), 'stable')).toBeNull();
    expect(await liveRelease(store('0.3.0', [manifest]), 'stable')).toBeNull();
  });
});

describe('downloads', () => {
  it('maps installers per OS; macOS falls back across the universal build', () => {
    expect(downloadsSummary(manifest, ORIGIN)).toEqual({
      version: '0.2.0',
      downloads: {
        windows: 'https://playwhip.com/api/v1/desktop/files/0.2.0/WHIP_0.2.0_x64-setup.exe',
        mac: 'https://playwhip.com/api/v1/desktop/files/0.2.0/WHIP_0.2.0_universal.dmg',
        linux: null,
      },
    });
    expect(downloadsSummary(null, ORIGIN)).toEqual({
      version: null,
      downloads: { windows: null, mac: null, linux: null },
    });
  });

  it.each([
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36',
      'windows',
    ],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', 'mac'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'linux'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15', null],
    ['Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130 Mobile', null],
    ['curl/8.9.1', null],
    [undefined, null],
  ])('detectOs(%j) → %j', (ua, os) => expect(detectOs(ua)).toBe(os));

  it('picks content types by extension', () => {
    expect(contentTypeFor('WHIP_0.2.0_x64-setup.exe')).toBe(
      'application/vnd.microsoft.portable-executable',
    );
    expect(contentTypeFor('WHIP_universal.app.tar.gz')).toBe('application/gzip');
    expect(contentTypeFor('WHIP_0.2.0_universal.dmg')).toBe('application/x-apple-diskimage');
    expect(contentTypeFor('x.bin')).toBe('application/octet-stream');
  });
});
