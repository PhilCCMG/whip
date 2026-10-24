import { z } from 'zod';

/**
 * Desktop distribution (docs/architecture/08-desktop.md §4). Releases live in the R2 bucket
 * `whip-releases`:
 *
 * - `desktop/releases/{version}/{filename}`   installers, updater bundles, `.sig` files (immutable)
 * - `desktop/releases/{version}/manifest.json` {@link DesktopReleaseManifestSchema}
 * - `desktop/channels/{channel}.json`          {@link DesktopChannelPointerSchema}
 *
 * A release is live only while its channel points at it.
 */

/** `MAJOR.MINOR.PATCH` with an optional dotted pre-release (`0.2.0-beta.1`). No build metadata. */
export const DESKTOP_VERSION_PATTERN =
  /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})(?:-([0-9A-Za-z]{1,20}(?:\.[0-9A-Za-z]{1,20}){0,4}))?$/;

/**
 * A file name inside one release directory: starts alphanumeric, then `[A-Za-z0-9._+-]`, no `..`,
 * no slashes or percent signs (so it can never escape `desktop/releases/{version}/`).
 */
export const DESKTOP_FILENAME_PATTERN = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;

/** Tauri updater platform key `{target}-{arch}` (e.g. `windows-x86_64`, `darwin-aarch64`). */
export const DESKTOP_PLATFORM_PATTERN = /^[a-z0-9]{1,16}-[a-z0-9_]{1,16}$/;

export const DesktopVersionSchema = z.string().regex(DESKTOP_VERSION_PATTERN);
export const DesktopFilenameSchema = z.string().regex(DESKTOP_FILENAME_PATTERN);

/** Release channels. Only `stable` exists today; `beta` is reserved. */
export const DesktopChannelSchema = z.enum(['stable']);
export type DesktopChannel = z.infer<typeof DesktopChannelSchema>;

/** The platforms the release pipeline produces. */
export const DESKTOP_PLATFORMS = [
  'windows-x86_64',
  'darwin-aarch64',
  'darwin-x86_64',
  'linux-x86_64',
] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

export const DesktopPlatformReleaseSchema = z.object({
  /** Updater bundle, relative to the release directory (NSIS `.exe`, `.app.tar.gz`, `.AppImage`). */
  url_path: DesktopFilenameSchema,
  /** Contents of the bundle's minisign `.sig` file (base64), verified by the client's pubkey. */
  signature: z.string().min(1).max(4096),
  /** What a human downloads (NSIS `.exe`, `.dmg`, `.AppImage`), relative to the release directory. */
  installer_path: DesktopFilenameSchema,
});
export type DesktopPlatformRelease = z.infer<typeof DesktopPlatformReleaseSchema>;

/** `desktop/releases/{version}/manifest.json` — written by the release pipeline. */
export const DesktopReleaseManifestSchema = z.object({
  version: DesktopVersionSchema,
  notes: z.string().max(10_000).default(''),
  /** RFC 3339 timestamp. */
  pub_date: z.iso.datetime({ offset: true }),
  platforms: z.record(z.string().regex(DESKTOP_PLATFORM_PATTERN), DesktopPlatformReleaseSchema),
});
export type DesktopReleaseManifest = z.infer<typeof DesktopReleaseManifestSchema>;

/** `desktop/channels/{channel}.json` — written only by the promote workflow. */
export const DesktopChannelPointerSchema = z.object({
  version: DesktopVersionSchema,
  promotedAt: z.iso.datetime({ offset: true }),
});
export type DesktopChannelPointer = z.infer<typeof DesktopChannelPointerSchema>;

/**
 * `GET /api/v1/desktop/update/:target/:arch/:currentVersion` → 200 body (Tauri v2 updater
 * "dynamic update server" format). No update → 204 with no body.
 */
export const DesktopUpdateResponseSchema = z.object({
  version: DesktopVersionSchema,
  notes: z.string(),
  pub_date: z.string(),
  url: z.url(),
  signature: z.string(),
});
export type DesktopUpdateResponse = z.infer<typeof DesktopUpdateResponseSchema>;

/** Operating systems the `/download` redirect understands. */
export const DesktopDownloadOsSchema = z.enum(['windows', 'mac', 'linux']);
export type DesktopDownloadOs = z.infer<typeof DesktopDownloadOsSchema>;

/** `GET /download/latest.json` — for a download page. `version: null` before the first release. */
export const DesktopDownloadsResponseSchema = z.object({
  version: DesktopVersionSchema.nullable(),
  downloads: z.object({
    windows: z.url().nullable(),
    mac: z.url().nullable(),
    linux: z.url().nullable(),
  }),
});
export type DesktopDownloadsResponse = z.infer<typeof DesktopDownloadsResponseSchema>;
