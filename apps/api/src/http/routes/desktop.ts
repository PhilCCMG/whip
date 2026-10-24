import {
  DesktopChannelSchema,
  DesktopDownloadOsSchema,
  DesktopFilenameSchema,
  DesktopVersionSchema,
  type DesktopReleaseManifest,
} from '@whip/contracts';
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  detectOs,
  downloadsSummary,
  installerUrl,
  liveRelease,
  parseVersion,
  releaseFileKey,
  resolveUpdate,
  contentTypeFor,
} from '../../application/desktop-releases';
import { AppError } from '../../application/errors';
import type { AppEnv } from '../../env';
import { releaseStore } from '../services';
import { validate } from '../validation';

/**
 * Desktop distribution (docs/architecture/08-desktop.md §4, ADR-0011). All unauthenticated and
 * cacheable. Updater requests come from Rust (tauri-plugin-updater), not the webview, so CORS is
 * irrelevant to them; /api/v1/desktop/* still sits behind the /api/* CORS middleware like every
 * other API route.
 */

/** The updater re-checks on every launch; a minute keeps promotes/rollbacks quick. */
export const UPDATE_CACHE_CONTROL = 'public, max-age=60';
/** Release files are immutable (never overwritten under the same version). */
export const FILE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const DOWNLOAD_CACHE_CONTROL = 'public, max-age=60';

const ChannelQuery = z.object({ channel: DesktopChannelSchema.default('stable') });

// Target/arch are only shape-checked: an unknown platform is "no update" (204), not an error.
const PlatformPart = z
  .string()
  .regex(/^[A-Za-z0-9_]{1,32}$/)
  .transform((s) => s.toLowerCase());

const UpdateParams = z.object({
  target: PlatformPart,
  arch: PlatformPart,
  currentVersion: z
    .string()
    .max(128)
    .transform((v, ctx) => {
      const parsed = parseVersion(v);
      if (!parsed) {
        ctx.addIssue({ code: 'custom', message: 'Expected a semantic version (x.y.z).' });
        return z.NEVER;
      }
      return parsed;
    }),
});

const FileParams = z.object({ version: DesktopVersionSchema, filename: DesktopFilenameSchema });

const origin = (c: Context<AppEnv>) => new URL(c.req.url).origin;

type RequestedRange = { start: number; end?: number } | { suffix: number };

/**
 * A single `bytes=` range, or `undefined` (absent, multi-range or malformed → serve the whole
 * file, which RFC 9110 §14.2 permits).
 */
export function parseRange(header: string | undefined): RequestedRange | undefined {
  if (!header) return undefined;
  const m = /^bytes=(\d{1,15})?-(\d{1,15})?$/.exec(header.trim());
  if (!m || (m[1] === undefined && m[2] === undefined)) return undefined;
  if (m[1] === undefined) return { suffix: Number(m[2]) };
  const start = Number(m[1]);
  if (m[2] === undefined) return { start };
  const end = Number(m[2]);
  return end < start ? undefined : { start, end };
}

