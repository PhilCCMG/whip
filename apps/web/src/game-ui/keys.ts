/** Keyboard helpers shared by the in-game shell. */

export const isEditable = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.isContentEditable ||
    t.tagName === 'INPUT' ||
    t.tagName === 'TEXTAREA' ||
    t.tagName === 'SELECT');

/** A modal of any kind (Radix dialog, alert dialog, our own overlays) is on screen. */
export const modalOpen = () =>
  typeof document !== 'undefined' &&
  !!document.querySelector('[role="dialog"], [role="alertdialog"]');

/** The key that ends the week. Shown as a keycap on the END WEEK button. */
export const END_WEEK_KEY = 'E';
