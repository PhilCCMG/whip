import commonsExterior640 from '../../assets/art/news/commons-exterior-640.webp';
import commonsExterior from '../../assets/art/news/commons-exterior.webp';
import podium640 from '../../assets/art/news/podium-640.webp';
import podium from '../../assets/art/news/podium.webp';
import pressScrum640 from '../../assets/art/news/press-scrum-640.webp';
import pressScrum from '../../assets/art/news/press-scrum.webp';
import reshuffleDoor640 from '../../assets/art/news/reshuffle-door-640.webp';
import reshuffleDoor from '../../assets/art/news/reshuffle-door.webp';
import theLobby640 from '../../assets/art/news/the-lobby-640.webp';
import theLobby from '../../assets/art/news/the-lobby.webp';
import wetHustings640 from '../../assets/art/news/wet-hustings-640.webp';
import wetHustings from '../../assets/art/news/wet-hustings.webp';
import dailyClarion from '../../assets/art/mastheads/daily-clarion.webp';
import morningWhip from '../../assets/art/mastheads/morning-whip.webp';
import westminsterGazette from '../../assets/art/mastheads/westminster-gazette.webp';
import busShelter from '../../assets/art/spots/bus-shelter.webp';
import catMinisterialCar from '../../assets/art/spots/cat-ministerial-car.webp';
import llama from '../../assets/art/spots/llama.webp';
import marrow from '../../assets/art/spots/marrow.webp';
import parishCouncil from '../../assets/art/spots/parish-council.webp';
import pothole from '../../assets/art/spots/pothole.webp';
import scarecrow from '../../assets/art/spots/scarecrow.webp';
import swan from '../../assets/art/spots/swan.webp';
import tortoise from '../../assets/art/spots/tortoise.webp';
import weather from '../../assets/art/spots/weather.webp';
import type { Article, Newspaper, NewspaperSectionKey } from '../../api/types';

/* ----------------------------------------------------------------------------
 * Mastheads
 * ------------------------------------------------------------------------- */

export interface MastheadArt {
  src: string;
  width: number;
  height: number;
}

/**
 * Painted mastheads by paper title (lower case), matching `mastheads.ts` in @whip/content. A
 * paper without one keeps the type-set title.
 */
const MASTHEADS: Record<string, MastheadArt> = {
  'the morning whip': { src: morningWhip, width: 1200, height: 186 },
  'the daily clarion': { src: dailyClarion, width: 1200, height: 220 },
  'the westminster gazette': { src: westminsterGazette, width: 1200, height: 180 },
};

export function mastheadArt(title: string): MastheadArt | undefined {
  return MASTHEADS[title.trim().toLowerCase()];
}

/* ----------------------------------------------------------------------------
 * Lead-story photos
 * ------------------------------------------------------------------------- */

export type PhotoKey =
  'press-scrum' | 'the-lobby' | 'reshuffle-door' | 'podium' | 'wet-hustings' | 'commons-exterior';

export interface NewsPhoto {
  key: PhotoKey;
  /** 1280w. */
  src: string;
  /** 640w. */
  src640: string;
  /** What the picture shows (the caption is a joke, so it cannot double as the alt). */
  alt: string;
  /** Deadpan captions (10-voice-and-copy.md); one is chosen per story by a stable hash. */
  captions: readonly string[];
}

