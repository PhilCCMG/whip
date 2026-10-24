#!/usr/bin/env node
// WHIP desktop distribution via R2 (docs/architecture/08-desktop.md §4). Used by
// .github/workflows/desktop-release.yml / desktop-promote.yml and for local releases.
//
//   node scripts/desktop-release.mjs publish --dir <bundles> [--version x.y.z] [--notes "…"]
//        [--notes-file f] [--bucket whip-releases] [--dry-run]
//     Collects installers/updater bundles/.sig files from --dir (flat or Tauri's bundle/ tree),
//     builds manifest.json and uploads everything to desktop/releases/{version}/ — files first,
//     manifest last. Refuses if that version's manifest already exists (releases are immutable).
//     Never touches a channel: the release lands unpublished.
//
//   node scripts/desktop-release.mjs local [--dry-run] [--notes "…"]
//     First-release helper on a dev machine: `publish` for the Windows NSIS bundle in
//     apps/desktop/src-tauri/target/release/bundle/nsis (version from tauri.conf.json).
//
//   node scripts/desktop-release.mjs promote --version x.y.z [--channel stable]
//        [--verify-base https://playwhip.com] [--bucket whip-releases] [--dry-run]
//     Verifies the release manifest exists in R2 (and, with --verify-base, that every file it
//     names is served by the Worker), then writes desktop/channels/{channel}.json. Promoting an
//     older version is the rollback: it stops offering the bad version but never downgrades
//     clients already on it (Tauri only installs newer versions) — ship fixes as a newer version.
//
// Uploads use the repo's wrangler (apps/api) with `--remote`; auth comes from `wrangler login`
// or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API_DIR = join(ROOT, 'apps', 'api');
const WRANGLER = join(API_DIR, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const TAURI_CONF = join(ROOT, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json');
const LOCAL_NSIS_DIR = join(
  ROOT,
  'apps',
  'desktop',
  'src-tauri',
  'target',
  'release',
  'bundle',
  'nsis',
);

// Keep in sync with packages/contracts/src/desktop.ts.
const VERSION_RE =
  /^(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})\.(0|[1-9]\d{0,4})(?:-([0-9A-Za-z]{1,20}(?:\.[0-9A-Za-z]{1,20}){0,4}))?$/;
const FILENAME_RE = /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._+-]{0,199}$/;
const CHANNELS = ['stable'];

const releaseKey = (version, file) => `desktop/releases/${version}/${file}`;
const channelKey = (channel) => `desktop/channels/${channel}.json`;

const CONTENT_TYPES = [
  [/\.exe$/i, 'application/vnd.microsoft.portable-executable'],
  [/\.dmg$/i, 'application/x-apple-diskimage'],
  [/\.AppImage$/i, 'application/vnd.appimage'],
  [/\.deb$/i, 'application/vnd.debian.binary-package'],
  [/\.tar\.gz$/i, 'application/gzip'],
  [/\.json$/i, 'application/json'],
  [/\.sig$/i, 'text/plain; charset=utf-8'],
];
const contentType = (file) =>
  CONTENT_TYPES.find(([re]) => re.test(file))?.[1] ?? 'application/octet-stream';

function fail(message) {
  console.error(`desktop-release: ${message}`);
  process.exit(1);
}

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

/** Which platforms a macOS artifact serves, from its name (universal when unmarked). */
function darwinPlatforms(name) {
  if (/aarch64|arm64/i.test(name)) return ['darwin-aarch64'];
  if (/x64|x86_64/i.test(name)) return ['darwin-x86_64'];
  return ['darwin-aarch64', 'darwin-x86_64'];
}

/**
 * Classifies bundle files into manifest platforms. Updater bundles: NSIS `-setup.exe`,
 * `.app.tar.gz`, `.AppImage` (each with a `.sig`). Installers: the same `.exe`, `.dmg`, `.AppImage`.
 * `.deb` is uploaded for direct download but is not in the manifest.
 */
