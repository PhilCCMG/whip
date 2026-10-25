import * as React from 'react';
import { cn } from '../lib/utils';

/*
 * Procedural portraits. There is no art for 650 MPs, so each one gets a flat, hard-edged bust
 * drawn from a seed (the politician id): head and hair polygons, a two-tone "cel" face lit from
 * one side, suit, collar and tie, against a flat sky from the menu painting's palette, with the
 * party colour as a band along the bottom. Same seed, same face, every render and every device.
 * No gradients, no outlines inside the figure: shapes meet edge to edge.
 */

/** FNV-1a: a stable 32-bit hash of the seed string. */
function hash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough to pick features. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length)]!;

/** [light, shade] pairs. */
const SKIN = [
  ['#f2d6bd', '#d9b394'],
  ['#e7bb98', '#c9946e'],
  ['#d29c74', '#b07a53'],
  ['#b07850', '#8c5a37'],
  ['#87553a', '#663d27'],
  ['#5e3a26', '#452a1b'],
] as const;
const HAIR = [
  '#17120f',
  '#2c2019',
  '#463022',
  '#6e4a2e',
  '#8a3f22',
  '#c49a5c',
  '#8f8d86',
  '#d6d1c6',
] as const;
/** [cloth, lapel shade] */
const SUIT = [
  ['#1d2b35', '#141f27'],
  ['#25282c', '#1a1c1f'],
  ['#2d3a33', '#1f2924'],
  ['#3b302a', '#2a221d'],
  ['#4b5058', '#383c42'],
  ['#5a2025', '#43171b'],
] as const;
/** The painting's sky: ember, orange, lamp gold, dusk, slate teal, deep teal. */
const SKY = ['#c8462c', '#dc6f33', '#d29a3e', '#8d3b2a', '#5f7a76', '#3d5653'] as const;
const TIE = ['#dd2928', '#1d3d6e', '#c9962f', '#2f6b45', '#5b3a73', '#a91c16'] as const;
/** Light hair still gets visible brows: a darker shade of it. */
const browColour = (hair: string) =>
  ({ '#c49a5c': '#7d5f35', '#8f8d86': '#5d5b56', '#d6d1c6': '#8f8a80' })[hair] ?? hair;

const SHIRT = '#efe9dc';
const INK = '#0f1d1c';

type Hair = 'crop' | 'part' | 'receding' | 'bob' | 'long' | 'bun' | 'quiff' | 'curls';
const HAIRS: readonly Hair[] = [
  'crop',
  'part',
  'receding',
  'bob',
  'long',
  'bun',
  'quiff',
  'curls',
  'crop',
  'part',
];
type Neck = 'tie' | 'open' | 'scoop';

export interface PortraitFeatures {
  sky: string;
  skin: readonly [string, string];
  hair: Hair;
  hairColour: string;
  suit: readonly [string, string];
  neck: Neck;
  tie: string;
  glasses: boolean;
  /** Light from the left (shadow on the right) or the other way. */
  lightLeft: boolean;
  broad: boolean;
  wideHead: boolean;
  /** Brow set: negative raised at the centre (open), positive lowered (stern). */
  brow: number;
}

/** The features a seed produces (exported for tests and for callers that want the palette). */
export function portraitFeatures(seed: string, partyColour?: string | null): PortraitFeatures {
  const r = rng(hash(seed));
  const hair = pick(r, HAIRS);
  const neck: Neck =
    hair === 'bob' || hair === 'long' || hair === 'bun'
      ? pick(r, ['scoop', 'open', 'tie'] as const)
      : pick(r, ['tie', 'tie', 'open'] as const);
  const tie = partyColour && r() < 0.45 ? partyColour : pick(r, TIE);
  return {
    sky: pick(r, SKY),
    skin: pick(r, SKIN),
    hair,
    hairColour: pick(r, HAIR),
    suit: pick(r, SUIT),
    neck,
    tie,
    glasses: r() < 0.22,
    lightLeft: r() < 0.5,
    broad: r() < 0.55,
    wideHead: r() < 0.5,
    brow: Math.round((r() * 1.6 - 0.6) * 10) / 10,
  };
}

