#!/usr/bin/env node
/**
 * Compresses the game's painted art into the WebP files the app ships.
 *
 *   node scripts/build-images.mjs          # or: pnpm images:build
 *   FFMPEG="C:/path/ffmpeg.exe" node scripts/build-images.mjs
 *
 * Masters live in apps/web/art-src/ (git-ignored: large PNGs straight from the image model).
 * Outputs go to apps/web/src/assets/art/. A missing master is skipped and the committed output kept.
 * Never ship a master PNG: add new art here.
 *
 * - Backdrops: two widths (full and mobile), lossy WebP. They sit faded behind UI, so quality is
 *   modest.
 * - News photos: two widths, lossy WebP.
 * - Mastheads: transparent padding trimmed, lossy WebP with alpha, one 2× width.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'apps/web/art-src');
const OUT = join(root, 'apps/web/src/assets/art');

const FFMPEG_FALLBACKS = ['C:/Program Files/FFmpeg/Providers/org.buanzo.ffmpeg8.1/bin/ffmpeg.exe'];

const BACKDROPS = ['office', 'chamber', 'division-lobby', 'tea-room', 'party-hq', 'archive'];
const NEWS = [
  'press-scrum',
  'the-lobby',
  'reshuffle-door',
  'podium',
  'wet-hustings',
  'commons-exterior',
];
/**
 * `pre` runs before trimming. The Gazette's generated crest was a crowned portcullis, too close
 * to Parliament's own emblem, so it is cut out and the double rule is patched across the gap.
 */
const MASTHEADS = [
  { name: 'morning-whip' },
  { name: 'daily-clarion' },
  {
    name: 'westminster-gazette',
    pre: 'split[a][b];[b]crop=256:30:700:273[r];[a]drawbox=x=960:y=90:w=256:h=238:color=black@0:t=fill:replace=1[c];[c][r]overlay=960:273:format=auto',
  },
];

function findFfmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg', ...FFMPEG_FALLBACKS].filter(Boolean);
  for (const bin of candidates) {
    if (spawnSync(bin, ['-hide_banner', '-version']).status === 0) return bin;
  }
  console.error('ffmpeg not found. Install it or set FFMPEG=/path/to/ffmpeg.');
  process.exit(1);
}
const ffmpeg = findFfmpeg();

function run(args) {
  const r = spawnSync(ffmpeg, ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(r.stderr);
    throw new Error(`ffmpeg failed: ${args.join(' ')}`);
  }
  return r.stderr;
}

const kb = (p) => `${(statSync(p).size / 1024).toFixed(0)} KB`;

function webp(input, out, filter, quality, extra = []) {
  run([
    '-y',
    '-i',
    input,
    '-map_metadata',
    '-1',
    '-filter_complex',
    filter,
    '-c:v',
    'libwebp',
    '-quality',
    String(quality),
    '-compression_level',
    '6',
    ...extra,
    '-frames:v',
    '1',
    out,
  ]);
}

/** Bounding box of non-transparent pixels, via cropdetect on the alpha plane. */
function alphaBox(input, pre) {
  const chain = [pre, 'format=rgba', 'alphaextract', 'cropdetect=limit=8:round=2:reset=0:skip=0']
    .filter(Boolean)
    .join(',');
  const log = run(['-i', input, '-filter_complex', chain, '-f', 'null', '-']);
  const all = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  if (!all.length) return null;
  const [, w, h, x, y] = all.at(-1).map(Number);
  return { w, h, x, y };
}

for (const dir of ['bg', 'news', 'mastheads']) mkdirSync(join(OUT, dir), { recursive: true });

for (const name of BACKDROPS) {
  const input = join(SRC, 'backdrops', `${name}.png`);
  if (!existsSync(input)) {
    console.warn(`skip backdrop ${name}: master missing`);
    continue;
  }
  const full = join(OUT, 'bg', `${name}.webp`);
  const small = join(OUT, 'bg', `${name}-960.webp`);
  webp(input, full, "scale='min(1920,iw)':-2:flags=lanczos", 68);
  webp(input, small, 'scale=960:-2:flags=lanczos', 62);
  console.log(`bg    ${name.padEnd(20)} ${kb(input).padStart(8)} → ${kb(full)} / ${kb(small)}`);
}

for (const name of NEWS) {
  const input = join(SRC, 'news', `${name}.png`);
  if (!existsSync(input)) {
    console.warn(`skip news ${name}: master missing`);
    continue;
  }
  const full = join(OUT, 'news', `${name}.webp`);
  const small = join(OUT, 'news', `${name}-640.webp`);
  webp(input, full, "scale='min(1280,iw)':-2:flags=lanczos", 74);
  webp(input, small, 'scale=640:-2:flags=lanczos', 70);
  console.log(`news  ${name.padEnd(20)} ${kb(input).padStart(8)} → ${kb(full)} / ${kb(small)}`);
}

for (const m of MASTHEADS) {
  const input = join(SRC, 'mastheads', `${m.name}.png`);
  if (!existsSync(input)) {
    console.warn(`skip masthead ${m.name}: master missing`);
    continue;
  }
  const box = alphaBox(input, m.pre);
  const pad = 8;
  const crop = box
    ? `crop=${box.w + pad * 2}:${box.h + pad * 2}:${Math.max(0, box.x - pad)}:${Math.max(0, box.y - pad)}`
    : null;
  const filter = [m.pre, 'format=rgba', crop, "scale='min(1200,iw)':-2:flags=lanczos"]
    .filter(Boolean)
    .join(',');
  const out = join(OUT, 'mastheads', `${m.name}.webp`);
  webp(input, out, filter, 80);
  console.log(`mast  ${m.name.padEnd(20)} ${kb(input).padStart(8)} → ${kb(out)}`);
}