export function planRelease(files, version, notes, pubDate) {
  const byName = new Map();
  for (const path of files) {
    const name = basename(path);
    if (!FILENAME_RE.test(name)) fail(`file name not allowed in a release: ${name}`);
    if (byName.has(name)) fail(`duplicate file name: ${name}`);
    byName.set(name, path);
  }
  const sigOf = (name) => {
    const sigPath = byName.get(`${name}.sig`);
    if (!sigPath) fail(`missing signature ${name}.sig (is TAURI_SIGNING_PRIVATE_KEY set?)`);
    return readFileSync(sigPath, 'utf8').trim();
  };

  const platforms = {};
  const names = [...byName.keys()];
  for (const name of names.filter((n) => /-setup\.exe$/i.test(n))) {
    if (!/x64|x86_64/i.test(name)) continue; // ARM64/x86 Windows builds aren't produced yet.
    platforms['windows-x86_64'] = { url_path: name, signature: sigOf(name), installer_path: name };
  }
  for (const name of names.filter((n) => /\.AppImage$/i.test(n))) {
    if (!/amd64|x86_64/i.test(name)) continue;
    platforms['linux-x86_64'] = { url_path: name, signature: sigOf(name), installer_path: name };
  }
  const dmgs = names.filter((n) => /\.dmg$/i.test(n));
  for (const name of names.filter((n) => /\.app\.tar\.gz$/i.test(n))) {
    const signature = sigOf(name);
    for (const platform of darwinPlatforms(name)) {
      const dmg =
        dmgs.find(
          (d) =>
            darwinPlatforms(d).includes(platform) &&
            darwinPlatforms(d).length === darwinPlatforms(name).length,
        ) ?? dmgs.find((d) => darwinPlatforms(d).includes(platform));
      if (!dmg) fail(`no .dmg found for ${platform} (${name})`);
      platforms[platform] = { url_path: name, signature, installer_path: dmg };
    }
  }
  if (Object.keys(platforms).length === 0)
    fail('no updater bundles found (.exe/.app.tar.gz/.AppImage)');

  for (const name of names) {
    const other = /_(\d+\.\d+\.\d+[^_]*)_/.exec(name)?.[1];
    if (other && other !== version) fail(`${name} looks like version ${other}, not ${version}`);
  }

  const manifest = { version, notes, pub_date: pubDate, platforms };
  const uploads = [...byName.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, path]) => ({
      key: releaseKey(version, name),
      path,
      size: statSync(path).size,
      contentType: contentType(name),
    }));
  return { manifest, uploads };
}

function wrangler(args, { allowFailure = false } = {}) {
  const res = spawnSync(process.execPath, [WRANGLER, ...args], {
    cwd: API_DIR,
    stdio: allowFailure ? 'pipe' : 'inherit',
    encoding: 'utf8',
  });
  if (res.error) fail(`could not run wrangler: ${res.error.message}`);
  if (res.status !== 0 && !allowFailure) fail(`wrangler ${args.slice(0, 3).join(' ')} failed`);
  return res.status === 0;
}

function putObject(bucket, key, file, type, cacheControl) {
  wrangler([
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--file',
    file,
    '--content-type',
    type,
    '--cache-control',
    cacheControl,
    '--remote',
  ]);
}