export const PORTRAIT_SIZES = { xs: 24, sm: 32, md: 48, lg: 72, xl: 120 } as const;
export type PortraitSize = keyof typeof PORTRAIT_SIZES;

export interface PortraitProps extends Omit<React.ComponentProps<'svg'>, 'children'> {
  /** Stable id (politician id). */
  seed: string;
  /** Accessible name. Omit when the name is printed next to the portrait (it is then decorative). */
  name?: string | undefined;
  partyColour?: string | null | undefined;
  size?: PortraitSize;
  /** Draw with a hard ink keyline (for portraits on paper). */
  framed?: boolean;
}

const pts = (p: number[]) => p.join(' ');

/** One flat polygon per style, drawn over the head (long hair also has a back layer). */
function HairShape({ hair, colour }: { hair: Hair; colour: string }) {
  switch (hair) {
    case 'crop':
      return (
        <polygon
          fill={colour}
          points={pts([
            21, 25, 22, 16, 26, 11, 32, 9, 38, 11, 42, 16, 43, 25, 41, 19, 32, 16, 23, 19,
          ])}
        />
      );
    case 'part':
      return (
        <polygon
          fill={colour}
          points={pts([
            21, 26, 21, 15, 27, 9.5, 36, 9, 42, 13, 43, 24, 41, 17, 30, 15, 27, 13.5, 23, 20,
          ])}
        />
      );
    case 'receding':
      return (
        <>
          <polygon fill={colour} points={pts([21, 27, 21.5, 18, 25, 15, 24, 27])} />
          <polygon fill={colour} points={pts([43, 27, 42.5, 18, 39, 15, 40, 27])} />
        </>
      );
    case 'bob':
      return (
        <polygon
          fill={colour}
          points={pts([
            19, 38, 19, 18, 24, 11, 32, 8, 40, 11, 45, 18, 45, 38, 41.5, 38, 42, 22, 36, 15.5, 27,
            17, 22.5, 22, 22.5, 38,
          ])}
        />
      );
    case 'long':
      return (
        <polygon
          fill={colour}
          points={pts([22.5, 24, 24, 13, 32, 9, 40, 13, 41.5, 24, 38, 16, 29, 16, 25, 19])}
        />
      );
    case 'bun':
      return (
        <>
          <polygon fill={colour} points={pts([28, 9, 29, 3.5, 35, 3.5, 36, 9])} />
          <polygon
            fill={colour}
            points={pts([
              21, 25, 22, 15, 27, 10, 32, 9, 37, 10, 42, 15, 43, 25, 40, 17, 32, 15, 24, 17,
            ])}
          />
        </>
      );
    case 'quiff':
      return (
        <polygon
          fill={colour}
          points={pts([21, 24, 22, 14, 28, 6, 38, 6.5, 43, 13, 43, 24, 40.5, 16.5, 31, 14, 24, 18])}
        />
      );
    case 'curls':
      return (
        <polygon
          fill={colour}
          points={pts([18, 30, 18, 15, 25, 6, 39, 6, 46, 15, 46, 30, 42.5, 22, 32, 18, 21.5, 22])}
        />
      );
  }
}

/**
 * A deterministic procedural bust (seed = politician id). Sizes xs 24, sm 32, md 48, lg 72,
 * xl 120 px. Decorative unless `name` is given.
 */
