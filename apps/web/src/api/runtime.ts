import { apiBase, getPlatform } from '../platform';
import { createApiClient, type FetchLike } from './client';

/**
 * `VITE_API_MOCK=1` swaps the network for the in-browser mock backend. The mock module is only
 * reachable through this dynamic import, and Vite inlines the env flag, so production builds
 * (flag unset) drop the branch and never emit the mock chunk.
 */
export const isMockMode = import.meta.env.VITE_API_MOCK === '1';

let override: FetchLike | null = null;
let mockFetch: Promise<FetchLike> | null = null;

/** Tests: point the app's API client at a specific fetch (e.g. a fresh mock backend). */
export function setApiFetch(fetchImpl: FetchLike | null): void {
  override = fetchImpl;
}

/** The fetch the API client uses (test override, mock backend, or the network). */
export function resolveFetch(): FetchLike | Promise<FetchLike> {
  if (override) return override;
  if (isMockMode) {
    mockFetch ??= import('../mocks').then((m) => m.mockBackend.fetch);
    return mockFetch;
  }
  return (input, init) => fetch(input, init);
}

export const api = createApiClient({
  fetch: resolveFetch,
  // `''` (same origin) on the web; https://playwhip.com (VITE_API_BASE) on desktop.
  baseUrl: `${apiBase}/api/v1`,
  platform: getPlatform,
  devUser: import.meta.env.VITE_DEV_USER,
});
