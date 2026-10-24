/** Platform adapter contract (docs/architecture/08-desktop.md). */

export type PlatformKind = 'web' | 'desktop';

export interface UpdateProgress {
  /** Bytes downloaded so far. */
  downloaded: number;
  /** Total bytes, when the server reported a length. */
  total: number | null;
}

/** A signed update that is ready to download. */
export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  /** Release notes (markdown/plain text from latest.json), if any. */
  notes: string | null;
  date: string | null;
  /** Downloads, verifies the signature, installs, then relaunches the app. Never resolves on success. */
  install(onProgress?: (progress: UpdateProgress) => void): Promise<void>;
}

export interface Platform {
  kind: PlatformKind;
  isDesktop: boolean;
  /** `''` on the web (same origin); `https://playwhip.com` (or an override) on desktop. */
  apiBase: string;
  /** `credentials` for API fetches: cookies on the web, never on desktop (bearer only). */
  fetchCredentials: RequestCredentials;
  /** Desktop app version (`0.1.0`); null on the web. */
  appVersion: string | null;

  /** Extra headers for API requests: `Authorization: Bearer …` on desktop when signed in. */
  getAuthHeaders(): Record<string, string>;
  /** Whether a desktop session token is stored (always false on the web: cookies are opaque). */
  hasSessionToken(): boolean;
  /** Store the session token (desktop: OS credential store). No-op on the web. */
  setSessionToken(token: string): Promise<void>;
  /** Read `set-auth-token` from a sign-in response and store it. Returns whether one was found. */
  captureSessionToken(response: Response): Promise<boolean>;
  /** Forget the session token (sign-out, or the server said 401). No-op on the web. */
  clearSessionToken(): Promise<void>;

  /** Exit the game (desktop). No-op on the web. */
  quit(): Promise<void>;
  /** Toggle fullscreen. Desktop: the window; web: the Fullscreen API. */
  toggleFullscreen(): Promise<void>;
  /** A newer signed build, or null (always null on the web, or when the check fails). */
  checkForUpdates(): Promise<AvailableUpdate | null>;
}
