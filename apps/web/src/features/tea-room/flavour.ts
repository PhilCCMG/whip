/**
 * UI-side flavour for the Tea Room, Party HQ and Archive (docs/architecture/10-voice-and-copy.md).
 * Everything here is deterministic: the same politician always gets the same whips' note, so a
 * line reads like a filed judgement rather than a random quip. Mechanics never live here.
 */

/** FNV-1a: a stable 32-bit hash of a string. */
export function stableHash(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Pick from a pool by a seed; same seed, same line. */
export function pickBy<T>(seed: string, pool: readonly T[]): T {
  return pool[stableHash(seed) % pool.length]!;
}

/** Trait keys arrive as `principled` (mock) or `trait.principled` (engine). */
export const traitKey = (key: string) => key.replace(/^trait\./, '');

const NOTES: Record<string, readonly string[]> = {
  principled: [
    'Has principles. Will mention them.',
    'Cannot be bought. Has been asked.',
    'Votes with their conscience, which is not on the whipping list.',
  ],
  cautious: [
    'Will commit the moment it is safe to have done so.',
    'Has never been first through a lobby door.',
    'Consults the weather before the whip.',
  ],
  schemer: [
    'Keeps a ledger. You are in it.',
    'Always somewhere near the meeting that matters.',
    'Smiles in the tea room, briefs in the lobby.',
  ],
  ambitious: [
    'Measures every office for curtains.',
    'Already knows which car comes with the job.',
    'Volunteers for everything that might be noticed.',
  ],
  vain: [
    'Responds well to being quoted. Better to being photographed.',
    'Reads every profile written about them. Twice.',
    'Thanks colleagues for praise they have not yet given.',
  ],
  loyalist: [
    'Would vote for the phone book if whipped.',
    'Thinks the whip is a friend. The whip agrees.',
    'Has never rebelled. Has never been asked to explain why.',
  ],
  intimidating: [
    'Colleagues remember urgent appointments when they approach.',
    'Has never needed to raise their voice. Once was enough.',
  ],
  stubborn: [
    'Changes position roughly once a Parliament.',
    'Arguing with them is a two-week commitment.',
  ],
  respected: [
    'When they stand up, the Chamber goes quiet. Even the Opposition.',
    'Their nod is worth twenty signatures.',
  ],
  idealist: ['Still believes. Handle gently.', 'Came here to change the world. Has met the world.'],
  combative: [
    'Treats Business Questions as a contact sport.',
    'Has been asked to withdraw a remark. Did not.',
  ],
  pragmatic: ['Will support whatever is passing.', 'Has a position. It is negotiable.'],
  maverick: ['Not so much off-message as off the map.', 'The whips have a folder. It is thick.'],
  charismatic: [
    'The cameras find them. So do the donors.',
    'Could sell a three-line whip to a rebel.',
  ],
  diligent: ['Has read the bill. All of it. Has questions.', 'Tables amendments for fun.'],
  tribal: ['Would rather lose than agree with the other side.', 'Heckles on reflex.'],
  local_champion: [
    'Constituency first, party a distant second.',
    'Has never knowingly missed a fete.',
  ],
  networker: ['Knows everyone in the tea room, and what they owe.', 'Has your number. Literally.'],
};

const GENERIC = [
  'No trouble so far. Early days.',
  'Unremarkable, which the whips find suspicious.',
  'Votes the right way, mostly when watched.',
  'File thin. Keep an eye on it.',
] as const;

/** One line from the whips' file, chosen from the politician's traits by a stable hash. */
export function whipsNote(id: string, traitKeys: readonly string[]): string {
  const pools = traitKeys.map((k) => NOTES[traitKey(k)]).filter((p): p is readonly string[] => !!p);
  if (pools.length === 0) return pickBy(id, GENERIC);
  const pool = pickBy(`${id}:trait`, pools);
  return pickBy(`${id}:note`, pool);
}

/** Party HQ gauge labels. Scales are 0..100 in practice (−100..100 allowed). */
export function unityLabel(v: number): string {
  if (v >= 75) return 'Holding, allegedly';
  if (v >= 55) return 'United in public';
  if (v >= 35) return 'Briefing against itself';
  if (v >= 15) return 'Open season';
  return 'Civil war, with sandwiches';
}

export function stabilityLabel(v: number): string {
  if (v >= 75) return 'Safe until it isn’t';
  if (v >= 55) return 'Steady, for now';
  if (v >= 35) return 'Wobbling';
  return 'Lame duck watch';
}

export const WHIP_LABEL = ['None', 'Decorative', 'Advisory', 'Persuasive', 'Firm', 'Iron'] as const;

export function cohesionLabel(pct: number): string {
  if (pct >= 75) return 'Moves as one';
  if (pct >= 55) return 'Mostly together';
  if (pct >= 35) return 'Several opinions';
  return 'A loose arrangement';
}

/** Cohesion and poll share are 0..1 from the engine and 0..100 in older fixtures. */
export const asPercent = (v: number) => (Math.abs(v) <= 1 ? v * 100 : v);
