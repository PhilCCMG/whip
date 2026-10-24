import { useSyncExternalStore } from 'react';

export interface InputCapabilities {
  /** `(pointer: coarse)`: the primary pointer is a finger. */
  coarse: boolean;
  /** `(hover: none)`: the primary pointer can't hover. */
  hoverNone: boolean;
  /** `(any-pointer: fine)`: some attached pointer is a mouse/trackpad/pen. */
  anyFine: boolean;
  maxTouchPoints: number;
}

/**
 * Whether start prompts should say "tap" rather than "press". Decided by input capability, not
 * viewport width: a touch-first primary pointer, or a no-hover device without any fine pointer,
 * or touch points with no fine pointer at all.
 */
export function prefersTap(c: InputCapabilities): boolean {
  if (c.coarse) return true;
  if (c.hoverNone && !c.anyFine) return true;
  return c.maxTouchPoints > 0 && !c.anyFine;
}

const QUERIES = ['(pointer: coarse)', '(hover: none)', '(any-pointer: fine)'] as const;

function read(): InputCapabilities {
  if (typeof window === 'undefined' || !window.matchMedia) {
    return { coarse: false, hoverNone: false, anyFine: true, maxTouchPoints: 0 };
  }
  const [coarse, hoverNone, anyFine] = QUERIES.map((q) => window.matchMedia(q).matches);
  return {
    coarse: !!coarse,
    hoverNone: !!hoverNone,
    anyFine: !!anyFine,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0,
  };
}

function subscribe(cb: () => void) {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  // Re-evaluate when a mouse is plugged in or a convertible changes mode.
  const lists = QUERIES.map((q) => window.matchMedia(q));
  for (const l of lists) l.addEventListener('change', cb);
  return () => {
    for (const l of lists) l.removeEventListener('change', cb);
  };
}

/** Live `prefersTap` for the current device. */
export function usePrefersTap(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => prefersTap(read()),
    () => false,
  );
}
