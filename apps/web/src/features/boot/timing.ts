/** Fade length and per-card holds (ms). Total ≈ 6.6 s; reduced motion cuts with the same holds. */
export const BOOT_FADE_MS = 500;
export const BOOT_CARDS = [
  { id: 'studio', hold: 1600 },
  { id: 'legal', hold: 3000 },
] as const;
/** A card can be skipped once it has been up this long. */
export const BOOT_SKIP_AFTER_MS = 1000;
