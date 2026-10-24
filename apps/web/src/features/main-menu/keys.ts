import { useEffect, useRef } from 'react';
import { uiSound } from '../audio/use-ui-sound';

/** Cursor keys: arrows plus WASD, as on most PC front ends. */
export const UP_KEYS = new Set(['ArrowUp', 'w', 'W']);
export const DOWN_KEYS = new Set(['ArrowDown', 's', 'S']);

const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT');

/**
 * Esc (anywhere) or Backspace (outside text fields) calls `onBack` and plays the UI click.
 * `onBack` returns false when it ignored the key (e.g. while saving), which keeps it silent.
 */
export function useBackKey(onBack: () => boolean | void, enabled = true) {
  const ref = useRef(onBack);
  useEffect(() => {
    ref.current = onBack;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Escape' || (e.key === 'Backspace' && !isEditable(e.target))) {
        e.preventDefault();
        if (ref.current() !== false) uiSound.click();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}
