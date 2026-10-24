import { isExternalHttpsUrl } from './external';
import { bearerHeaders, readSessionToken } from './token';
import type { TauriBridge, TauriUpdate } from './tauri-bridge';
import type { AvailableUpdate, Platform, UpdateProgress } from './types';

/** Rust commands in apps/desktop/src-tauri/src (session.rs, lib.rs). */
export const COMMANDS = {
  tokenGet: 'session_token_get',
  tokenSet: 'session_token_set',
  tokenClear: 'session_token_clear',
  toggleFullscreen: 'toggle_fullscreen',
} as const;

export interface DesktopOptions {
  apiBase: string;
  /** Credential-store key, normally the API host (see config.sessionScope). */
  scope: string;
  /** Diagnostics hook; defaults to console.warn. Never receives the token. */
  warn?: (message: string, error: unknown) => void;
}

function toAvailableUpdate(update: TauriUpdate, bridge: TauriBridge): AvailableUpdate {
  return {
    version: update.version,
    currentVersion: update.currentVersion,
    notes: update.body?.trim() || null,
    date: update.date ?? null,
    async install(onProgress?: (progress: UpdateProgress) => void) {
      const progress: UpdateProgress = { downloaded: 0, total: null };
      await update.downloadAndInstall((e) => {
        if (e.event === 'Started') progress.total = e.data.contentLength ?? null;
        else if (e.event === 'Progress') progress.downloaded += e.data.chunkLength;
        onProgress?.({ ...progress });
      });
      // Windows: the NSIS installer (passive mode) closes the app itself. Elsewhere, relaunch.
      await bridge.process?.relaunch();
    },
  };
}

/**
 * The Tauri desktop shell. Loads the stored token from the OS credential store once, then serves
 * auth headers synchronously from memory. The token is never put in localStorage: if the
 * credential store is unavailable (e.g. Linux without a Secret Service), the session lasts only
 * until the game closes.
 */
export async function createDesktopPlatform(
  bridge: TauriBridge,
  options: DesktopOptions,
): Promise<Platform> {
  const warn = options.warn ?? ((m: string, e: unknown) => console.warn(`[whip] ${m}`, e));
  const scope = { scope: options.scope };
  let token: string | null = null;
  try {
    token = (await bridge.core.invoke<string | null>(COMMANDS.tokenGet, scope)) ?? null;
  } catch (e) {
    warn('credential store unavailable; you will need to sign in each launch', e);
  }
  let appVersion: string | null = null;
  try {
    appVersion = await bridge.app.getVersion();
  } catch (e) {
    warn('could not read the app version', e);
  }

  async function setSessionToken(next: string): Promise<void> {
    const value = next.trim();
    if (!value) return;
    token = value;
    try {
      await bridge.core.invoke(COMMANDS.tokenSet, { ...scope, token: value });
    } catch (e) {
      warn('could not save the session to the credential store (kept for this launch only)', e);
    }
  }

  return {
    kind: 'desktop',
    isDesktop: true,
    apiBase: options.apiBase,
    fetchCredentials: 'omit',
    appVersion,
    getAuthHeaders: () => bearerHeaders(token),
    hasSessionToken: () => token !== null,
    setSessionToken,
    async captureSessionToken(response) {
      const value = readSessionToken(response);
      if (!value) return false;
      await setSessionToken(value);
      return true;
    },
    async clearSessionToken() {
      token = null;
      try {
        await bridge.core.invoke(COMMANDS.tokenClear, scope);
      } catch (e) {
        warn('could not clear the stored session', e);
      }
    },
    async quit() {
      if (bridge.process) await bridge.process.exit(0);
    },
    async toggleFullscreen() {
      await bridge.core.invoke<boolean>(COMMANDS.toggleFullscreen);
    },
    async openExternal(url) {
      if (!isExternalHttpsUrl(url)) return;
      if (!bridge.opener) {
        warn('opener plugin unavailable; cannot open external link', url);
        return;
      }
      try {
        await bridge.opener.openUrl(url);
      } catch (e) {
        // Outside the capability allowlist, or no default browser: nothing else to do.
        warn('could not open external link', e);
      }
    },
    async checkForUpdates() {
      if (!bridge.updater) return null;
      try {
        const update = await bridge.updater.check();
        return update ? toAvailableUpdate(update, bridge) : null;
      } catch (e) {
        // Offline, GitHub unreachable, no published release yet: never block play on this.
        warn('update check failed', e);
        return null;
      }
    },
  };
}