/** Offset/length within an object of `size` bytes, or `undefined` if unsatisfiable (→ 416). */
export function resolveRange(
  range: RequestedRange,
  size: number,
): { offset: number; length: number } | undefined {
  if ('suffix' in range) {
    if (range.suffix === 0 || size === 0) return undefined;
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  if (range.start >= size) return undefined;
  const end = Math.min(range.end ?? size - 1, size - 1);
  return { offset: range.start, length: end - range.start + 1 };
}

export const desktopRoutes = new Hono<AppEnv>()
  /** Tauri v2 updater dynamic endpoint: 200 `{version, notes, pub_date, url, signature}` or 204. */
  .get(
    '/update/:target/:arch/:currentVersion',
    validate('param', UpdateParams),
    validate('query', ChannelQuery),
    async (c) => {
      const { target, arch, currentVersion } = c.req.valid('param');
      const { channel } = c.req.valid('query');
      const manifest = await liveRelease(releaseStore(c), channel);
      const update = resolveUpdate(manifest, `${target}-${arch}`, currentVersion, origin(c));
      c.header('Cache-Control', UPDATE_CACHE_CONTROL);
      if (!update) return c.body(null, 204);
      return c.json(update);
    },
  )
  /** Streams one release file from R2 (Range + If-None-Match supported). */
  .get('/files/:version/:filename', validate('param', FileParams), async (c) => {
    const { version, filename } = c.req.valid('param');
    const bucket = c.env.RELEASES;
    const notFound = () => new AppError('NOT_FOUND', 'Release file not found.');
    if (!bucket) throw notFound();
    const key = releaseFileKey(version, filename);

    // Ranges are rare (download managers resuming); resolve them against the object size first
    // (one extra HEAD) so unsatisfiable ranges get a proper 416 on every R2 implementation.
    const requested = parseRange(c.req.header('range'));
    let range: { offset: number; length: number } | undefined;
    if (requested) {
      const head = await bucket.head(key);
      if (!head) throw notFound();
      range = resolveRange(requested, head.size);
      if (!range) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${head.size}`, 'Cache-Control': 'no-store' },
        });
      }
    }

    const ifNoneMatch = c.req.header('if-none-match');
    const object = await bucket.get(key, {
      ...(range ? { range } : {}),
      ...(ifNoneMatch ? { onlyIf: new Headers({ 'if-none-match': ifNoneMatch }) } : {}),
    });
    if (!object) throw notFound();

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    if (!headers.has('content-type')) headers.set('content-type', contentTypeFor(filename));
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', FILE_CACHE_CONTROL);
    headers.set('accept-ranges', 'bytes');
    headers.set('content-disposition', `attachment; filename="${filename}"`);

    // onlyIf failed → no body.
    if (!('body' in object)) return new Response(null, { status: 304, headers });

    if (range) {
      const end = range.offset + range.length - 1;
      headers.set('content-range', `bytes ${range.offset}-${end}/${object.size}`);
      headers.set('content-length', String(range.length));
      return new Response(object.body, { status: 206, headers });
    }
    headers.set('content-length', String(object.size));
    return new Response(object.body, { status: 200, headers });
  });

const DownloadQuery = z.object({ os: DesktopDownloadOsSchema.optional().catch(undefined) });

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** Tiny fallback page when the OS can't be detected (a nicer page can live in the SPA later). */
function downloadListPage(manifest: DesktopReleaseManifest, baseOrigin: string): string {
  const { downloads } = downloadsSummary(manifest, baseOrigin);
  const entries: [string, string | null][] = [
    ['Windows', downloads.windows],
    ['macOS', downloads.mac],
    ['Linux', downloads.linux],
  ];
  const items = entries
    .flatMap(([label, url]) => (url ? [`<li><a href="${escapeHtml(url)}">${label}</a></li>`] : []))
    .join('');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Download WHIP</title><h1>Download WHIP ${escapeHtml(manifest.version)}</h1><ul>${items}</ul><p><a href="/">Play in the browser</a></p></html>`;
}

/** Mounted at top-level `/download` (wrangler.jsonc `run_worker_first`). */
export const downloadRoutes = new Hono<AppEnv>()
  .get('/latest.json', validate('query', ChannelQuery), async (c) => {
    const manifest = await liveRelease(releaseStore(c), c.req.valid('query').channel);
    c.header('Cache-Control', DOWNLOAD_CACHE_CONTROL);
    return c.json(downloadsSummary(manifest, origin(c)));
  })
  .get('/', validate('query', DownloadQuery), async (c) => {
    const manifest = await liveRelease(releaseStore(c), 'stable');
    // The answer depends on the User-Agent; don't let shared caches pin one OS's redirect.
    c.header('Cache-Control', 'no-store');
    if (!manifest) return c.redirect('/', 302);
    const os = c.req.valid('query').os ?? detectOs(c.req.header('user-agent'));
    const url = os ? installerUrl(manifest, os, origin(c)) : null;
    if (url) return c.redirect(url, 302);
    return c.html(downloadListPage(manifest, origin(c)));
  });
