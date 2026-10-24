/** True inside the Tauri desktop shell (it injects these globals before the page runs). */
export function isDesktopShell(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI__' in window;
}

const BOOT_SEEN_KEY = 'whip.boot-seen';

/** Desktop: every launch. Web: the first visit in this browser session. */
export function shouldShowBoot(): boolean {
  if (isDesktopShell()) return true;
  try {
    return sessionStorage.getItem(BOOT_SEEN_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markBootSeen() {
  try {
    sessionStorage.setItem(BOOT_SEEN_KEY, '1');
  } catch {
    // Storage blocked: the boot sequence may show again, which is harmless.
  }
}
