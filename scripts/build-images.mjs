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

/** Newspaper filler spot art: single subjects on transparent backgrounds. */
const SPOTS = [
  'weather',
  'tortoise',
  'swan',
  'bus-shelter',
  'scarecrow',
  'parish-council',
  'cat-ministerial-car',
  'pothole',
  'llama',
  'marrow',
];

/**
 * Rubber stamps cut from generated sheets (art-src/stamps/), as `x:y:w:h` crops. The sheet's own
 * round NOTED/DIVISION stamps carried a portcullis crest and are not used; the round ones come
 * from the second sheet (tick and lobby arrows).
 */
const STAMP_SHEETS = {
  'sheet.png': {
    success: '32:32:560:272',
    partial: '612:28:552:268',
    backfired: '1168:0:600:300',
    failed: '36:300:540:264',
    noted: '624:296:520:268',
    division: '1200:304:560:264',
    carried: '20:588:392:248',
    defeated: '414:580:398:256',
    confidential: '814:576:380:264',
  },
  'round.png': {
    'noted-round': '32:48:848:800',
    'division-round': '904:48:840:816',
  },
};

/**
 * Paper and leather tiles cut from the texture atlas (art-src/textures/atlas.png), then mirrored
 * 2×2 so every edge meets its own reflection: seamless by construction.
 */
const TEXTURES = {
  newsprint: '20:20:480:480',
  'dispatch-card': '528:20:480:480',
  'diary-page': '1036:20:480:480',
  'red-folder': '20:524:480:480',
  'green-leather': '528:524:480:480',
};
const MIRROR_2X2 = 'split[a][b];[b]hflip[h];[a][h]hstack,split[t][u];[u]vflip[v];[t][v]vstack';

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

for (const dir of ['bg', 'news', 'mastheads', 'spots', 'stamps', 'textures'])
  mkdirSync(join(OUT, dir), { recursive: true });

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

for (const name of SPOTS) {
  const input = join(SRC, 'spots', `${name}.png`);
  if (!existsSync(input)) {
    console.warn(`skip spot ${name}: master missing`);
    continue;
  }
  const out = join(OUT, 'spots', `${name}.webp`);
  // Printed small in the paper's back pages: 480px covers 2× at ~240 CSS px.
  webp(input, out, "format=rgba,scale='min(480,iw)':-2:flags=lanczos", 72);
  console.log(`spot  ${name.padEnd(20)} ${kb(input).padStart(8)} → ${kb(out)}`);
}

for (const [sheet, crops] of Object.entries(STAMP_SHEETS)) {
  const input = join(SRC, 'stamps', sheet);
  if (!existsSync(input)) {
    console.warn(`skip stamps from ${sheet}: master missing`);
    continue;
  }
  for (const [name, box] of Object.entries(crops)) {
    const [w, h, x, y] = (() => {
      const [bx, by, bw, bh] = box.split(':');
      return [bw, bh, bx, by];
    })();
    const out = join(OUT, 'stamps', `${name}.webp`);
    webp(
      input,
      out,
      // Stamps show at ~160 CSS px wide; 320 covers 2×.
      `format=rgba,crop=${w}:${h}:${x}:${y},scale='min(320,iw)':-2:flags=lanczos`,
      75,
    );
    console.log(`stamp ${name.padEnd(20)} → ${kb(out)}`);
  }
}

{
  const input = join(SRC, 'textures', 'atlas.png');
  if (!existsSync(input)) {
    console.warn('skip textures: atlas missing');
  } else {
    for (const [name, box] of Object.entries(TEXTURES)) {
      const [x, y, w, h] = box.split(':');
      const out = join(OUT, 'textures', `${name}.webp`);
      webp(input, out, `crop=${w}:${h}:${x}:${y},${MIRROR_2X2},scale=768:768:flags=lanczos`, 60);
      console.log(`tex   ${name.padEnd(20)} → ${kb(out)}`);
    }
  }
}

/*
 * Desktop (apps/desktop/src-tauri/icons): the app-icon source for `tauri icon`, and the NSIS
 * installer bitmaps (BMP at exact pixel sizes: sidebar 164×314, header 150×57).
 * After rebuilding the icon source, run `pnpm --filter @whip/desktop icons`.
 */
{
  const ICONS = join(root, 'apps/desktop/src-tauri/icons');
  mkdirSync(join(ICONS, 'source'), { recursive: true });
  mkdirSync(join(ICONS, 'installer'), { recursive: true });
  const icon = join(SRC, 'desktop', 'app-icon.png');
  if (existsSync(icon)) {
    // The generated tile is opaque with black corners and a baked shadow: cut a clean
    // rounded square (radius ≈ 23% of the side, inset 14px) with an anti-aliased edge.
    const mask =
      "format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':" +
      "a='clip((290.5-hypot(max(0,abs(X-626.5)-322.5),max(0,abs(Y-626.5)-322.5)))*255,0,255)'";
    const out = join(ICONS, 'source', 'app-icon.png');
    run([
      '-y',
      '-i',
      icon,
      '-map_metadata',
      '-1',
      '-vf',
      `${mask},scale=1024:1024:flags=lanczos`,
      out,
    ]);
    console.log(`icon  app-icon             → ${kb(out)}`);
  } else console.warn('skip app icon: master missing');

  const bmp = (master, crop, size, name) => {
    const input = join(SRC, 'desktop', master);
    if (!existsSync(input)) return console.warn(`skip ${name}: master missing`);
    const out = join(ICONS, 'installer', name);
    run([
      '-y',
      '-i',
      input,
      '-vf',
      `${crop},scale=${size}:flags=lanczos`,
      '-c:v',
      'bmp',
      '-pix_fmt',
      'bgr24',
      '-frames:v',
      '1',
      out,
    ]);
    console.log(`nsis  ${name.padEnd(20)} → ${kb(out)}`);
  };
  bmp('installer-sidebar.png', 'crop=802:1536:170:0', '164:314', 'sidebar.bmp');
  bmp('installer-banner.png', 'crop=936:356:600:300', '150:57', 'header.bmp');
}
