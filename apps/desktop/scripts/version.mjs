#!/usr/bin/env node
// Desktop version source of truth: apps/desktop/src-tauri/tauri.conf.json `version`.
// package.json and Cargo.toml are kept in sync with it.
//
//   pnpm --filter @whip/desktop version:bump 0.2.0   # set all three
//   pnpm --filter @whip/desktop version:bump patch   # or major | minor | patch
//   pnpm --filter @whip/desktop version:check        # fail if they differ (CI / release)
//   pnpm --filter @whip/desktop version:check desktop-v0.2.0   # …and match a release tag
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const files = {
  tauri: resolve(root, 'src-tauri/tauri.conf.json'),
  pkg: resolve(root, 'package.json'),
  cargo: resolve(root, 'src-tauri/Cargo.toml'),
};
const SEMVER = /^\d+\.\d+\.\d+$/;
const CARGO_VERSION = /^(version\s*=\s*")([^"]+)(")/m;

function read() {
  const tauri = JSON.parse(readFileSync(files.tauri, 'utf8')).version;
  const pkg = JSON.parse(readFileSync(files.pkg, 'utf8')).version;
  const cargo = CARGO_VERSION.exec(readFileSync(files.cargo, 'utf8'))?.[2];
  return { tauri, pkg, cargo };
}

function next(current, arg) {
  if (SEMVER.test(arg)) return arg;
  const [major, minor, patch] = current.split('.').map(Number);
  if (arg === 'major') return `${major + 1}.0.0`;
  if (arg === 'minor') return `${major}.${minor + 1}.0`;
  if (arg === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error(`Expected x.y.z | major | minor | patch, got "${arg ?? ''}"`);
}

function setJsonVersion(file, version) {
  const text = readFileSync(file, 'utf8');
  writeFileSync(file, text.replace(/("version"\s*:\s*")[^"]+(")/, `$1${version}$2`));
}

const [command, arg] = process.argv.slice(2);
const current = read();

if (command === 'check') {
  const values = new Set(Object.values(current));
  if (values.size !== 1 || !SEMVER.test(current.tauri)) {
    console.error('Desktop versions out of sync:', current);
    process.exit(1);
  }
  if (arg && arg.replace(/^desktop-v/, '') !== current.tauri) {
    console.error(`Tag ${arg} does not match tauri.conf.json version ${current.tauri}`);
    process.exit(1);
  }
  console.log(`desktop version ${current.tauri}`);
} else if (command === 'bump') {
  const version = next(current.tauri, arg);
  setJsonVersion(files.tauri, version);
  setJsonVersion(files.pkg, version);
  const cargo = readFileSync(files.cargo, 'utf8');
  writeFileSync(files.cargo, cargo.replace(CARGO_VERSION, `$1${version}$3`));
  console.log(`desktop version ${current.tauri} → ${version}`);
  console.log(
    `Next: commit, then  git tag desktop-v${version} && git push origin desktop-v${version}`,
  );
} else {
  console.error('Usage: version.mjs bump <x.y.z|major|minor|patch> | check [tag]');
  process.exit(1);
}
