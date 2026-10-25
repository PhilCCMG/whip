#!/usr/bin/env node
/**
 * Compresses the game's audio masters into the small files the app ships.
 *
 *   node scripts/build-audio.mjs            # build everything whose master is present
 *   FFMPEG="C:/path/ffmpeg.exe" node scripts/build-audio.mjs
 *
 * Masters live in apps/web/audio-src/ (SFX masters are committed; music masters are large and
 * git-ignored, so a missing music master is skipped with a warning and the committed output kept).
 * Outputs go to apps/web/src/assets/audio/. Never ship a master: always add new sounds here.
 *
 * SFX: silence trimmed (head and tail), peak-normalised, short fade-out, MP3 (decodes everywhere,
 * including Safari's Web Audio). Music: Opus in WebM (small) plus an MP3 fallback for browsers
 * without Opus; cover art and metadata are stripped.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'apps/web/audio-src');
const OUT = join(root, 'apps/web/src/assets/audio');

const FFMPEG_FALLBACKS = ['C:/Program Files/FFmpeg/Providers/org.buanzo.ffmpeg8.1/bin/ffmpeg.exe'];

/** Peak target for SFX after normalising (the mixer sets relative levels). */
const SFX_PEAK_DB = -1;

/**
 * @typedef {{ name: string; master: string; channels: 1 | 2; kbps: number;
 *   trimStart?: number; keepHead?: boolean; fadeOutMs?: number }} Sfx
 * @type {Sfx[]}
 */
const SFX = [
  { name: 'click', master: 'sfx/click.wav', channels: 1, kbps: 64 },
  { name: 'whoosh', master: 'sfx/whoosh.wav', channels: 2, kbps: 96, fadeOutMs: 120 },
  {
    name: 'stamp-heavy',
    master: 'sfx/347325__newagesoup__thick-stamp-nosub.wav',
    channels: 1,
    kbps: 64,
  },
  // A faint tick precedes the hit; the stamp itself lands at ~0.49s.
  {
    name: 'stamp',
    master: 'sfx/470710__ifekry__traditional-stamp.wav',
    channels: 1,
    kbps: 64,
    trimStart: 0.48,
  },
  { name: 'page-turn', master: 'sfx/397548__lilmati__page-turn-01.wav', channels: 2, kbps: 96 },
  {
    name: 'division-bell',
    master: 'sfx/division_bells.wav',
    channels: 2,
    kbps: 96,
    fadeOutMs: 200,
  },
];

/** @type {{ name: string; master: string }[]} */
const MUSIC = [
  { name: 'main-menu', master: 'music/main-menu.mp3' },
  { name: 'backbench-ballet', master: 'music/Backbench Ballet.wav' },
];

function findFfmpeg() {
  const candidates = [process.env.FFMPEG, 'ffmpeg', ...FFMPEG_FALLBACKS].filter(Boolean);
  for (const bin of candidates) {
    const r = spawnSync(bin, ['-hide_banner', '-version'], { encoding: 'utf8' });
    if (r.status === 0) return bin;
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

/** Trim chain shared by measuring and encoding, so the measured peak matches what ships. */
function trimFilters(s) {
  const f = [];
  if (s.trimStart) f.push(`atrim=start=${s.trimStart}`, 'asetpts=PTS-STARTPTS');
  // Head: drop leading near-silence (keeps the attack). Tail: same, via reverse.
  f.push('silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.005');
  f.push(
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.02',
    'areverse',
  );
  return f;
}

function peakDb(input, filters) {
  const log = run(['-i', input, '-af', [...filters, 'volumedetect'].join(','), '-f', 'null', '-']);
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(log);
  return m ? Number(m[1]) : 0;
}

function kb(path) {
  return `${(statSync(path).size / 1024).toFixed(1)} KB`;
}

mkdirSync(join(OUT, 'sfx'), { recursive: true });
mkdirSync(join(OUT, 'music'), { recursive: true });

for (const s of SFX) {
  const input = join(SRC, s.master);
  if (!existsSync(input)) {
    console.warn(`skip ${s.name}: master missing (${s.master})`);
    continue;
  }
  const trim = trimFilters(s);
  const gain = SFX_PEAK_DB - peakDb(input, trim);
  const fade = s.fadeOutMs ?? 15;
  // Fade-out via reverse so we don't need the trimmed duration up front.
  const filters = [
    ...trim,
    `volume=${gain.toFixed(2)}dB`,
    'afade=t=in:d=0.002',
    'areverse',
    `afade=t=in:d=${fade / 1000}`,
    'areverse',
  ].join(',');
  const out = join(OUT, 'sfx', `${s.name}.mp3`);
  run([
    '-y',
    '-i',
    input,
    '-map_metadata',
    '-1',
    '-af',
    filters,
    '-ac',
    String(s.channels),
    '-ar',
    '44100',
    '-c:a',
    'libmp3lame',
    '-b:a',
    `${s.kbps}k`,
    '-write_xing',
    '1',
    out,
  ]);
  console.log(`sfx   ${s.name.padEnd(14)} ${kb(input).padStart(9)} → ${kb(out)}`);
}

for (const m of MUSIC) {
  const input = join(SRC, m.master);
  if (!existsSync(input)) {
    console.warn(`skip ${m.name}: master missing (${m.master}); keeping committed output`);
    continue;
  }
  const webm = join(OUT, 'music', `${m.name}.webm`);
  const mp3 = join(OUT, 'music', `${m.name}.mp3`);
  const common = ['-y', '-i', input, '-map', '0:a:0', '-map_metadata', '-1', '-ac', '2'];
  run([...common, '-c:a', 'libopus', '-b:a', '80k', '-vbr', 'on', '-application', 'audio', webm]);
  run([...common, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '112k', mp3]);
  console.log(
    `music ${m.name.padEnd(14)} ${kb(input).padStart(9)} → ${kb(webm)} (opus), ${kb(mp3)} (mp3)`,
  );
}
