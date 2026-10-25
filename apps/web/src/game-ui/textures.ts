import type { CSSProperties } from 'react';
import diaryPage from '../assets/art/textures/diary-page.webp';
import dispatchCard from '../assets/art/textures/dispatch-card.webp';
import newsprint from '../assets/art/textures/newsprint.webp';

/*
 * Seamless paper tiles (768px, shown at 384 CSS px so they stay sharp on 2× screens), laid under
 * a sheet's own paper colour by the `paper-texture` utility in styles.css. Only the URL lives
 * here: the tile is fetched when a sheet using it is on screen.
 *
 * Opacities keep body text (ink/85) and secondary text (ink/75) at WCAG AA even on the darkest
 * pixel of each tile (docs/architecture/09-game-ui.md §13 has the figures).
 */

export type TextureKey = 'newsprint' | 'dispatch-card' | 'diary-page';

const TEXTURES: Record<TextureKey, { src: string; opacity: number }> = {
  newsprint: { src: newsprint, opacity: 0.25 },
  'dispatch-card': { src: dispatchCard, opacity: 0.3 },
  'diary-page': { src: diaryPage, opacity: 0.3 },
};

/** Inline style for an element carrying the `paper-texture` class. */
export function textureStyle(key: TextureKey): CSSProperties {
  const t = TEXTURES[key];
  return {
    '--paper-texture': `url(${t.src})`,
    '--paper-texture-opacity': String(t.opacity),
  } as CSSProperties;
}
