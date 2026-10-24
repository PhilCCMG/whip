/**
 * Build-time platform configuration (docs/architecture/08-desktop.md).
 *
 * `vite --mode desktop` (packaged desktop build) and `--mode desktop-dev` (`tauri dev`) are the
 * desktop modes. Vite inlines `import.meta.env.MODE`, so in a web build `IS_DESKTOP_BUILD` is the
 * literal `false` and the desktop implementation is dropped from the bundle entirely.
 */
export const IS_DESKTOP_BUILD =
  import.meta.env.MODE === 'desktop' || import.meta.env.MODE === 'desktop-dev';

/** `''` (same origin) or an `http(s)://host[:port]` origin with no trailing slash. */
export function normaliseApiBase(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`VITE_API_BASE must be an absolute http(s) origin, got "${value}".`);
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`VITE_API_BASE must use http(s), got "${value}".`);
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(`VITE_API_BASE must be an origin without a path, got "${value}".`);
  }
  return url.origin;
}

/** Prefix for every API call: `${apiBase}/api/v1/...` and `${apiBase}/api/auth/...`. */
export const apiBase = normaliseApiBase(import.meta.env.VITE_API_BASE);

/** Absolute (desktop) or same-origin (web) URL for an API path such as `/api/v1/health`. */
export function apiUrl(path: string, base: string = apiBase): string {
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Credential-store key for the session token: the API host, so a staging or local build never
 * reads a production token. Falls back to the page host for a same-origin build.
 */
export function sessionScope(base: string, fallbackHost: string): string {
  return base ? new URL(base).host : fallbackHost || 'local';
}