export const PHOTOS: Record<PhotoKey, NewsPhoto> = {
  'press-scrum': {
    key: 'press-scrum',
    src: pressScrum,
    src640: pressScrum640,
    alt: 'Photographers crowd a man outside a black front door at night; he shields his face with a red folder.',
    captions: [
      'A colleague arrives to offer their full support.',
      'A senior figure declines to comment, at length.',
      'The folder is understood to contain nothing of interest.',
      'Westminster, last night. Nobody was available to be unavailable.',
    ],
  },
  'the-lobby': {
    key: 'the-lobby',
    src: theLobby,
    src640: theLobby640,
    alt: 'Two MPs confer behind a Gothic stone pillar while a third walks past, out of focus.',
    captions: [
      'Two members discuss the weather. A third pretends not to listen.',
      'Colleagues deny any plot, in a corridor chosen for its acoustics.',
      'A conversation that is not happening, pictured yesterday.',
      'Loyalty, as practised behind a pillar.',
    ],
  },
  'reshuffle-door': {
    key: 'reshuffle-door',
    src: reshuffleDoor,
    src640: reshuffleDoor640,
    alt: 'Officials in suits queue along a grand corridor outside a closed black door with light beneath it.',
    captions: [
      'Hopefuls wait to learn which of them has always wanted to spend more time with family.',
      'The queue for advancement. Some have brought sandwiches.',
      'Ministers past and future, briefly indistinguishable.',
      'Behind the door, a career. Possibly someone else’s.',
    ],
  },
  podium: {
    key: 'podium',
    src: podium,
    src640: podium640,
    alt: 'An empty spotlit lectern on a conference stage with red and cream panels and rows of empty seats.',
    captions: [
      'The hall, shortly before the speech. And shortly after it.',
      'A lectern awaits a bold new vision. It has waited before.',
      'Organisers said the turnout reflected “a quiet confidence”.',
      'The stage is set for an announcement of an announcement.',
    ],
  },
  'wet-hustings': {
    key: 'wet-hustings',
    src: wetHustings,
    src640: wetHustings640,
    alt: 'A candidate at a lectern in a damp village hall, addressing a few rain-soaked attendees under bunting.',
    captions: [
      'Local democracy, in its natural habitat.',
      'The candidate reaches out to voters. Three of them.',
      'Questions from the floor included “Is the urn on?”',
      'The campaign trail, damp but in good heart.',
    ],
  },
  'commons-exterior': {
    key: 'commons-exterior',
    src: commonsExterior,
    src640: commonsExterior640,
    alt: 'The Palace of Westminster from the Embankment in the rain, with red buses crossing the bridge.',
    captions: [
      'Westminster, where the matter will be looked at very carefully.',
      'The Palace of Westminster, yesterday. It is expected to be there tomorrow.',
      'Inside, the legislation is said to be in robust health.',
      'The House rose late. The rain did not.',
    ],
  },
};

/**
 * Picking a photo for a story. The Article DTO carries no story kind or template id, so this is
 * a UI-only heuristic on the headline and standfirst, checked in priority order (the first rule
 * that matches wins), then on the story's refs. Deterministic: same article, same photo.
 */
const RULES: readonly [PhotoKey, RegExp][] = [
  [
    'press-scrum',
    /\b(scandal|row|resign(s|ed|ation)?|quits?|sleaze|expenses|apolog\w*|denies|leaked? photos?|tabloid|press|cover-up)\b/i,
  ],
  [
    'reshuffle-door',
    /\b(reshuffle\w*|appoint\w*|promot\w*|sack(s|ed|ing)?|dismiss\w*|new ministers?|ministerial|cabinet|junior post|frontbench|job)\b/i,
  ],
  [
    'the-lobby',
    /\b(plot\w*|leak\w*|rebel\w*|whisper\w*|coup|mutiny|briefing against|court(s|ed|ing)|lobbying|gossip|dissent|letters? (of|go) in)\b/i,
  ],
  [
    'podium',
    /\b(speech(es)?|conference|leader(ship)?|announce\w*|lectern|podium|address(es)?|pledge\w*|poll(s|ing)?|vision|relaunch)\b/i,
  ],
  [
    'wet-hustings',
    /\b(constituen\w*|local|hustings|by-election|campaign\w*|village|town hall|voters?|seat|doorstep\w*|protest\w*|surgery)\b/i,
  ],
  [
    'commons-exterior',
    /\b(bill|division|vote[sd]?|reading|legislation|amendment\w*|act|commons|parliament|majority|whips?|chamber|lords)\b/i,
  ],
];

/** The photo for a story (press-scrum when nothing matches). */
export function photoFor(article: Pick<Article, 'headline' | 'standfirst' | 'refs'>): NewsPhoto {
  const text = `${article.headline} ${article.standfirst ?? ''}`;
  for (const [key, re] of RULES) if (re.test(text)) return PHOTOS[key];
  const refs = new Set((article.refs ?? []).map((r) => r.kind));
  if (refs.has('constituency')) return PHOTOS['wet-hustings'];
  if (refs.has('bill') || refs.has('division')) return PHOTOS['commons-exterior'];
  return PHOTOS['press-scrum'];
}

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** A caption from the photo's pool, stable per story. */
export function captionFor(photo: NewsPhoto, seed: string): string {
  return photo.captions[hash(seed) % photo.captions.length]!;
}

/* ----------------------------------------------------------------------------
 * Filler spot art
 * ------------------------------------------------------------------------- */

