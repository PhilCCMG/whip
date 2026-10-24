/** Window event the desktop shell waits for before showing its (initially hidden) window. */
export const BOOT_READY_EVENT = 'whip:boot-ready';

/**
 * Call once when the first boot-splash frame is rendered (e.g. in the splash's mount effect).
 * Waits two animation frames so the frame is actually painted, then tells the desktop shell to
 * show the window. Harmless on the web. The shell shows the window after 3 s regardless.
 */
export function signalBootReady(): void {
  if (typeof window === 'undefined') return;
  const fire = () => {
    window.dispatchEvent(new Event(BOOT_READY_EVENT));
  };
  if (typeof window.requestAnimationFrame !== 'function') return fire();
  window.requestAnimationFrame(() => window.requestAnimationFrame(fire));
}
