import { apiBase as configuredApiBase } from './config';
import type { Platform } from './types';

/**
 * The browser build: same-origin API, HttpOnly cookie sessions (nothing for JS to store), no
 * quitting or self-updating.
 */
export function createWebPlatform(apiBase: string = configuredApiBase): Platform {
  return {
    kind: 'web',
    isDesktop: false,
    apiBase,
    fetchCredentials: 'include',
    appVersion: null,
    getAuthHeaders: () => ({}),
    hasSessionToken: () => false,
    setSessionToken: () => Promise.resolve(),
    captureSessionToken: () => Promise.resolve(false),
    clearSessionToken: () => Promise.resolve(),
    quit: () => Promise.resolve(),
    async toggleFullscreen() {
      if (typeof document === 'undefined') return;
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
      } catch {
        // Fullscreen refused (no user gesture, iframe policy): nothing to do.
      }
    },
    checkForUpdates: () => Promise.resolve(null),
  };
}