export function Portrait({
  seed,
  name,
  partyColour,
  size = 'md',
  framed = false,
  className,
  style,
  ...props
}: PortraitProps) {
  const f = React.useMemo(() => portraitFeatures(seed, partyColour), [seed, partyColour]);
  const px = PORTRAIT_SIZES[size];
  const [skin, shade] = f.skin;
  const [cloth, lapel] = f.suit;
  const hw = f.wideHead ? 1.5 : 0; // half-width tweak
  const head = [
    22 - hw,
    22,
    25 - hw,
    14,
    32,
    11,
    39 + hw,
    14,
    42 + hw,
    22,
    42 + hw,
    31,
    37 + hw * 0.5,
    39,
    27 - hw * 0.5,
    39,
    22 - hw,
    31,
  ];
  // Shaded half of the face: from the crown down the centre line to the chin, on the dark side.
  const shadeRight = [
    32,
    11,
    39 + hw,
    14,
    42 + hw,
    22,
    42 + hw,
    31,
    37 + hw * 0.5,
    39,
    33,
    39,
    34,
    27,
  ];
  const shadeLeft = [
    32,
    11,
    25 - hw,
    14,
    22 - hw,
    22,
    22 - hw,
    31,
    27 - hw * 0.5,
    39,
    31,
    39,
    30,
    27,
  ];
  const body = f.broad
    ? [3, 64, 7, 52, 20, 45.5, 44, 45.5, 57, 52, 61, 64]
    : [8, 64, 11, 53, 22, 46.5, 42, 46.5, 53, 53, 56, 64];
  const label = name
    ? { role: 'img' as const, 'aria-label': name }
    : { 'aria-hidden': true as const };

  return (
    <svg
      viewBox="0 0 64 64"
      width={px}
      height={px}
      focusable="false"
      className={cn(
        'block shrink-0',
        framed && 'outline-2 -outline-offset-2 outline-ink',
        className,
      )}
      style={style}
      {...label}
      {...props}
    >
      <rect width="64" height="64" fill={f.sky} />
      {/* Long hair falls behind the shoulders. */}
      {f.hair === 'long' && (
        <polygon
          fill={f.hairColour}
          points={pts([18, 52, 18.5, 19, 24, 11, 32, 8.5, 40, 11, 45.5, 19, 46, 52])}
        />
      )}
      <rect x="27" y="35" width="10" height="13" fill={shade} />
      <polygon fill={cloth} points={pts(body)} />
      {f.neck === 'scoop' ? (
        <polygon fill={skin} points={pts([24, 46, 40, 46, 37, 53, 27, 53])} />
      ) : (
        <polygon fill={SHIRT} points={pts([24.5, 45.5, 39.5, 45.5, 32, 60])} />
      )}
      {f.neck === 'open' && (
        <polygon fill={shade} points={pts([28.5, 45.5, 35.5, 45.5, 32, 51.5])} />
      )}
      {f.neck === 'tie' && (
        <polygon
          fill={f.tie}
          points={pts([30.6, 47.5, 33.4, 47.5, 34.4, 56.5, 32, 61, 29.6, 56.5])}
        />
      )}
      <polygon fill={lapel} points={pts([20, 45.5, 25, 45.5, 32, 62, 26.5, 53])} />
      <polygon fill={lapel} points={pts([44, 45.5, 39, 45.5, 32, 62, 37.5, 53])} />
      {/* Ears, then the head in two flat tones. */}
      <polygon
        fill={shade}
        points={pts([20 - hw, 23, 22.5 - hw, 23, 22.5 - hw, 30, 20.5 - hw, 29])}
      />
      <polygon
        fill={shade}
        points={pts([44 + hw, 23, 41.5 + hw, 23, 41.5 + hw, 30, 43.5 + hw, 29])}
      />
      <polygon fill={skin} points={pts(head)} />
      <polygon fill={shade} points={pts(f.lightLeft ? shadeRight : shadeLeft)} />
      <HairShape hair={f.hair} colour={f.hairColour} />
      {/* Brows: the one facial mark. Enough to give the face a set, not enough to go uncanny. */}
      <g fill={browColour(f.hairColour)}>
        <polygon points={pts([24.5, 22.2, 30.5, 21.6 + f.brow, 30.5, 23.2 + f.brow, 24.5, 23.6])} />
        <polygon points={pts([39.5, 22.2, 33.5, 21.6 + f.brow, 33.5, 23.2 + f.brow, 39.5, 23.6])} />
      </g>
      {f.glasses && (
        <g fill="none" stroke={INK} strokeWidth="1.3">
          <rect x="24.5" y="24.8" width="6.5" height="4.2" />
          <rect x="33" y="24.8" width="6.5" height="4.2" />
          <path d="M31 26.4h2" />
        </g>
      )}
      {/* Party colour band. */}
      <rect y="60" width="64" height="4" fill={partyColour ?? '#7f9277'} />
    </svg>
  );
}
