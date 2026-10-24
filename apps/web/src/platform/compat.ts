import { HealthResponseSchema, type HealthResponse } from '@whip/contracts';
import { apiUrl } from './config';

/** The API major version this client speaks (`/api/v1`). */
export const SUPPORTED_API_MAJOR = 1;

/** Compares dotted numeric versions (`0.10.0` > `0.9.3`). Missing parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export type Compatibility =
  | { status: 'ok' }
  /** This desktop build is older than the server's `minDesktopVersion`: it must update. */
  | { status: 'update-required'; minVersion: string }
  /** The server speaks a different API major version than this client. */
  | { status: 'api-incompatible'; apiVersion: string };

export function compatibility(health: HealthResponse, appVersion: string | null): Compatibility {
  if (health.apiVersion) {
    const major = Number.parseInt(health.apiVersion.split('.')[0] ?? '', 10);
    if (major !== SUPPORTED_API_MAJOR) {
      return { status: 'api-incompatible', apiVersion: health.apiVersion };
    }
  }
  if (appVersion && health.minDesktopVersion) {
    if (compareVersions(appVersion, health.minDesktopVersion) < 0) {
      return { status: 'update-required', minVersion: health.minDesktopVersion };
    }
  }
  return { status: 'ok' };
}

/** Fetches `/api/v1/health` and checks it. Null when the server can't be reached or parsed. */
export async function checkCompatibility(
  appVersion: string | null,
  base?: string,
  fetchImpl: typeof fetch = (input, init) => fetch(input, init),
): Promise<Compatibility | null> {
  try {
    const res = await fetchImpl(apiUrl('/api/v1/health', base), { credentials: 'omit' });
    if (!res.ok) return null;
    const parsed = HealthResponseSchema.safeParse(await res.json());
    return parsed.success ? compatibility(parsed.data, appVersion) : null;
  } catch {
    return null;
  }
}