export type SpotKey =
  | 'weather'
  | 'tortoise'
  | 'swan'
  | 'bus-shelter'
  | 'scarecrow'
  | 'parish-council'
  | 'cat-ministerial-car'
  | 'pothole'
  | 'llama'
  | 'marrow';

/** A cut-out picture for a filler story: one subject on a transparent ground, 480w. */
export interface SpotArt {
  key: SpotKey;
  src: string;
  width: number;
  height: number;
}

export const SPOTS: Record<SpotKey, SpotArt> = {
  weather: { key: 'weather', src: weather, width: 480, height: 480 },
  tortoise: { key: 'tortoise', src: tortoise, width: 480, height: 342 },
  swan: { key: 'swan', src: swan, width: 480, height: 480 },
  'bus-shelter': { key: 'bus-shelter', src: busShelter, width: 480, height: 480 },
  scarecrow: { key: 'scarecrow', src: scarecrow, width: 480, height: 480 },
  'parish-council': { key: 'parish-council', src: parishCouncil, width: 480, height: 480 },
  'cat-ministerial-car': {
    key: 'cat-ministerial-car',
    src: catMinisterialCar,
    width: 480,
    height: 480,
  },
  pothole: { key: 'pothole', src: pothole, width: 480, height: 480 },
  llama: { key: 'llama', src: llama, width: 480, height: 480 },
  marrow: { key: 'marrow', src: marrow, width: 480, height: 480 },
};

/**
 * Keywords on a filler story's headline, standfirst and body, in priority order (the first rule
 * that matches wins). Specific creatures come before places, and the catch-all "council" comes
 * last, so a pothole the council ignores is still a pothole. No match, no picture: there is no
 * fallback. `council` never matches "councillor" (word boundaries).
 */
const SPOT_RULES: readonly [SpotKey, RegExp][] = [
  ['cat-ministerial-car', /\b(cats?|kittens?)\b/i],
  ['swan', /\bswans?\b/i],
  ['tortoise', /\btortoises?\b/i],
  ['llama', /\bllamas?\b/i],
  ['scarecrow', /\bscarecrows?\b/i],
  ['marrow', /\b(marrows?|vegetables?|produce show|allotments?)\b/i],
  ['bus-shelter', /\bbus(es)?\b/i],
  ['pothole', /\b(potholes?|roads?|roadworks|speed bumps?)\b/i],
  ['parish-council', /\b(parish|councils?)\b/i],
];

/** Sections whose stories may carry a spot besides the Weather box. Never politics. */
const SPOT_SECTIONS: readonly NewspaperSectionKey[] = ['and_finally', 'constituencies'];

/** At most this many spots per paper, the Weather box's included: a paper, not a scrapbook. */
export const MAX_SPOTS = 3;

/** The spot a filler story's words call for, if any (keyword match only; deterministic). */
export function spotFor(
  article: Pick<Article, 'headline' | 'standfirst' | 'body' | 'filler'>,
): SpotArt | undefined {
  if (!article.filler) return undefined;
  const text = `${article.headline} ${article.standfirst ?? ''} ${article.body ?? ''}`;
  for (const [key, re] of SPOT_RULES) if (re.test(text)) return SPOTS[key];
  return undefined;
}

/**
 * Spots for the sections a paper prints, by article id: the Weather box's first story always gets
 * the raincloud, then filler stories in And Finally and Around the Constituencies take a spot by
 * keyword, in the order given, until `MAX_SPOTS`. Each picture runs once per paper. Political
 * stories (the politics section, or any article not marked filler) never get one.
 */
export function spotsForPaper(sections: Newspaper['sections']): Map<string, SpotArt> {
  const out = new Map<string, SpotArt>();
  const used = new Set<SpotKey>();
  const forecast = sections
    .filter((s) => s.key === 'weather')
    .flatMap((s) => s.articles)
    .find((a) => a.filler);
  if (forecast) {
    out.set(forecast.id, SPOTS.weather);
    used.add('weather');
  }
  for (const s of sections) {
    if (!SPOT_SECTIONS.includes(s.key)) continue;
    for (const a of s.articles) {
      if (out.size >= MAX_SPOTS) return out;
      const spot = spotFor(a);
      if (!spot || used.has(spot.key)) continue;
      out.set(a.id, spot);
      used.add(spot.key);
    }
  }
  return out;
}
