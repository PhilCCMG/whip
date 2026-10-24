import type { Context } from 'hono';
import type { ReadResult } from '../application/campaigns';
import type { AppEnv } from '../env';

/** Campaign-scoped reads: `ETag: "<campaignId>:<revision>"` (docs/architecture/05 §1). */
export function campaignEtag(campaignId: string, revision: number): string {
  return `"${campaignId}:${revision}"`;
}

/** The revision named by a matching `If-None-Match` for this campaign, if any. */
export function ifNoneMatchRevision(c: Context<AppEnv>, campaignId: string): number | undefined {
  const header = c.req.header('if-none-match');
  if (!header) return undefined;
  for (const raw of header.split(',')) {
    const tag = raw.trim().replace(/^W\//, '');
    const m = /^"(.+):(\d+)"$/.exec(tag);
    if (m && m[1] === campaignId) return Number(m[2]);
  }
  return undefined;
}

export function respondRead<T>(c: Context<AppEnv>, campaignId: string, result: ReadResult<T>) {
  c.header('ETag', campaignEtag(campaignId, result.revision));
  c.header('Cache-Control', 'private, no-cache');
  if (result.notModified) return c.body(null, 304);
  return c.json(result.data as object);
}
