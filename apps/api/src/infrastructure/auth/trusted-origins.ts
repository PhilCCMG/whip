/**
 * Cross-origin callers of the API (docs/architecture/08-desktop.md, ADR-0011).
 *
 * The browser SPA is same-origin with the Worker and needs none of this. The Tauri desktop client
 * loads its bundled SPA from a custom scheme, so its requests to https://playwhip.com are
 * cross-origin. Those origins are fixed by Tauri v2 and cannot be claimed by any website:
 *
 * - `http://tauri.localhost`: Windows (WebView2) default.
 * - `https://tauri.localhost`: Windows with `app.windows[].useHttpsScheme`.
 * - `tauri://localhost`: macOS (WKWebView) and Linux (WebKitGTK).
 */
export const DESKTOP_ORIGINS = [
  'http://tauri.localhost',
  'https://tauri.localhost',
  'tauri://localhost',
] as const;

/** Local dev servers (Vite, `tauri dev`). Allowed only when ENVIRONMENT === "local". */
export const LOCAL_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:1420',
] as const;

export interface OriginEnv {
  ENVIRONMENT: string;
}

/** Origins allowed to call /api/* cross-origin (CORS) and trusted by Better Auth. */
export function crossOriginAllowlist(env: OriginEnv): readonly string[] {
  return env.ENVIRONMENT === 'local' ? [...DESKTOP_ORIGINS, ...LOCAL_DEV_ORIGINS] : DESKTOP_ORIGINS;
}

export function isAllowedCrossOrigin(env: OriginEnv, origin: string | undefined | null): boolean {
  return !!origin && crossOriginAllowlist(env).includes(origin);
}
