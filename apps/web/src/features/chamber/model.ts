import type { DivisionResult, KnownVote } from '../../api/types';
import { parseSimDate } from '../../lib/format';

export type Vote = NonNullable<DivisionResult['playerVote']>;

/* ----------------------------------------------------------------------------
 * Stable picks (copy pools rotate by a hash, never by Math.random)
 * ------------------------------------------------------------------------- */

/** FNV-1a, 32-bit. */
export function stableHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function pick<T>(pool: readonly T[], seed: string): T {
  return pool[stableHash(seed) % pool.length]!;
}

/* ----------------------------------------------------------------------------
 * Whips: one, two or three lines (the real convention: the whip's letter underlines the
 * business once, twice or three times)
 * ------------------------------------------------------------------------- */

export type WhipLines = 0 | 1 | 2 | 3;

/**
 * How many lines a whip instruction carries. "Free vote" / "No whip" are 0; a bare "Whipped"
 * (the party has not said how hard) counts as one line.
 */
export function whipLines(instruction: string): WhipLines {
  const s = instruction.toLowerCase();
  if (/free|no whip|unwhipped|none/.test(s)) return 0;
  if (/three|3-line|3 line/.test(s)) return 3;
  if (/two|2-line|2 line/.test(s)) return 2;
  if (/one|1-line|1 line|single/.test(s)) return 1;
  return /whip/.test(s) ? 1 : 0;
}

export const WHIP_LINE_GLOSS: Record<WhipLines, string> = {
  0: 'Free vote: conscience permitted, briefly',
  1: 'One-line whip: attendance requested',
  2: 'Two-line whip: attendance expected',
  3: 'Three-line whip: be there, vote as told',
};

/* ----------------------------------------------------------------------------
 * The bill's journey
 * ------------------------------------------------------------------------- */

export const STAGES = [
  { key: 'first', label: '1st', match: /^first/ },
  { key: 'second', label: '2nd', match: /^second/ },
  { key: 'committee', label: 'Cttee', match: /^committee/ },
  { key: 'report', label: 'Report', match: /^report/ },
  { key: 'third', label: '3rd', match: /^third/ },
  { key: 'lords', label: 'Lords', match: /^lords|^ping/ },
  { key: 'assent', label: 'Assent', match: /^royal|^assent/ },
] as const;

/** Index into `STAGES` for a stage string from the DTO ("Report stage and third reading" → 3). */
export function stageIndex(stage: string): number {
  const s = stage.toLowerCase().trim();
  const i = STAGES.findIndex((x) => x.match.test(s));
  return i === -1 ? 0 : i;
}

/* ----------------------------------------------------------------------------
 * Countdown
 * ------------------------------------------------------------------------- */

/** Whole turns (weeks) from the week starting `today` to `date`: 0 = this week. */
export function weeksUntil(today: string, date: string): number {
  const days = Math.round((parseSimDate(date).getTime() - parseSimDate(today).getTime()) / 864e5);
  return Math.max(0, Math.floor(days / 7));
}

export function countdownLabel(weeks: number): string {
  if (weeks <= 0) return 'This week';
  if (weeks === 1) return 'Next week';
  return `In ${weeks} weeks`;
}

/* ----------------------------------------------------------------------------
 * The whips' forecast (fog of war)
 * ------------------------------------------------------------------------- */

export interface ForecastCounts {
  ayes: number;
  noes: number;
  abstain: number;
  unknown: number;
}

export type ForecastCall = 'safe-aye' | 'lean-aye' | 'toss-up' | 'lean-no' | 'safe-no';

/**
 * What the known figures say, honestly: "safe" only when the unknowns could all break the
 * other way and still not overturn the lead.
 */
export function forecastCall(f: ForecastCounts): {
  call: ForecastCall;
  lead: number;
  side: 'aye' | 'no' | 'tied';
} {
  const lead = f.ayes - f.noes;
  const side = lead > 0 ? 'aye' : lead < 0 ? 'no' : 'tied';
  const margin = Math.abs(lead);
  let call: ForecastCall;
  if (margin > f.unknown) call = lead > 0 ? 'safe-aye' : 'safe-no';
  else if (margin > f.unknown / 2) call = lead > 0 ? 'lean-aye' : 'lean-no';
  else call = 'toss-up';
  return { call, lead, side };
}

export const CALL_LABEL: Record<ForecastCall, string> = {
  'safe-aye': 'Ayes on course',
  'lean-aye': 'Ayes ahead, unknowns could swing it',
  'toss-up': 'Too close to call',
  'lean-no': 'Noes ahead, unknowns could swing it',
  'safe-no': 'Noes on course',
};

const WHIP_COMMENTARY: Record<ForecastCall, readonly string[]> = {
  'safe-aye': [
    'The Whips’ Office is “quietly confident”, which is the loudest thing it does.',
    'The arithmetic holds. The Chief Whip has asked that nobody mention this to the arithmetic.',
    'Safe, say the whips, in the tone of people who have said it before.',
  ],
  'lean-aye': [
    'Comfortable on paper. The whips have stopped trusting paper.',
    'The whips are “working the phones”, which means somebody’s weekend is cancelled.',
    'A lead, but the unknowns are the sort who discover principles on Tuesdays.',
  ],
  'toss-up': [
    'The whips describe the position as “fluid”. Pairing arrangements are being cancelled.',
    'Every vote counts. Several are being counted twice, by different whips.',
    'Too close to call. The tea room has never been so popular.',
  ],
  'lean-no': [
    'The whips are “listening carefully”, a phrase that precedes concessions.',
    'Losing, narrowly. Somebody has suggested an amendment nobody has read.',
    'The Whips’ Office has started using the word “regrettable” in advance.',
  ],
  'safe-no': [
    'Lost, on the figures. The whips are drafting the line about “a listening government”.',
    'Heading for defeat. Lessons, colleagues are told, will be learned.',
    'The numbers are not there. The Chief Whip is not taking calls, only names.',
  ],
};

export function whipCommentary(call: ForecastCall, seed: string): string {
  return pick(WHIP_COMMENTARY[call], seed);
}

export const MAJORITY_CAPTIONS = [
  'On paper.',
  'On paper. Paper is famously loyal.',
  'Subject to the tea room.',
  'Before anyone discovers a conscience.',
  'Assuming everyone turns up.',
] as const;

export const VOTE_WORD: Record<KnownVote, string> = {
  aye: 'Aye',
  no: 'No',
  abstain: 'Abstain',
  unknown: 'Unknown',
};

/** Where the player's intended vote stands against their party's whip. */
export function voteAgainstWhip(vote: Vote | null, whip: Vote | null): boolean | null {
  if (!vote || !whip) return null;
  return vote !== whip;
}
