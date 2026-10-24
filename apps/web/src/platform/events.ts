/**
 * Fired on `window` when the desktop session token was rejected (401) and has been cleared, so
 * the app can return to the SIGN IN screen. Not fired on the web (cookies are opaque to JS).
 */
export const SESSION_EXPIRED_EVENT = 'whip:session-expired';

export function signalSessionExpired(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
}
