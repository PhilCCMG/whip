/**
 * Bearer-session helpers (ADR-0011). The desktop client can't use the browser's session cookie
 * (its origin, `http://tauri.localhost` / `tauri://localhost`, is cross-site to the API), so it
 * keeps the Better Auth session token and sends it as `Authorization: Bearer <token>`.
 */

/** Response header the Better Auth `bearer` plugin sets on sign-in (CORS-exposed by the API). */
export const SESSION_TOKEN_HEADER = 'set-auth-token';

/** Headers that authenticate a request with `token` (none when signed out). */
export function bearerHeaders(token: string | null | undefined): Record<string, string> {
  const t = token?.trim();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/** The session token from a sign-in response, or null when the response carries none. */
export function readSessionToken(source: Response | Headers): string | null {
  const headers = source instanceof Headers ? source : source.headers;
  const token = headers.get(SESSION_TOKEN_HEADER)?.trim();
  return token ? token : null;
}
