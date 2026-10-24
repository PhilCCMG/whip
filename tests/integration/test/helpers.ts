import { CampaignSummarySchema, type CampaignSummary } from '@whip/contracts';
import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';

export const BASE = 'http://whip.test';

export interface CallOptions {
  user?: string;
  method?: string;
  body?: unknown;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}

/** Calls the real Worker (exports.default) with the local dev identity header. */
export function api(path: string, opts: CallOptions = {}): Promise<Response> {
  const headers = new Headers(opts.headers);
  if (opts.user) headers.set('X-Whip-Dev-User', opts.user);
  if (opts.idempotencyKey) headers.set('Idempotency-Key', opts.idempotencyKey);
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(opts.body);
  }
  return exports.default.fetch(
    new Request(`${BASE}${path}`, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      ...(body !== undefined && { body }),
    }),
  );
}

let counter = 0;
export function uniqueUser(prefix = 'user'): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function key(label: string): string {
  counter += 1;
  return `k-${label}-${Date.now().toString(36)}-${counter}`;
}

export const newCampaign = {
  name: 'Integration campaign',
  scenarioKey: 'first_weeks',
  seed: 7,
  player: {
    firstName: 'Ada',
    lastName: 'Lovelace',
    gender: 'female',
    strength: 'oratory',
    ideologyPreset: 'moderniser',
  },
} as const;

export async function createCampaign(
  user: string,
  name: string = newCampaign.name,
): Promise<CampaignSummary> {
  const res = await api('/api/v1/campaigns', { user, body: { ...newCampaign, name } });
  expect(res.status).toBe(201);
  return CampaignSummarySchema.parse(await res.json());
}

export async function errorCode(res: Response): Promise<string> {
  const body = await res.json<{ error?: { code?: string } }>();
  return body.error?.code ?? `<no error code, status ${res.status}>`;
}
