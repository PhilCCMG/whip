import archive960 from '../assets/art/bg/archive-960.webp';
import archive from '../assets/art/bg/archive.webp';
import chamber960 from '../assets/art/bg/chamber-960.webp';
import chamber from '../assets/art/bg/chamber.webp';
import lobby960 from '../assets/art/bg/division-lobby-960.webp';
import lobby from '../assets/art/bg/division-lobby.webp';
import office960 from '../assets/art/bg/office-960.webp';
import office from '../assets/art/bg/office.webp';
import partyHq960 from '../assets/art/bg/party-hq-960.webp';
import partyHq from '../assets/art/bg/party-hq.webp';
import teaRoom960 from '../assets/art/bg/tea-room-960.webp';
import teaRoom from '../assets/art/bg/tea-room.webp';
import type { Place } from './places';

/** A location painting: the full file (1672w) and the 960w one for narrow or low-DPR screens. */
export interface SceneArt {
  src: string;
  src960: string;
  /** CSS object-position: which part of the painting to keep when the box crops it. */
  crop: string;
}

export type SceneKey = Place['key'] | 'division-lobby';

/** One painting per place, plus the division lobby for divisions being called or revealed. */
export const SCENES: Record<SceneKey, SceneArt> = {
  // Lamp on the left, Big Ben in the window on the right: keep both edges, lose the dim wall.
  office: { src: office, src960: office960, crop: '50% 45%' },
  chamber: { src: chamber, src960: chamber960, crop: '50% 40%' },
  'tea-room': { src: teaRoom, src960: teaRoom960, crop: '60% 50%' },
  'party-hq': { src: partyHq, src960: partyHq960, crop: '50% 45%' },
  archive: { src: archive, src960: archive960, crop: '40% 50%' },
  'division-lobby': { src: lobby, src960: lobby960, crop: '55% 50%' },
};

/** Width descriptors for `srcSet`: the browser picks by viewport width × device pixel ratio. */
export function sceneSrcSet(art: SceneArt): string {
  return `${art.src960} 960w, ${art.src} 1672w`;
}
