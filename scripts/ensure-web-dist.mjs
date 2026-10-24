// Wrangler (dev, deploy --dry-run, vitest plugin) refuses to start if `assets.directory`
// (apps/web/dist) is missing. Create a placeholder when the SPA hasn't been built yet.
// A real `pnpm --filter @whip/web build` overwrites it.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, 'index.html'),
    '<!doctype html><meta charset="utf-8"><title>WHIP</title><p>SPA not built. Run <code>pnpm dev</code> (Vite on :5173) or <code>pnpm build</code>.</p>\n',
  );
  console.log('[ensure-web-dist] created placeholder apps/web/dist/index.html');
}