/** Downloads an R2 object to a temp file; returns its text or null if it doesn't exist. */
function getObjectText(bucket, key) {
  const dir = mkdtempSync(join(tmpdir(), 'whip-release-'));
  const file = join(dir, 'object');
  try {
    const ok = wrangler(['r2', 'object', 'get', `${bucket}/${key}`, '--file', file, '--remote'], {
      allowFailure: true,
    });
    return ok ? readFileSync(file, 'utf8') : null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function tauriVersion() {
  return JSON.parse(readFileSync(TAURI_CONF, 'utf8')).version;
}

const fmtSize = (n) => `${(n / 1024 / 1024).toFixed(2)} MiB`;
const IMMUTABLE = 'public, max-age=31536000, immutable';

function publish({ dir, version, notes, bucket, dryRun, filter }) {
  if (!VERSION_RE.test(version)) fail(`invalid version "${version}"`);
  let files;
  try {
    files = walk(resolve(dir));
  } catch {
    fail(`bundle directory not found: ${dir}`);
  }
  // Only release artifacts; ignore Tauri's intermediate files (e.g. nsis/x64 build trees).
  files = files.filter((f) =>
    /(-setup\.exe|\.dmg|\.app\.tar\.gz|\.AppImage|\.deb)(\.sig)?$/i.test(f),
  );
  if (filter) files = files.filter(filter);

  const { manifest, uploads } = planRelease(files, version, notes, new Date().toISOString());
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;

  console.log(`Release ${version} → r2://${bucket}/${releaseKey(version, '')}`);
  for (const u of uploads) {
    console.log(`  ${u.key}  ${fmtSize(u.size)}  ${u.contentType}  ← ${relative(ROOT, u.path)}`);
  }
  console.log(`  ${releaseKey(version, 'manifest.json')}  (written last)`);
  console.log(manifestJson);

  if (dryRun) {
    console.log('Dry run: nothing uploaded. The channel is never touched by publish.');
    return;
  }
  if (getObjectText(bucket, releaseKey(version, 'manifest.json')) !== null) {
    fail(
      `${version} is already published (manifest exists). Releases are immutable: bump the version.`,
    );
  }
  for (const u of uploads) putObject(bucket, u.key, u.path, u.contentType, IMMUTABLE);

  const tmp = mkdtempSync(join(tmpdir(), 'whip-release-'));
  try {
    const file = join(tmp, 'manifest.json');
    writeFileSync(file, manifestJson);
    putObject(bucket, releaseKey(version, 'manifest.json'), file, 'application/json', IMMUTABLE);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(
    `Uploaded ${version} (unpublished). Go live: run the "Desktop promote" workflow (version ${version}).`,
  );
}

async function promote({ version, channel, bucket, verifyBase, dryRun }) {
  if (!VERSION_RE.test(version)) fail(`invalid version "${version}"`);
  if (!CHANNELS.includes(channel))
    fail(`unknown channel "${channel}" (have: ${CHANNELS.join(', ')})`);

  const text = getObjectText(bucket, releaseKey(version, 'manifest.json'));
  if (text === null) fail(`no manifest for ${version} in ${bucket} — publish it first`);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch {
    fail(`manifest for ${version} is not valid JSON`);
  }
  if (manifest.version !== version) fail(`manifest version ${manifest.version} ≠ ${version}`);
  const platforms = Object.entries(manifest.platforms ?? {});
  if (platforms.length === 0) fail(`manifest for ${version} lists no platforms`);
  console.log(`Manifest ${version}: ${platforms.map(([p]) => p).join(', ')}`);

  if (verifyBase) {
    const files = new Set(platforms.flatMap(([, p]) => [p.url_path, p.installer_path]));
    for (const file of files) {
      const url = `${verifyBase.replace(/\/$/, '')}/api/v1/desktop/files/${version}/${encodeURIComponent(file)}`;
      const res = await fetch(url, { method: 'HEAD' });
      if (!res.ok) fail(`${url} → HTTP ${res.status} (is the Worker deployed with RELEASES?)`);
      console.log(`  ok ${url} (${res.headers.get('content-length') ?? '?'} bytes)`);
    }
  }

  const previous = getObjectText(bucket, channelKey(channel));
  console.log(
    `Channel ${channel}: ${previous ? JSON.parse(previous).version : '(none)'} → ${version}`,
  );
  const pointer = `${JSON.stringify({ version, promotedAt: new Date().toISOString() }, null, 2)}\n`;
  if (dryRun) {
    console.log(`Dry run: would write ${channelKey(channel)}:\n${pointer}`);
    return;
  }
  const tmp = mkdtempSync(join(tmpdir(), 'whip-release-'));
  try {
    const file = join(tmp, 'channel.json');
    writeFileSync(file, pointer);
    putObject(bucket, channelKey(channel), file, 'application/json', 'no-store');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(
    `Promoted ${version} to ${channel}. Clients see it within ~60 s (update route cache).`,
  );
}

const [command, ...rest] = process.argv.slice(2);
const { values } = parseArgs({
  args: rest,
  options: {
    dir: { type: 'string' },
    version: { type: 'string' },
    notes: { type: 'string', default: '' },
    'notes-file': { type: 'string' },
    bucket: { type: 'string', default: 'whip-releases' },
    channel: { type: 'string', default: 'stable' },
    'verify-base': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});
const notes = values['notes-file']
  ? readFileSync(values['notes-file'], 'utf8').trim()
  : values.notes;
const common = { bucket: values.bucket, dryRun: values['dry-run'] };

switch (command) {
  case 'publish':
    if (!values.dir) fail('publish needs --dir');
    publish({ ...common, dir: values.dir, version: values.version ?? tauriVersion(), notes });
    break;
  case 'local': {
    const version = values.version ?? tauriVersion();
    publish({
      ...common,
      dir: values.dir ?? LOCAL_NSIS_DIR,
      version,
      notes: notes || `WHIP desktop v${version}.`,
      // Only this version's NSIS installer (old builds linger in target/).
      filter: (f) => basename(f).startsWith(`WHIP_${version}_x64-setup.exe`),
    });
    break;
  }
  case 'promote':
    if (!values.version) fail('promote needs --version');
    await promote({
      ...common,
      version: values.version,
      channel: values.channel,
      verifyBase: values['verify-base'],
    });
    break;
  default:
    fail('usage: desktop-release.mjs publish|local|promote [options] (see the header comment)');
}
