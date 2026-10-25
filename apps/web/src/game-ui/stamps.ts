import type { StampImage } from '@whip/ui';
import backfired from '../assets/art/stamps/backfired.webp';
import carried from '../assets/art/stamps/carried.webp';
import confidential from '../assets/art/stamps/confidential.webp';
import defeated from '../assets/art/stamps/defeated.webp';
import divisionRound from '../assets/art/stamps/division-round.webp';
import division from '../assets/art/stamps/division.webp';
import failed from '../assets/art/stamps/failed.webp';
import notedRound from '../assets/art/stamps/noted-round.webp';
import noted from '../assets/art/stamps/noted.webp';
import partial from '../assets/art/stamps/partial.webp';
import success from '../assets/art/stamps/success.webp';
import type { ActionOutcome, DivisionResult } from '../api/types';
import { divisionVerdict } from './division-copy';

/* ----------------------------------------------------------------------------
 * The inked stamp marks (docs/architecture/09-game-ui.md §13). `Stamp` in @whip/ui prints one
 * through its `image` prop; a word without a mark keeps the type-set stamp.
 * ------------------------------------------------------------------------- */

export type StampKey =
  | 'success'
  | 'partial'
  | 'backfired'
  | 'failed'
  | 'defeated'
  | 'confidential'
  | 'noted'
  | 'division'
  | 'carried'
  | 'noted-round'
  | 'division-round';

/** Rectangular marks by the word they print; the two round seals by name. */
export const STAMPS: Record<StampKey, StampImage> = {
  success: { src: success, width: 320, height: 156 },
  partial: { src: partial, width: 320, height: 156 },
  backfired: { src: backfired, width: 320, height: 160 },
  failed: { src: failed, width: 320, height: 156 },
  defeated: { src: defeated, width: 320, height: 206 },
  confidential: { src: confidential, width: 320, height: 222 },
  noted: { src: noted, width: 320, height: 164 },
  division: { src: division, width: 320, height: 150 },
  carried: { src: carried, width: 320, height: 202 },
  'noted-round': { src: notedRound, width: 320, height: 302, round: true },
  'division-round': { src: divisionRound, width: 320, height: 310, round: true },
};

const BY_WORD: Record<string, StampKey> = {
  success: 'success',
  partial: 'partial',
  backfired: 'backfired',
  failed: 'failed',
  defeated: 'defeated',
  confidential: 'confidential',
  noted: 'noted',
  division: 'division',
  carried: 'carried',
};

/** The rectangular mark that prints exactly this word, if there is one ("Refused": none). */
export function stampImage(word: string): StampImage | undefined {
  const key = BY_WORD[word.trim().toLowerCase()];
  return key ? STAMPS[key] : undefined;
}

export interface StampSpec {
  text: string;
  tone: 'good' | 'warning' | 'bad' | 'ink' | 'paper';
  image?: StampImage;
}

function spec(text: string, tone: StampSpec['tone']): StampSpec {
  const image = stampImage(text);
  return image ? { text, tone, image } : { text, tone };
}

/**
 * "Your week": each outcome's stamp. The word is the mechanic (10-voice-and-copy.md), so the
 * mark must print the same word: a refused action has no inked mark and stays type-set.
 */
export const OUTCOME_STAMP: Record<ActionOutcome['status'], StampSpec> = {
  succeeded: spec('Success', 'good'),
  partial: spec('Partial', 'warning'),
  failed: spec('Failed', 'bad'),
  rejected: spec('Refused', 'bad'),
};

/**
 * A division's verdict: CARRIED (the ayes have it) or DEFEATED (the noes have it). These sit on
 * ink, so a carried motion is re-inked light (`tone="paper"`); defeated keeps its vermilion.
 */
export function verdictStamp(d: Pick<DivisionResult, 'passed'>): StampSpec {
  return spec(divisionVerdict(d), d.passed ? 'paper' : 'bad');
}
