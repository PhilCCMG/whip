/**
 * Platform adapter: everything that differs between the browser build and the Tauri desktop
 * shell (docs/architecture/08-desktop.md). App code calls `getPlatform()` and never checks for
 * Tauri itself.
 *
 *   const platform = await getPlatform();
 *   fetch(`${platform.apiBase}/api/v1/me`, {
 *     credentials: platform.fetchCredentials,
 *     headers: platform.getAuthHeaders(),
 *   });
 */
import { IS_DESKTOP_BUILD, apiBase, sessionScope } from './config';
import type { Platform } from './types';
import { createWebPlatform } from './web';

export { BOOT_READY_EVENT, signalBootReady } from './boot';
export { SESSION_EXPIRED_EVENT } from './events';
export { IS_DESKTOP_BUILD, apiBase, apiUrl } from './config';
export { SESSION_TOKEN_HEADER, bearerHeaders, readSessionToken } from './token';
export type { AvailableUpdate, Platform, PlatformKind, UpdateProgress } from './types';

let current: Promise<Platform> | null = null;

async function load(): Promise<Platform> {
  // Static condition: web builds drop this branch and never emit the desktop chunk.
  if (IS_DESKTOP_BUILD) {
    const [{ getTauriBridge }, { createDesktopPlatform }] = await Promise.all([
      import('./tauri-bridge'),
      import('./desktop'),
    ]);
    const bridge = getTauriBridge();
    // A desktop-mode bundle opened in a plain browser (no Tauri shell) behaves like the web build.
    if (bridge) {
      return createDesktopPlatform(bridge, {
        apiBase,
        scope: sessionScope(apiBase, window.location.host),
      });
    }
  }
  return createWebPlatform();
}

/** The platform for this build, created once. Await it before the first API request. */
export function getPlatform(): Promise<Platform> {
  current ??= load();
  return current;
}

/** Tests only: inject a platform (or reset with null). */
export function setPlatformForTests(platform: Platform | null): void {
  current = platform ? Promise.resolve(platform) : null;
}
