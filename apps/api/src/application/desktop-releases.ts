import {
  DESKTOP_VERSION_PATTERN,
  type DesktopChannel,
  type DesktopChannelPointer,
  type DesktopDownloadOs,
  type DesktopDownloadsResponse,
  type DesktopPlatform,
  type DesktopReleaseManifest,
  type DesktopUpdateResponse,
} from '@whip/contracts';

/**
 * Desktop distribution from R2 (docs/architecture/08-desktop.md §4). Pure logic; the R2 adapter
 * is infrastructure/releases/r2-release-store.ts.
 */

export const DESKTOP_RELEASES_PREFIX = 'desktop/releases';
export const DESKTOP_CHANNELS_PREFIX = 'desktop/channels';

export const releaseFileKey = (version: string, filename: string) =>
  `${DESKTOP_RELEASES_PREFIX}/${version}/${filename}`;
export const releaseManifestKey = (version: string) => releaseFileKey(version, 'manifest.json');
export const channelKey = (channel: DesktopChannel) => `${DESKTOP_CHANNELS_PREFIX}/${channel}.json`;

/** Public path of a release file (served by GET /api/v1/desktop/files/:version/:filename). */
export const releaseFilePath = (version: string, filename: string) =>
  `/api/v1/desktop/files/${version}/${encodeURIComponent(filename)}`;

/** Read side of the release bucket. `null` = missing or unreadable (never throws for bad data). */
export interface ReleaseStore {
  channel(channel: DesktopChannel): Promise<DesktopChannelPointer | null>;
  manifest(version: string): Promise<DesktopReleaseManifest | null>;
}

interface ParsedVersion {
  core: [number, number, number];
  pre: string[];
}

/** Parses `MAJOR.MINOR.PATCH[-pre][+build]` (build metadata ignored). `null` if malformed. */
export function parseVersion(input: string): ParsedVersion | null {
  const withoutBuild = input.split('+', 2)[0] ?? '';
  const m = DESKTOP_VERSION_PATTERN.exec(withoutBuild);
  if (!m) return null;
  return {
    core: [Number(m[1]), Number(m[2]), Number(m[3])],
    pre: m[4] ? m[4].split('.') : [],
  };
}

function comparePre(a: string[], b: string[]): number {
  // A version without a pre-release ranks above one with (SemVer §11.3).
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const x = a[i];
    const y = b[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const xNum = /^\d+$/.test(x);
    const yNum = /^\d+$/.test(y);
    if (xNum && yNum) {
      if (Number(x) !== Number(y)) return Number(x) < Number(y) ? -1 : 1;
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/** SemVer 2.0 precedence: negative if a < b, 0 if equal, positive if a > b. Both must parse. */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  for (let i = 0; i < 3; i += 1) {
    const d = a.core[i]! - b.core[i]!;
    if (d !== 0) return d;
  }
  return comparePre(a.pre, b.pre);
}

/**
 * The manifest the channel currently points at, or `null` (no channel yet, or the pointer names a
 * version whose manifest is missing/mismatched — the store logs those).
 */
export async function liveRelease(
  store: ReleaseStore,
  channel: DesktopChannel,
): Promise<DesktopReleaseManifest | null> {
  const pointer = await store.channel(channel);
  if (!pointer) return null;
  const manifest = await store.manifest(pointer.version);
  if (!manifest || manifest.version !== pointer.version) return null;
  return manifest;
}

/**
 * Tauri updater answer for one client: the live release if it is newer than `currentVersion` and
 * has a bundle for `{target}-{arch}`, else `null` (→ 204). Never offers a downgrade.
 */
export function resolveUpdate(
  manifest: DesktopReleaseManifest | null,
  platform: string,
  current: ParsedVersion,
  origin: string,
): DesktopUpdateResponse | null {
  if (!manifest) return null;
  const live = parseVersion(manifest.version);
  if (!live || compareVersions(live, current) <= 0) return null;
  const entry = manifest.platforms[platform];
  if (!entry) return null;
  return {
    version: manifest.version,
    notes: manifest.notes,
    pub_date: manifest.pub_date,
    url: `${origin}${releaseFilePath(manifest.version, entry.url_path)}`,
    signature: entry.signature,
  };
}

/** Manifest platform holding the human installer for each OS (macOS is a universal build). */
const OS_PLATFORMS: Record<DesktopDownloadOs, readonly DesktopPlatform[]> = {
  windows: ['windows-x86_64'],
  mac: ['darwin-aarch64', 'darwin-x86_64'],
  linux: ['linux-x86_64'],
};

/** Absolute installer URL for an OS in the live release, or `null`. */
export function installerUrl(
  manifest: DesktopReleaseManifest | null,
  os: DesktopDownloadOs,
  origin: string,
): string | null {
  if (!manifest) return null;
  for (const platform of OS_PLATFORMS[os]) {
    const entry = manifest.platforms[platform];
    if (entry) return `${origin}${releaseFilePath(manifest.version, entry.installer_path)}`;
  }
  return null;
}

export function downloadsSummary(
  manifest: DesktopReleaseManifest | null,
  origin: string,
): DesktopDownloadsResponse {
  return {
    version: manifest?.version ?? null,
    downloads: {
      windows: installerUrl(manifest, 'windows', origin),
      mac: installerUrl(manifest, 'mac', origin),
      linux: installerUrl(manifest, 'linux', origin),
    },
  };
}

/** Best-effort desktop OS from a User-Agent. Phones/tablets/ChromeOS → `null`. */
export function detectOs(userAgent: string | undefined): DesktopDownloadOs | null {
  if (!userAgent) return null;
  if (/iPhone|iPad|iPod|Android|CrOS/i.test(userAgent)) return null;
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'mac';
  if (/Linux|X11/i.test(userAgent)) return 'linux';
  return null;
}

const CONTENT_TYPES: [RegExp, string][] = [
  [/\.exe$/i, 'application/vnd.microsoft.portable-executable'],
  [/\.msi$/i, 'application/x-msi'],
  [/\.dmg$/i, 'application/x-apple-diskimage'],
  [/\.AppImage$/i, 'application/vnd.appimage'],
  [/\.deb$/i, 'application/vnd.debian.binary-package'],
  [/\.(tar\.gz|tgz)$/i, 'application/gzip'],
  [/\.zip$/i, 'application/zip'],
  [/\.json$/i, 'application/json'],
  [/\.sig$/i, 'text/plain; charset=utf-8'],
];

/** Content-Type for a release file by extension (used when the object carries none). */
export function contentTypeFor(filename: string): string {
  for (const [re, type] of CONTENT_TYPES) if (re.test(filename)) return type;
  return 'application/octet-stream';
}
