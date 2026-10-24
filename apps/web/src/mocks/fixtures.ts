/**
 * Fixture world for the "First Weeks" scenario (docs/architecture/07-vertical-slice.md).
 * Pure data plus small deterministic builders: no Math.random, no wall clock.
 * Every value here must parse with its @whip/contracts schema (see fixtures.test.ts).
 */
import type {
  Bill,
  CampaignSummary,
  CareerOverview,
  DivisionForecast,
  DivisionResult,
  Headline,
  HistoryItem,
  KnownVote,
  MockWorld,
  Notification,
  ParliamentView,
  PartyView,
  PendingEvent,
  PlayerSetup,
  PoliticianProfile,
  RelationshipSummary,
  Reputation,
  TurnReport,
  Vote,
} from './types';

/* ----------------------------------------------------------------------------
 * Ids and constants
 * ------------------------------------------------------------------------- */

export const CAMPAIGN_ID = 'cmp_ashby';
export const SECOND_CAMPAIGN_ID = 'cmp_kesworth';
export const PLAYER_ID = 'pol_player';
export const HDB_ID = 'bill_hdb';
export const HDB_2R_DIVISION_ID = 'div_hdb_2r';
export const HDB_3R_DIVISION_ID = 'div_hdb_3r';
export const SIMULATION_VERSION = 1;

/** Ordered list of Commons/Lords stages used by bills in the mock. */
export const BILL_STAGES = [
  'First reading',
  'Second reading',
  'Committee stage',
  'Report stage',
  'Third reading',
  'Lords stages',
  'Royal Assent',
] as const;

/** Tiny seeded PRNG (mulberry32) so generated MPs are stable across reloads. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Monday of a given turn (turn 1 = Mon 3 Sep 2029). */
export function turnStart(turn: number): string {
  return addDays('2029-09-03', (turn - 1) * 7);
}

/* ----------------------------------------------------------------------------
 * Parties and factions
 * ------------------------------------------------------------------------- */

export interface PartyInfo {
  id: string;
  name: string;
  shortName: string;
  colour: string;
  seats: number;
  inGovernment: boolean;
  ideology: { economic: number; social: number };
}

export const PARTIES: PartyInfo[] = [
  {
    id: 'party.npp',
    name: 'National Progressive Party',
    shortName: 'NPP',
    colour: '#C8322B',
    seats: 362,
    inGovernment: true,
    ideology: { economic: -30, social: -20 },
  },
  {
    id: 'party.con',
    name: 'Constitutional Party',
    shortName: 'CON',
    colour: '#2F5D9E',
    seats: 168,
    inGovernment: false,
    ideology: { economic: 45, social: 30 },
  },
  {
    id: 'party.lr',
    name: 'Liberal Reform',
    shortName: 'LR',
    colour: '#E3A21A',
    seats: 58,
    inGovernment: false,
    ideology: { economic: 0, social: -45 },
  },
  {
    id: 'party.scp',
    name: 'Scottish Commonwealth Party',
    shortName: 'SCP',
    colour: '#E8D44D',
    seats: 32,
    inGovernment: false,
    ideology: { economic: -35, social: -30 },
  },
  {
    id: 'party.sov',
    name: 'Sovereignty Party',
    shortName: 'SOV',
    colour: '#6B3FA0',
    seats: 12,
    inGovernment: false,
    ideology: { economic: 30, social: 65 },
  },
  {
    id: 'party.grn',
    name: 'Green Coalition',
    shortName: 'GRN',
    colour: '#3E9B4F',
    seats: 6,
    inGovernment: false,
    ideology: { economic: -55, social: -60 },
  },
  {
    id: 'party.ind',
    name: 'Independents & others',
    shortName: 'IND',
    colour: '#8A8F8C',
    seats: 12,
    inGovernment: false,
    ideology: { economic: 0, social: 0 },
  },
];

function party(id: string): PartyInfo {
  const p = PARTIES.find((x) => x.id === id);
  if (!p) throw new Error(`unknown party ${id}`);
  return p;
}

export const FACTIONS = {
  modernisers: { id: 'faction.modernisers', name: 'Modernisers' },
  heartlands: { id: 'faction.heartlands', name: 'Heartlands' },
  shire: { id: 'faction.shire_suburbs', name: 'Shire & Suburbs' },
} as const;
type FactionKey = keyof typeof FACTIONS;

export const ISSUES = [
  { issueKey: 'issue.housing_targets', label: 'Housing targets' },
  { issueKey: 'issue.green_belt', label: 'Green-belt protection' },
  { issueKey: 'issue.social_housing', label: 'Social housing' },
  { issueKey: 'issue.local_control', label: 'Local control' },
  { issueKey: 'issue.public_spending', label: 'Public spending' },
  { issueKey: 'issue.immigration', label: 'Immigration' },
] as const;

const TRAITS: Record<string, { label: string; description: string }> = {
  principled: {
    label: 'Principled',
    description: 'Votes on conviction. Hard to buy, slow to forgive a broken promise.',
  },
  cautious: {
    label: 'Cautious',
    description: 'Avoids risk. Waits to see which way the wind blows before committing.',
  },
  schemer: {
    label: 'Schemer',
    description: 'Plays the long game and keeps a ledger of favours owed.',
  },
  ambitious: { label: 'Ambitious', description: 'Wants the next job, and the one after that.' },
  vain: { label: 'Vain', description: 'Responds well to flattery and public credit.' },
  loyalist: {
    label: 'Loyalist',
    description: 'Backs the leadership by instinct. Rebels only in extremis.',
  },
  intimidating: {
    label: 'Intimidating',
    description: 'Colleagues think twice before crossing them.',
  },
  stubborn: { label: 'Stubborn', description: 'Once a position is taken, it is rarely abandoned.' },
  respected: { label: 'Respected', description: 'Their word carries weight across the House.' },
  idealist: { label: 'Idealist', description: 'Came into politics to change things, and says so.' },
  combative: { label: 'Combative', description: 'Relishes a fight at the despatch box.' },
  diligent: { label: 'Diligent', description: 'Reads the bill. All of it.' },
  local_champion: { label: 'Local champion', description: 'Constituency first, party second.' },
  networker: { label: 'Networker', description: 'Knows everyone in the tea room by name.' },
};

function traits(...keys: string[]) {
  return keys.map((key) => {
    const t = TRAITS[key];
    if (!t) throw new Error(`unknown trait ${key}`);
    return { key, ...t };
  });
}

type Skills = Record<
  'oratory' | 'negotiation' | 'administration' | 'intrigue' | 'media' | 'policy',
  number
>;

function rel(
  trust: number,
  respect: number,
  affinity: number,
  obligation = 0,
  rivalry = 0,
): RelationshipSummary {
  return { trust, respect, affinity, obligation, rivalry };
}

function stancesFrom(values: [number, number, number, number, number, number]) {
  return ISSUES.map((issue, i) => ({ ...issue, stance: values[i] ?? 0 }));
}

/* ----------------------------------------------------------------------------
 * Named cast
 * ------------------------------------------------------------------------- */

interface CastSpec {
  id: string;
  name: string;
  party: string;
  constituency: string;
  offices: string[];
  faction: FactionKey | null;
  age: number;
  ideology: { economic: number; social: number };
  traits: string[];
  ambition: { label: string; intensity: number } | null;
  skills: Skills;
  stances: [number, number, number, number, number, number];
  reputation: Reputation;
  loyalty: number;
  influence: number;
  towardsPlayer: RelationshipSummary | null;
  fromPlayer: RelationshipSummary | null;
  memories: { turn: number; text: string }[];
  career: { date: string; text: string }[];
  keyRelationships: { id: string; name: string; kind: 'ally' | 'rival' | 'patron' | 'protege' }[];
  intention: Vote;
  known: KnownVote | null;
  status?: string;
}

const CAST: CastSpec[] = [
  {
    id: 'pol_ashdown',
    name: 'Helen Ashdown',
    party: 'party.npp',
    constituency: 'Haverleigh North',
    offices: ['Prime Minister', 'Leader of the National Progressive Party'],
    faction: 'modernisers',
    age: 56,
    ideology: { economic: -18, social: -28 },
    traits: ['principled', 'cautious', 'respected'],
    ambition: { label: 'Legacy', intensity: 4 },
    skills: {
      oratory: 16,
      negotiation: 15,
      administration: 17,
      intrigue: 11,
      media: 14,
      policy: 16,
    },
    stances: [2, 0, 1, 0, 1, 0],
    reputation: { public: 61, party_members: 72, colleagues: 68, media: 55, whips: 80 },
    loyalty: 95,
    influence: 92,
    towardsPlayer: rel(5, 8, 4),
    fromPlayer: rel(20, 45, 15),
    memories: [],
    career: [
      { date: '2014-05-08', text: 'Elected MP for Haverleigh North' },
      { date: '2024-11-02', text: 'Elected leader of the NPP' },
      { date: '2029-08-31', text: 'Became Prime Minister after a 74-seat majority' },
    ],
    keyRelationships: [
      { id: 'pol_coyle', name: 'Martin Coyle', kind: 'ally' },
      { id: 'pol_nair', name: 'Priya Nair', kind: 'protege' },
      { id: 'pol_vane', name: 'Sir Richard Vane', kind: 'rival' },
    ],
    intention: 'aye',
    known: 'aye',
  },
  {
    id: 'pol_coyle',
    name: 'Martin Coyle',
    party: 'party.npp',
    constituency: 'Lockford South',
    offices: ['Chancellor of the Exchequer'],
    faction: 'modernisers',
    age: 51,
    ideology: { economic: -8, social: -30 },
    traits: ['schemer', 'ambitious', 'networker'],
    ambition: { label: 'Party leadership', intensity: 5 },
    skills: {
      oratory: 13,
      negotiation: 16,
      administration: 15,
      intrigue: 17,
      media: 13,
      policy: 14,
    },
    stances: [1, 0, 0, 0, -1, 0],
    reputation: { public: 44, party_members: 58, colleagues: 62, media: 51, whips: 66 },
    loyalty: 70,
    influence: 81,
    towardsPlayer: rel(2, 6, 3),
    fromPlayer: rel(0, 30, 0),
    memories: [],
    career: [
      { date: '2015-05-07', text: 'Elected MP for Lockford South' },
      { date: '2025-02-14', text: 'Shadow Chancellor' },
      { date: '2029-08-31', text: 'Appointed Chancellor of the Exchequer' },
    ],
    keyRelationships: [
      { id: 'pol_nair', name: 'Priya Nair', kind: 'rival' },
      { id: 'pol_kemp', name: 'Sarah Kemp', kind: 'protege' },
      { id: 'pol_ashdown', name: 'Helen Ashdown', kind: 'ally' },
    ],
    intention: 'aye',
    known: 'aye',
  },
  {
    id: 'pol_nair',
    name: 'Priya Nair',
    party: 'party.npp',
    constituency: 'Eastwick and Thorne',
    offices: ['Secretary of State for Housing'],
    faction: 'modernisers',
    age: 44,
    ideology: { economic: -22, social: -35 },
    traits: ['ambitious', 'vain', 'diligent'],
    ambition: { label: 'Party leadership', intensity: 4 },
    skills: {
      oratory: 14,
      negotiation: 12,
      administration: 15,
      intrigue: 10,
      media: 15,
      policy: 16,
    },
    stances: [2, -1, 0, -2, 1, 0],
    reputation: { public: 49, party_members: 60, colleagues: 52, media: 58, whips: 64 },
    loyalty: 82,
    influence: 74,
    towardsPlayer: rel(6, 10, 8),
    fromPlayer: rel(10, 35, 10),
    memories: [{ turn: 2, text: 'Thanked Rachel for a supportive question at Housing questions' }],
    career: [
      { date: '2019-12-12', text: 'Elected MP for Eastwick and Thorne' },
      { date: '2029-08-31', text: 'Appointed Secretary of State for Housing' },
      { date: '2029-09-05', text: 'Introduced the Housing Delivery Bill' },
    ],
    keyRelationships: [
      { id: 'pol_coyle', name: 'Martin Coyle', kind: 'rival' },
      { id: 'pol_ashdown', name: 'Helen Ashdown', kind: 'patron' },
    ],
    intention: 'aye',
    known: 'aye',
  },
  {
    id: 'pol_pryce',
    name: 'Gareth Pryce',
    party: 'party.npp',
    constituency: 'Merthyr Vale',
    offices: ['Chief Whip'],
    faction: null,
    age: 59,
    ideology: { economic: -30, social: -10 },
    traits: ['loyalist', 'intimidating'],
    ambition: null,
    skills: { oratory: 9, negotiation: 14, administration: 13, intrigue: 16, media: 7, policy: 9 },
    stances: [1, 0, 0, 0, 0, 0],
    reputation: { public: 22, party_members: 48, colleagues: 57, media: 30, whips: 95 },
    loyalty: 99,
    influence: 70,
    towardsPlayer: rel(12, 9, 2),
    fromPlayer: rel(5, 40, -5),
    memories: [{ turn: 1, text: 'Noted Rachel as a "sound" new member at the intake dinner' }],
    career: [
      { date: '2005-05-05', text: 'Elected MP for Merthyr Vale' },
      { date: '2024-11-10', text: 'Opposition Chief Whip' },
      { date: '2029-08-31', text: 'Appointed Chief Whip' },
    ],
    keyRelationships: [
      { id: 'pol_hargreaves', name: 'Lucy Hargreaves', kind: 'protege' },
      { id: 'pol_walsh', name: 'Bernadette Walsh', kind: 'rival' },
    ],
    intention: 'aye',
    known: 'aye',
  },
  {
    id: 'pol_hargreaves',
    name: 'Lucy Hargreaves',
    party: 'party.npp',
    constituency: 'Calder Bridge',
    offices: ['Deputy Chief Whip'],
    faction: null,
    age: 47,
    ideology: { economic: -28, social: -18 },
    traits: ['loyalist', 'cautious'],
    ambition: { label: 'Chief Whip', intensity: 3 },
    skills: { oratory: 8, negotiation: 13, administration: 14, intrigue: 14, media: 8, policy: 10 },
    stances: [1, 0, 0, 0, 0, 0],
    reputation: { public: 15, party_members: 35, colleagues: 50, media: 20, whips: 90 },
    loyalty: 96,
    influence: 44,
    towardsPlayer: rel(10, 8, 6),
    fromPlayer: rel(10, 25, 5),
    memories: [],
    career: [
      { date: '2017-06-08', text: 'Elected MP for Calder Bridge' },
      { date: '2029-08-31', text: 'Appointed Deputy Chief Whip' },
    ],
    keyRelationships: [{ id: 'pol_pryce', name: 'Gareth Pryce', kind: 'patron' }],
    intention: 'aye',
    known: 'aye',
  },
  {
    id: 'pol_walsh',
    name: 'Bernadette Walsh',
    party: 'party.npp',
    constituency: 'Gorsedale and Pithead',
    offices: [],
    faction: 'heartlands',
    age: 63,
    ideology: { economic: -62, social: -22 },
    traits: ['principled', 'stubborn', 'respected'],
    ambition: { label: 'Policy cause: social housing', intensity: 5 },
    skills: {
      oratory: 15,
      negotiation: 11,
      administration: 9,
      intrigue: 13,
      media: 12,
      policy: 14,
    },
    stances: [0, 0, 2, 1, 2, 0],
    reputation: { public: 40, party_members: 74, colleagues: 61, media: 47, whips: 18 },
    loyalty: 41,
    influence: 58,
    towardsPlayer: rel(4, 7, 5),
    fromPlayer: rel(15, 40, 5),
    memories: [{ turn: 2, text: 'Spoke with Rachel after the Heartlands open meeting' }],
    career: [
      { date: '1997-05-01', text: 'Elected MP for Gorsedale and Pithead' },
      { date: '2010-06-01', text: 'Founded the Heartlands group' },
    ],
    keyRelationships: [
      { id: 'pol_pryce', name: 'Gareth Pryce', kind: 'rival' },
      { id: 'pol_osei', name: 'Daniel Osei', kind: 'protege' },
    ],
    intention: 'no',
    known: 'no',
  },
  {
    id: 'pol_fairley',
    name: 'Tom Fairley',
    party: 'party.npp',
    constituency: 'Marlow Heath',
    offices: [],
    faction: 'shire',
    age: 49,
    ideology: { economic: -12, social: 0 },
    traits: ['cautious', 'local_champion'],
    ambition: { label: 'A safe seat', intensity: 4 },
    skills: {
      oratory: 10,
      negotiation: 12,
      administration: 11,
      intrigue: 8,
      media: 10,
      policy: 11,
    },
    stances: [-1, 2, 0, 2, 0, 0],
    reputation: { public: 28, party_members: 40, colleagues: 45, media: 25, whips: 42 },
    loyalty: 63,
    influence: 39,
    towardsPlayer: rel(18, 14, 20),
    fromPlayer: rel(25, 30, 25),
    memories: [
      { turn: 1, text: 'Invited Rachel to the Shire & Suburbs group' },
      { turn: 3, text: 'Compared notes with Rachel on green-belt correspondence' },
    ],
    career: [
      { date: '2024-07-04', text: 'Elected MP for Marlow Heath by 912 votes' },
      { date: '2026-03-01', text: 'Convenor, Shire & Suburbs group' },
    ],
    keyRelationships: [{ id: 'pol_clarke', name: 'Imogen Clarke', kind: 'rival' }],
    intention: 'abstain',
    known: 'abstain',
  },
  {
    id: 'pol_bramley',
    name: 'Ken Bramley',
    party: 'party.npp',
    constituency: 'Stanton Moor',
    offices: ['Father of the House'],
    faction: null,
    age: 74,
    ideology: { economic: -35, social: -12 },
    traits: ['loyalist', 'respected'],
    ambition: null,
    skills: {
      oratory: 15,
      negotiation: 13,
      administration: 10,
      intrigue: 9,
      media: 11,
      policy: 12,
    },
    stances: [1, 0, 1, 0, 1, 0],
    reputation: { public: 52, party_members: 70, colleagues: 82, media: 50, whips: 76 },
    loyalty: 92,
    influence: 52,
    towardsPlayer: rel(8, 6, 10),
    fromPlayer: rel(25, 50, 20),
    memories: [],
    career: [
      { date: '1983-06-09', text: 'Elected MP for Stanton Moor' },
      { date: '2024-07-04', text: 'Became Father of the House' },
    ],
    keyRelationships: [{ id: 'pol_ashdown', name: 'Helen Ashdown', kind: 'ally' }],
    intention: 'aye',
    known: null,
  },
  {
    id: 'pol_kemp',
    name: 'Sarah Kemp',
    party: 'party.npp',
    constituency: 'Fenwick Cross',
    offices: [],
    faction: 'modernisers',
    age: 34,
    ideology: { economic: -15, social: -32 },
    traits: ['ambitious', 'schemer'],
    ambition: { label: 'Cabinet', intensity: 5 },
    skills: {
      oratory: 12,
      negotiation: 13,
      administration: 11,
      intrigue: 14,
      media: 13,
      policy: 10,
    },
    stances: [2, -1, 0, -1, 0, 0],
    reputation: { public: 18, party_members: 30, colleagues: 34, media: 28, whips: 52 },
    loyalty: 88,
    influence: 18,
    towardsPlayer: rel(-6, 12, -4, 0, 1),
    fromPlayer: rel(-5, 20, -5, 0, 1),
    memories: [{ turn: 2, text: 'Clocked Rachel as competition for the Housing PPS job' }],
    career: [{ date: '2029-08-30', text: 'Elected MP for Fenwick Cross' }],
    keyRelationships: [
      { id: 'pol_coyle', name: 'Martin Coyle', kind: 'patron' },
      { id: PLAYER_ID, name: 'Rachel Danby', kind: 'rival' },
    ],
    intention: 'aye',
    known: 'aye',
  },
  {
    id: 'pol_osei',
    name: 'Daniel Osei',
    party: 'party.npp',
    constituency: 'Southmere',
    offices: [],
    faction: null,
    age: 31,
    ideology: { economic: -48, social: -40 },
    traits: ['idealist', 'principled'],
    ambition: { label: 'Policy cause: social housing', intensity: 3 },
    skills: { oratory: 13, negotiation: 9, administration: 10, intrigue: 6, media: 11, policy: 12 },
    stances: [1, 0, 2, 0, 1, -1],
    reputation: { public: 14, party_members: 33, colleagues: 26, media: 16, whips: 40 },
    loyalty: 70,
    influence: 11,
    towardsPlayer: rel(22, 16, 24),
    fromPlayer: rel(20, 25, 25),
    memories: [{ turn: 1, text: 'Shared a desk with Rachel at the new-members induction' }],
    career: [{ date: '2029-08-30', text: 'Elected MP for Southmere' }],
    keyRelationships: [
      { id: 'pol_walsh', name: 'Bernadette Walsh', kind: 'patron' },
      { id: PLAYER_ID, name: 'Rachel Danby', kind: 'ally' },
    ],
    intention: 'no',
    known: 'unknown',
  },
  {
    id: 'pol_vane',
    name: 'Sir Richard Vane',
    party: 'party.con',
    constituency: 'Chilcote and Ware',
    offices: ['Leader of the Opposition'],
    faction: null,
    age: 58,
    ideology: { economic: 50, social: 35 },
    traits: ['ambitious', 'combative'],
    ambition: { label: 'Prime Minister', intensity: 5 },
    skills: {
      oratory: 17,
      negotiation: 11,
      administration: 12,
      intrigue: 13,
      media: 15,
      policy: 11,
    },
    stances: [-2, 2, -1, 2, -2, 1],
    reputation: { public: 38, party_members: 55, colleagues: 49, media: 52, whips: 60 },
    loyalty: 90,
    influence: 66,
    towardsPlayer: null,
    fromPlayer: null,
    memories: [],
    career: [
      { date: '2005-05-05', text: 'Elected MP for Chilcote and Ware' },
      { date: '2019-07-24', text: 'Home Secretary' },
      { date: '2029-09-01', text: 'Leader of the Opposition' },
    ],
    keyRelationships: [
      { id: 'pol_ashdown', name: 'Helen Ashdown', kind: 'rival' },
      { id: 'pol_clarke', name: 'Imogen Clarke', kind: 'ally' },
    ],
    intention: 'no',
    known: 'no',
  },
  {
    id: 'pol_clarke',
    name: 'Imogen Clarke',
    party: 'party.con',
    constituency: 'Winsford Hills',
    offices: ['Shadow Secretary of State for Housing'],
    faction: null,
    age: 46,
    ideology: { economic: 38, social: 20 },
    traits: ['schemer', 'networker'],
    ambition: { label: 'Shadow Cabinet promotion', intensity: 3 },
    skills: {
      oratory: 12,
      negotiation: 14,
      administration: 11,
      intrigue: 15,
      media: 13,
      policy: 12,
    },
    stances: [-2, 2, -1, 2, -1, 0],
    reputation: { public: 25, party_members: 45, colleagues: 40, media: 41, whips: 50 },
    loyalty: 84,
    influence: 41,
    towardsPlayer: rel(3, 5, 6),
    fromPlayer: rel(-10, 25, 0),
    memories: [{ turn: 3, text: 'Sent Rachel a friendly note about Wold Common' }],
    career: [
      { date: '2015-05-07', text: 'Elected MP for Winsford Hills' },
      { date: '2029-09-02', text: 'Shadow Housing Secretary' },
    ],
    keyRelationships: [
      { id: 'pol_vane', name: 'Sir Richard Vane', kind: 'patron' },
      { id: 'pol_fairley', name: 'Tom Fairley', kind: 'rival' },
    ],
    intention: 'no',
    known: 'no',
  },
  {
    id: 'pol_macrae',
    name: 'Fiona MacRae',
    party: 'party.lr',
    constituency: 'Inverlochy and Morar',
    offices: ['Leader of Liberal Reform'],
    faction: null,
    age: 52,
    ideology: { economic: 2, social: -48 },
    traits: ['cautious', 'principled'],
    ambition: { label: 'Concessions for her party', intensity: 3 },
    skills: {
      oratory: 13,
      negotiation: 15,
      administration: 12,
      intrigue: 10,
      media: 12,
      policy: 13,
    },
    stances: [0, 1, 1, 1, 0, -1],
    reputation: { public: 36, party_members: 62, colleagues: 55, media: 40, whips: 58 },
    loyalty: 85,
    influence: 37,
    towardsPlayer: null,
    fromPlayer: null,
    memories: [],
    career: [
      { date: '2010-05-06', text: 'Elected MP for Inverlochy and Morar' },
      { date: '2027-01-15', text: 'Elected leader of Liberal Reform' },
    ],
    keyRelationships: [{ id: 'pol_ashdown', name: 'Helen Ashdown', kind: 'ally' }],
    intention: 'abstain',
    known: 'abstain',
  },
];

/* ----------------------------------------------------------------------------
 * Generated backbenchers (stable via seeded PRNG)
 * ------------------------------------------------------------------------- */

interface GenSpec {
  name: string;
  constituency: string;
  party: string;
  faction: FactionKey | null;
  offices?: string[];
  status?: string;
}

const GENERATED: GenSpec[] = [
  // NPP Heartlands
  {
    name: 'Maureen Tighe',
    constituency: 'Salcombe Docks',
    party: 'party.npp',
    faction: 'heartlands',
  },
  {
    name: 'Jamal Okafor',
    constituency: 'Ravensworth Central',
    party: 'party.npp',
    faction: 'heartlands',
  },
  {
    name: 'Siobhan Grady',
    constituency: 'Ellerby North',
    party: 'party.npp',
    faction: 'heartlands',
  },
  {
    name: 'Owen Prothero',
    constituency: 'Llanfair Valley',
    party: 'party.npp',
    faction: 'heartlands',
  },
  {
    name: 'Colin Haskett',
    constituency: 'Brindley Moss',
    party: 'party.npp',
    faction: 'heartlands',
  },
  {
    name: 'Aisha Rahman',
    constituency: 'Hollins Cross',
    party: 'party.npp',
    faction: 'heartlands',
  },
  {
    name: 'Pete Mallory',
    constituency: 'Thornaby Fields',
    party: 'party.npp',
    faction: 'heartlands',
  },
  { name: 'Gwen Ellery', constituency: 'Ystrad Tawe', party: 'party.npp', faction: 'heartlands' },
  // NPP Shire & Suburbs
  { name: 'Harriet Lowe', constituency: 'Marlbury and Fenn', party: 'party.npp', faction: 'shire' },
  { name: 'Simon Pargeter', constituency: 'Kesworth Downs', party: 'party.npp', faction: 'shire' },
  { name: 'Claire Whitlock', constituency: 'Netherby Vale', party: 'party.npp', faction: 'shire' },
  { name: 'Rupert Ainsley', constituency: 'Chalcombe', party: 'party.npp', faction: 'shire' },
  {
    name: 'Nadia Brennan',
    constituency: 'Stowford and Hale',
    party: 'party.npp',
    faction: 'shire',
  },
  { name: 'James Corrigan', constituency: 'Upper Ashdale', party: 'party.npp', faction: 'shire' },
  // NPP Modernisers
  {
    name: 'Alex Fenwick',
    constituency: 'Harrowgate Quay',
    party: 'party.npp',
    faction: 'modernisers',
    offices: ['Solicitor General'],
  },
  {
    name: 'Kiran Bhatt',
    constituency: 'Westmarch',
    party: 'party.npp',
    faction: 'modernisers',
    offices: ['Secretary of State for Transport'],
  },
  {
    name: 'Eleanor Strand',
    constituency: 'Cheyne Reach',
    party: 'party.npp',
    faction: 'modernisers',
    offices: ['Parliamentary Under-Secretary for Communities'],
  },
  {
    name: 'Marcus Doyle',
    constituency: 'Lockford Central',
    party: 'party.npp',
    faction: 'modernisers',
  },
  { name: 'Hannah Ives', constituency: 'Bramfield', party: 'party.npp', faction: 'modernisers' },
  // NPP unaligned
  {
    name: 'Sir Alan Pettigrew',
    constituency: 'Ottery Mead',
    party: 'party.npp',
    faction: null,
    offices: ['Speaker of the House of Commons'],
    status: 'speaker',
  },
  { name: 'Beth Arundel', constituency: 'Witham Cross', party: 'party.npp', faction: null },
  { name: 'Ravi Chandra', constituency: 'Edgehill South', party: 'party.npp', faction: null },
  { name: 'Moira Kellett', constituency: 'Dunsby', party: 'party.npp', faction: null },
  { name: 'Frank Ogden', constituency: 'Rothwell Bridge', party: 'party.npp', faction: null },
  // Constitutional
  {
    name: 'Charles Wexford',
    constituency: 'Ambleford',
    party: 'party.con',
    faction: null,
    offices: ['Shadow Chancellor'],
  },
  { name: 'Annabel Pryor', constituency: 'Hexley and Coombe', party: 'party.con', faction: null },
  {
    name: 'Hugh Darnley',
    constituency: 'Sedgemoor Rise',
    party: 'party.con',
    faction: null,
    offices: ['Opposition Chief Whip'],
  },
  { name: 'Victoria Selby', constituency: 'Kingsmere', party: 'party.con', faction: null },
  { name: 'Nigel Ashcombe', constituency: 'Brackley Vale', party: 'party.con', faction: null },
  { name: 'Rosalind Hythe', constituency: 'Pevensham', party: 'party.con', faction: null },
  { name: 'George Tamberley', constituency: 'Oakhurst', party: 'party.con', faction: null },
  {
    name: 'Philippa Crane',
    constituency: 'Long Sutton and Fosse',
    party: 'party.con',
    faction: null,
  },
  { name: 'Edward Marsh', constituency: 'Thursby', party: 'party.con', faction: null },
  // Liberal Reform
  { name: 'Tobias Fell', constituency: 'Hartwell and Lyne', party: 'party.lr', faction: null },
  { name: 'Amira Haddad', constituency: 'Cambourne West', party: 'party.lr', faction: null },
  { name: 'Callum Rees', constituency: 'Aberwen', party: 'party.lr', faction: null },
  { name: 'Wendy Asquith', constituency: 'St Elwyn', party: 'party.lr', faction: null },
  // SCP
  {
    name: 'Iain Strachan',
    constituency: 'Glenmorrow and Strathcairn',
    party: 'party.scp',
    faction: null,
    offices: ['Leader of the SCP at Westminster'],
  },
  { name: 'Kirsty Munro', constituency: 'Dunmore West', party: 'party.scp', faction: null },
  { name: 'Euan Baird', constituency: 'Kilbarran', party: 'party.scp', faction: null },
  // Sovereignty
  {
    name: 'Derek Stannard',
    constituency: 'Fenmarsh',
    party: 'party.sov',
    faction: null,
    offices: ['Leader of the Sovereignty Party'],
  },
  { name: 'Lorraine Pike', constituency: 'Castle Oakley', party: 'party.sov', faction: null },
  // Green
  {
    name: 'Juno Hartley',
    constituency: 'Brighthelm Pavilion',
    party: 'party.grn',
    faction: null,
    offices: ['Green Coalition co-leader'],
  },
  // Independents & others
  { name: 'Sean Mulgrew', constituency: 'Lough Carran', party: 'party.ind', faction: null },
  { name: 'Patricia Doone', constituency: 'Wyre Forest Edge', party: 'party.ind', faction: null },
];

const GEN_TRAIT_POOL = [
  'loyalist',
  'cautious',
  'ambitious',
  'principled',
  'diligent',
  'local_champion',
  'networker',
  'idealist',
  'stubborn',
  'combative',
];
const AMBITIONS = [
  'Junior ministerial post',
  'Select committee chair',
  'A safe seat',
  'Cabinet',
  'Policy cause: green belt',
  'Policy cause: social housing',
];

export function idForName(name: string): string {
  return (
    'pol_' +
    name
      .toLowerCase()
      .replace(/^sir /, '')
      .replace(/[^a-z]+/g, '_')
      .replace(/^_|_$/g, '')
  );
}

/** Rebels on the Housing Delivery Bill second reading (turn 4). */
export const HDB_REBELS: { id: string; vote: Vote; reason: string }[] = [
  { id: 'pol_walsh', vote: 'no', reason: 'No social-housing quota' },
  { id: 'pol_osei', vote: 'no', reason: 'Followed Heartlands' },
  { id: 'pol_fairley', vote: 'abstain', reason: 'Green-belt concerns in Marlow Heath' },
  { id: idForName('Maureen Tighe'), vote: 'no', reason: 'No social-housing quota' },
  { id: idForName('Jamal Okafor'), vote: 'no', reason: 'Developer giveaway' },
  { id: idForName('Siobhan Grady'), vote: 'no', reason: 'No social-housing quota' },
  { id: idForName('Colin Haskett'), vote: 'no', reason: 'Loyal to Walsh' },
  { id: idForName('Aisha Rahman'), vote: 'no', reason: 'No social-housing quota' },
  { id: idForName('Pete Mallory'), vote: 'no', reason: 'Constituency pressure' },
  { id: idForName('Owen Prothero'), vote: 'abstain', reason: 'Wanted Welsh carve-out' },
  { id: idForName('Harriet Lowe'), vote: 'abstain', reason: 'Green-belt anger at home' },
  { id: idForName('Simon Pargeter'), vote: 'abstain', reason: 'Majority of 640' },
  { id: idForName('Nadia Brennan'), vote: 'abstain', reason: 'Local planning veto' },
  { id: idForName('James Corrigan'), vote: 'no', reason: 'Lobbied by Imogen Clarke' },
];

function generatedProfile(
  spec: GenSpec,
  index: number,
): { profile: PoliticianProfile; intention: Vote } {
  const r = prng(1000 + index * 7919);
  const between = (lo: number, hi: number) => Math.round(lo + r() * (hi - lo));
  const p = party(spec.party);
  const factionShift: Record<FactionKey, { economic: number; social: number }> = {
    modernisers: { economic: 12, social: -10 },
    heartlands: { economic: -25, social: 5 },
    shire: { economic: 15, social: 15 },
  };
  const shift = spec.faction ? factionShift[spec.faction] : { economic: 0, social: 0 };
  const ideology = {
    economic: Math.max(
      -100,
      Math.min(100, p.ideology.economic + shift.economic + between(-14, 14)),
    ),
    social: Math.max(-100, Math.min(100, p.ideology.social + shift.social + between(-14, 14))),
  };
  const t1 = GEN_TRAIT_POOL[between(0, GEN_TRAIT_POOL.length - 1)] ?? 'loyalist';
  let t2 = GEN_TRAIT_POOL[between(0, GEN_TRAIT_POOL.length - 1)] ?? 'cautious';
  if (t2 === t1) t2 = t1 === 'cautious' ? 'diligent' : 'cautious';
  const id = idForName(spec.name);
  const rebel = HDB_REBELS.find((x) => x.id === id);
  const isNpp = spec.party === 'party.npp';
  let intention: Vote;
  if (rebel) intention = rebel.vote;
  else if (isNpp || spec.party === 'party.ind')
    intention = isNpp ? 'aye' : r() < 0.5 ? 'aye' : 'no';
  else if (spec.party === 'party.lr' || spec.party === 'party.scp') intention = 'abstain';
  else intention = 'no';
  if (spec.status === 'speaker') intention = 'abstain';

  // The player knows a handful of intentions from the regional group and tea-room gossip.
  const knownIds = new Set([
    idForName('Harriet Lowe'),
    idForName('Maureen Tighe'),
    idForName('Beth Arundel'),
    idForName('Ravi Chandra'),
  ]);
  const known: KnownVote | null =
    spec.status === 'speaker' ? null : knownIds.has(id) ? intention : 'unknown';

  const shireOrHeart = spec.faction === 'heartlands' || spec.faction === 'shire';
  const met = isNpp && (shireOrHeart || index % 3 === 0);
  const towards = met
    ? rel(between(-5, 18), between(0, 15), between(-5, 20))
    : isNpp
      ? rel(0, between(0, 6), 0)
      : null;
  const age = between(29, 68);
  const elected = 2029 - between(0, 20);
  const stanceSign =
    spec.faction === 'heartlands'
      ? [0, 0, 2, 1, 2, 0]
      : spec.faction === 'shire'
        ? [-1, 2, 0, 2, 0, 0]
        : spec.faction === 'modernisers'
          ? [2, -1, 0, -1, 0, 0]
          : spec.party === 'party.con'
            ? [-2, 2, -1, 2, -2, 1]
            : [0, 1, 1, 1, 0, 0];

  const profile: PoliticianProfile = {
    id,
    name: spec.name,
    partyId: p.id,
    partyShort: p.shortName,
    partyColour: p.colour,
    constituencyName: spec.constituency,
    offices: spec.offices ?? [],
    factionId: spec.faction ? FACTIONS[spec.faction].id : null,
    factionName: spec.faction ? FACTIONS[spec.faction].name : null,
    status: spec.status ?? 'sitting',
    influence: (spec.offices?.length ?? 0) > 0 ? between(28, 45) : between(4, 24),
    isPlayer: false,
    relationshipToPlayer: towards,
    knownIntention: known,
    age,
    ideology,
    stances: ISSUES.map((issue, i) => ({
      ...issue,
      stance: Math.max(
        -2,
        Math.min(2, (stanceSign[i] ?? 0) + (r() < 0.2 ? (r() < 0.5 ? -1 : 1) : 0)),
      ),
    })),
    traits: traits(t1, t2),
    skills: {
      oratory: between(5, 16),
      negotiation: between(5, 16),
      administration: between(5, 16),
      intrigue: between(4, 15),
      media: between(4, 15),
      policy: between(5, 16),
    },
    ambition:
      r() < 0.75
        ? {
            label: AMBITIONS[between(0, AMBITIONS.length - 1)] ?? 'Cabinet',
            intensity: between(1, 5),
          }
        : null,
    reputation: {
      public: between(5, 40),
      party_members: between(15, 60),
      colleagues: between(15, 60),
      media: between(5, 40),
      whips: rebel ? between(10, 35) : between(30, 70),
    },
    partyLoyalty: rebel ? between(35, 60) : between(60, 95),
    relationship: {
      towardsPlayer: towards,
      fromPlayer: met ? rel(between(0, 20), between(10, 30), between(0, 20)) : null,
      memories:
        met && shireOrHeart
          ? [
              {
                turn: between(1, 3),
                text:
                  spec.faction === 'shire'
                    ? 'Sat with Rachel at the Shire & Suburbs group'
                    : 'Chatted with Rachel in the tea room about council housing',
              },
            ]
          : [],
    },
    career: [
      {
        date: `${elected}-${String(between(5, 7)).padStart(2, '0')}-0${between(1, 8)}`,
        text: `Elected MP for ${spec.constituency}`,
      },
      ...(spec.offices ?? []).map((o) => ({ date: '2029-08-31', text: `Appointed ${o}` })),
    ],
    keyRelationships:
      spec.faction === 'heartlands'
        ? [{ id: 'pol_walsh', name: 'Bernadette Walsh', kind: 'patron' as const }]
        : spec.faction === 'shire'
          ? [{ id: 'pol_fairley', name: 'Tom Fairley', kind: 'ally' as const }]
          : spec.faction === 'modernisers'
            ? [{ id: 'pol_coyle', name: 'Martin Coyle', kind: 'patron' as const }]
            : [],
  };
  return { profile, intention };
}

function castProfile(c: CastSpec, playerName: string): PoliticianProfile {
  const p = party(c.party);
  const fixName = (s: string) =>
    s
      .replace(/Rachel Danby/g, playerName)
      .replace(/Rachel/g, playerName.split(' ')[0] ?? playerName);
  return {
    id: c.id,
    name: c.name,
    partyId: p.id,
    partyShort: p.shortName,
    partyColour: p.colour,
    constituencyName: c.constituency,
    offices: c.offices,
    factionId: c.faction ? FACTIONS[c.faction].id : null,
    factionName: c.faction ? FACTIONS[c.faction].name : null,
    status: c.status ?? 'sitting',
    influence: c.influence,
    isPlayer: false,
    relationshipToPlayer: c.towardsPlayer,
    knownIntention: c.known,
    age: c.age,
    ideology: c.ideology,
    stances: stancesFrom(c.stances),
    traits: traits(...c.traits),
    skills: { ...c.skills },
    ambition: c.ambition,
    reputation: c.reputation,
    partyLoyalty: c.loyalty,
    relationship: {
      towardsPlayer: c.towardsPlayer,
      fromPlayer: c.fromPlayer,
      memories: c.memories.map((m) => ({ ...m, text: fixName(m.text) })),
    },
    career: c.career,
    keyRelationships: c.keyRelationships.map((k) =>
      k.id === PLAYER_ID ? { ...k, name: playerName } : k,
    ),
  };
}

/* ----------------------------------------------------------------------------
 * Player
 * ------------------------------------------------------------------------- */

export const DEFAULT_PLAYER: PlayerSetup = {
  firstName: 'Rachel',
  lastName: 'Danby',
  gender: 'female',
  strength: 'negotiation',
  ideologyPreset: 'moderniser',
};

const PRESET_IDEOLOGY: Record<PlayerSetup['ideologyPreset'], { economic: number; social: number }> =
  {
    moderniser: { economic: -16, social: -24 },
    heartlands: { economic: -50, social: -14 },
    independent: { economic: -8, social: 4 },
  };

const PRESET_FACTION: Record<PlayerSetup['ideologyPreset'], FactionKey | null> = {
  moderniser: 'shire',
  heartlands: 'heartlands',
  independent: null,
};

function playerProfile(setup: PlayerSetup): PoliticianProfile {
  const skills: Skills = {
    oratory: 11,
    negotiation: 10,
    administration: 10,
    intrigue: 9,
    media: 12,
    policy: 11,
  };
  skills[setup.strength] = 14;
  const npp = party('party.npp');
  const faction = PRESET_FACTION[setup.ideologyPreset];
  return {
    id: PLAYER_ID,
    name: `${setup.firstName} ${setup.lastName}`,
    partyId: npp.id,
    partyShort: npp.shortName,
    partyColour: npp.colour,
    constituencyName: 'Ashby and Wold',
    offices: [],
    factionId: faction ? FACTIONS[faction].id : null,
    factionName: faction ? FACTIONS[faction].name : null,
    status: 'sitting',
    influence: 14,
    isPlayer: true,
    relationshipToPlayer: null,
    knownIntention: null,
    age: 38,
    ideology: PRESET_IDEOLOGY[setup.ideologyPreset],
    stances: stancesFrom(
      setup.ideologyPreset === 'heartlands'
        ? [1, 1, 2, 0, 1, 0]
        : setup.ideologyPreset === 'independent'
          ? [0, 2, 0, 1, 0, 0]
          : [1, 1, 1, 0, 0, 0],
    ),
    traits: traits('diligent', 'local_champion'),
    skills,
    ambition: { label: 'Ministerial office', intensity: 4 },
    reputation: { public: 22, party_members: 31, colleagues: 18, media: 12, whips: 26 },
    partyLoyalty: 80,
    relationship: { towardsPlayer: null, fromPlayer: null, memories: [] },
    career: [{ date: '2029-08-30', text: 'Elected MP for Ashby and Wold by 1,840 votes' }],
    keyRelationships: [
      { id: 'pol_osei', name: 'Daniel Osei', kind: 'ally' },
      { id: 'pol_kemp', name: 'Sarah Kemp', kind: 'rival' },
    ],
  };
}

/* ----------------------------------------------------------------------------
 * Parliament
 * ------------------------------------------------------------------------- */

const WHIPPING_HDB: Bill['whipping'] = [
  { partyId: 'party.npp', shortName: 'NPP', instruction: 'Three-line whip', direction: 'aye' },
  { partyId: 'party.con', shortName: 'CON', instruction: 'Three-line whip', direction: 'no' },
  { partyId: 'party.lr', shortName: 'LR', instruction: 'Two-line whip', direction: 'abstain' },
  {
    partyId: 'party.scp',
    shortName: 'SCP',
    instruction: 'Free vote (England-only bill)',
    direction: null,
  },
  { partyId: 'party.sov', shortName: 'SOV', instruction: 'Whipped', direction: 'no' },
  { partyId: 'party.grn', shortName: 'GRN', instruction: 'Whipped', direction: 'no' },
];

function bills(): Bill[] {
  return [
    {
      id: HDB_ID,
      title: 'Housing Delivery Bill',
      summary:
        'Sets mandatory local housing targets that override local planning objections, with a national delivery body empowered to grant permission where councils fall behind.',
      sponsorId: 'pol_nair',
      sponsorName: 'Priya Nair',
      stage: 'First reading',
      issues: [
        { issueKey: 'issue.housing_targets', label: 'Housing targets', stance: 2 },
        { issueKey: 'issue.local_control', label: 'Local control', stance: -2 },
        { issueKey: 'issue.green_belt', label: 'Green-belt protection', stance: -1 },
        { issueKey: 'issue.social_housing', label: 'Social housing', stance: 0 },
      ],
      whipping: WHIPPING_HDB,
    },
    {
      id: 'bill_renters',
      title: "Renters' Security Bill",
      summary:
        'Ends no-fault evictions, caps in-tenancy rent rises at inflation and creates a national landlord register.',
      sponsorId: idForName('Eleanor Strand'),
      sponsorName: 'Eleanor Strand',
      stage: 'Committee stage',
      issues: [
        { issueKey: 'issue.social_housing', label: 'Social housing', stance: 1 },
        { issueKey: 'issue.local_control', label: 'Local control', stance: 0 },
      ],
      whipping: [
        { partyId: 'party.npp', shortName: 'NPP', instruction: 'Two-line whip', direction: 'aye' },
        { partyId: 'party.con', shortName: 'CON', instruction: 'Two-line whip', direction: 'no' },
        { partyId: 'party.lr', shortName: 'LR', instruction: 'Two-line whip', direction: 'aye' },
      ],
    },
    {
      id: 'bill_supply',
      title: 'Supply and Appropriation (Anticipation) Bill',
      summary: 'Authorises interim departmental spending until the Main Estimates are approved.',
      sponsorId: 'pol_coyle',
      sponsorName: 'Martin Coyle',
      stage: 'Royal Assent',
      issues: [{ issueKey: 'issue.public_spending', label: 'Public spending', stance: 1 }],
      whipping: [
        {
          partyId: 'party.npp',
          shortName: 'NPP',
          instruction: 'Three-line whip',
          direction: 'aye',
        },
        { partyId: 'party.con', shortName: 'CON', instruction: 'One-line whip', direction: 'no' },
      ],
    },
  ];
}

function byParty(rows: [string, number, number, number][]): DivisionResult['byParty'] {
  return rows.map(([id, ayes, noes, abstentions]) => {
    const p = party(id);
    return { partyId: p.id, shortName: p.shortName, colour: p.colour, ayes, noes, abstentions };
  });
}

export const supplyDivisionFixture: DivisionResult = {
  id: 'div_supply_2r',
  billId: 'bill_supply',
  billTitle: 'Supply and Appropriation (Anticipation) Bill',
  stage: 'Second reading',
  heldOn: '2029-09-11',
  ayes: 352,
  noes: 184,
  abstentions: 113,
  passed: true,
  governmentWon: true,
  playerVote: 'aye',
  byParty: byParty([
    ['party.npp', 350, 0, 11],
    ['party.con', 0, 168, 0],
    ['party.lr', 0, 0, 58],
    ['party.scp', 0, 0, 32],
    ['party.sov', 0, 12, 0],
    ['party.grn', 0, 0, 6],
    ['party.ind', 2, 4, 6],
  ]),
  rebels: [],
};

export const rentersDivisionFixture: DivisionResult = {
  id: 'div_renters_2r',
  billId: 'bill_renters',
  billTitle: "Renters' Security Bill",
  stage: 'Second reading',
  heldOn: '2029-09-13',
  ayes: 401,
  noes: 172,
  abstentions: 76,
  passed: true,
  governmentWon: true,
  playerVote: 'aye',
  byParty: byParty([
    ['party.npp', 355, 0, 6],
    ['party.con', 0, 160, 8],
    ['party.lr', 40, 0, 18],
    ['party.scp', 0, 0, 32],
    ['party.sov', 0, 12, 0],
    ['party.grn', 6, 0, 0],
    ['party.ind', 0, 0, 12],
  ]),
  rebels: [
    {
      id: idForName('Edward Marsh'),
      name: 'Edward Marsh',
      partyShort: 'CON',
      vote: 'abstain',
      reason: 'Declared landlord interest',
    },
  ],
};

export function hdbSecondReadingForecast(): DivisionForecast {
  return {
    id: HDB_2R_DIVISION_ID,
    billId: HDB_ID,
    billTitle: 'Housing Delivery Bill',
    stage: 'Second reading',
    scheduledFor: '2029-09-26',
    forecast: { ayes: 318, noes: 214, abstain: 71, unknown: 46 },
    waverers: [
      { id: 'pol_walsh', name: 'Bernadette Walsh', partyShort: 'NPP', known: 'no' },
      { id: 'pol_fairley', name: 'Tom Fairley', partyShort: 'NPP', known: 'abstain' },
      { id: 'pol_osei', name: 'Daniel Osei', partyShort: 'NPP', known: 'unknown' },
      { id: idForName('Maureen Tighe'), name: 'Maureen Tighe', partyShort: 'NPP', known: 'no' },
      { id: idForName('Harriet Lowe'), name: 'Harriet Lowe', partyShort: 'NPP', known: 'abstain' },
      {
        id: idForName('Simon Pargeter'),
        name: 'Simon Pargeter',
        partyShort: 'NPP',
        known: 'unknown',
      },
      { id: idForName('Jamal Okafor'), name: 'Jamal Okafor', partyShort: 'NPP', known: 'unknown' },
      {
        id: idForName('Claire Whitlock'),
        name: 'Claire Whitlock',
        partyShort: 'NPP',
        known: 'unknown',
      },
      { id: idForName('Beth Arundel'), name: 'Beth Arundel', partyShort: 'NPP', known: 'aye' },
    ],
    playerIntendedVote: 'aye',
  };
}

export function hdbThirdReadingForecast(): DivisionForecast {
  return {
    id: HDB_3R_DIVISION_ID,
    billId: HDB_ID,
    billTitle: 'Housing Delivery Bill',
    stage: 'Report stage and third reading',
    scheduledFor: '2029-11-07',
    forecast: { ayes: 301, noes: 205, abstain: 60, unknown: 83 },
    waverers: [
      { id: 'pol_walsh', name: 'Bernadette Walsh', partyShort: 'NPP', known: 'no' },
      { id: 'pol_fairley', name: 'Tom Fairley', partyShort: 'NPP', known: 'unknown' },
    ],
    playerIntendedVote: 'aye',
  };
}

function parliament(): ParliamentView {
  return {
    session: { number: 1, openedOn: '2029-09-03' },
    composition: PARTIES.map((p) => ({
      partyId: p.id,
      name: p.name,
      shortName: p.shortName,
      colour: p.colour,
      seats: p.seats,
      inGovernment: p.inGovernment,
    })),
    totalSeats: 650,
    governmentMajority: 74,
    bills: bills(),
    upcomingDivisions: [hdbSecondReadingForecast()],
    recentDivisions: [rentersDivisionFixture, supplyDivisionFixture],
  };
}

/** The HDB second-reading result: 356–216, 14 government rebels. Used in the turn-4 report. */
export function hdbSecondReadingResult(playerVote: Vote, playerName: string): DivisionResult {
  const rebels: DivisionResult['rebels'] = HDB_REBELS.map((r) => {
    const name =
      CAST.find((c) => c.id === r.id)?.name ??
      GENERATED.find((g) => idForName(g.name) === r.id)?.name ??
      r.id;
    return { id: r.id, name, partyShort: 'NPP', vote: r.vote, reason: r.reason };
  });
  let npp: [string, number, number, number] = ['party.npp', 347, 9, 5];
  if (playerVote !== 'aye') {
    rebels.unshift({
      id: PLAYER_ID,
      name: playerName,
      partyShort: 'NPP',
      vote: playerVote,
      reason: 'Declared rebellion',
    });
    npp = ['party.npp', 346, playerVote === 'no' ? 10 : 9, playerVote === 'abstain' ? 6 : 5];
  }
  const rows: [string, number, number, number][] = [
    npp,
    ['party.con', 0, 168, 0],
    ['party.lr', 6, 14, 38],
    ['party.scp', 0, 2, 30],
    ['party.sov', 0, 12, 0],
    ['party.grn', 0, 6, 0],
    ['party.ind', 3, 5, 4],
  ];
  const ayes = rows.reduce((s, r) => s + r[1], 0);
  const noes = rows.reduce((s, r) => s + r[2], 0);
  const abstentions = rows.reduce((s, r) => s + r[3], 0);
  return {
    id: HDB_2R_DIVISION_ID,
    billId: HDB_ID,
    billTitle: 'Housing Delivery Bill',
    stage: 'Second reading',
    heldOn: '2029-09-26',
    ayes,
    noes,
    abstentions,
    passed: ayes > noes,
    governmentWon: ayes > noes,
    playerVote,
    byParty: byParty(rows),
    rebels,
  };
}

/* ----------------------------------------------------------------------------
 * Party
 * ------------------------------------------------------------------------- */

function partyView(playerFaction: string | null): PartyView {
  const npp = party('party.npp');
  return {
    id: npp.id,
    name: npp.name,
    shortName: npp.shortName,
    colour: npp.colour,
    ideology: npp.ideology,
    inGovernment: true,
    seats: npp.seats,
    pollShare: 38.5,
    unity: 64,
    whipStrength: 4,
    leader: { id: 'pol_ashdown', name: 'Helen Ashdown' },
    chiefWhip: { id: 'pol_pryce', name: 'Gareth Pryce' },
    governmentStability: 72,
    factions: [
      {
        id: FACTIONS.modernisers.id,
        name: FACTIONS.modernisers.name,
        leader: { id: 'pol_coyle', name: 'Martin Coyle' },
        memberCount: 92,
        cohesion: 71,
        ideology: { economic: -18, social: -32 },
        demands: [
          'Pass the Housing Delivery Bill unamended',
          'Fiscal credibility at the autumn Budget',
        ],
        playerIsMember: playerFaction === FACTIONS.modernisers.name,
        leaderTrustInPlayer: 2,
      },
      {
        id: FACTIONS.heartlands.id,
        name: FACTIONS.heartlands.name,
        leader: { id: 'pol_walsh', name: 'Bernadette Walsh' },
        memberCount: 71,
        cohesion: 78,
        ideology: { economic: -58, social: -16 },
        demands: [
          'A social-housing quota in the Housing Delivery Bill',
          'No real-terms cuts to council budgets',
        ],
        playerIsMember: playerFaction === FACTIONS.heartlands.name,
        leaderTrustInPlayer: 4,
      },
      {
        id: FACTIONS.shire.id,
        name: FACTIONS.shire.name,
        leader: { id: 'pol_fairley', name: 'Tom Fairley' },
        memberCount: 72,
        cohesion: 54,
        ideology: { economic: -10, social: -4 },
        demands: [
          'Green-belt protections written into the bill',
          'A local veto on developments over 500 homes',
        ],
        playerIsMember: playerFaction === FACTIONS.shire.name,
        leaderTrustInPlayer: 18,
      },
    ],
    powerMap: [
      { id: 'pol_ashdown', name: 'Helen Ashdown', influence: 92, offices: ['Prime Minister'] },
      {
        id: 'pol_coyle',
        name: 'Martin Coyle',
        influence: 81,
        offices: ['Chancellor of the Exchequer'],
      },
      {
        id: 'pol_nair',
        name: 'Priya Nair',
        influence: 74,
        offices: ['Secretary of State for Housing'],
      },
      { id: 'pol_pryce', name: 'Gareth Pryce', influence: 70, offices: ['Chief Whip'] },
      { id: 'pol_walsh', name: 'Bernadette Walsh', influence: 58, offices: [] },
      { id: 'pol_bramley', name: 'Ken Bramley', influence: 52, offices: ['Father of the House'] },
      {
        id: 'pol_hargreaves',
        name: 'Lucy Hargreaves',
        influence: 44,
        offices: ['Deputy Chief Whip'],
      },
      { id: 'pol_fairley', name: 'Tom Fairley', influence: 39, offices: [] },
      {
        id: idForName('Kiran Bhatt'),
        name: 'Kiran Bhatt',
        influence: 36,
        offices: ['Secretary of State for Transport'],
      },
      { id: 'pol_kemp', name: 'Sarah Kemp', influence: 18, offices: [] },
    ],
  };
}

/* ----------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------- */

type HistorySpec = [
  number,
  string,
  HistoryItem['type'],
  number,
  string,
  string,
  string[],
  string[],
];

function historySpecs(playerName: string): HistorySpec[] {
  const first = playerName.split(' ')[0] ?? playerName;
  return [
    [
      0,
      '2029-08-30',
      'election',
      5,
      'NPP wins a 74-seat majority',
      'Helen Ashdown leads the National Progressive Party back to power with 362 seats.',
      ['pol_ashdown'],
      [],
    ],
    [
      0,
      '2029-08-30',
      'election',
      4,
      `${playerName} elected for Ashby and Wold`,
      `${first} takes the marginal suburban seat from the Constitutional Party by 1,840 votes.`,
      [PLAYER_ID],
      [],
    ],
    [
      0,
      '2029-08-31',
      'appointment',
      4,
      'Martin Coyle appointed Chancellor',
      'The Modernisers leader takes the Treasury.',
      ['pol_ashdown'],
      ['pol_coyle'],
    ],
    [
      0,
      '2029-08-31',
      'appointment',
      4,
      'Priya Nair appointed Housing Secretary',
      'Nair is handed the flagship housing brief.',
      ['pol_ashdown'],
      ['pol_nair'],
    ],
    [
      0,
      '2029-08-31',
      'appointment',
      3,
      'Gareth Pryce returns as Chief Whip',
      'Pryce keeps the job he held in opposition.',
      ['pol_ashdown'],
      ['pol_pryce'],
    ],
    [
      0,
      '2029-09-01',
      'leadership_contest',
      3,
      'Sir Richard Vane confirmed as Leader of the Opposition',
      'The Constitutional Party rallies behind Vane after defeat.',
      ['pol_vane'],
      [],
    ],
    [
      1,
      '2029-09-03',
      'event',
      3,
      'Parliament returns',
      'MPs are sworn in. The King’s Speech promises "homes for a generation".',
      [],
      [],
    ],
    [
      1,
      '2029-09-03',
      'policy_announcement',
      5,
      'Housing Delivery Bill announced',
      'Mandatory local housing targets will override planning objections.',
      ['pol_nair'],
      [HDB_ID],
    ],
    [
      1,
      '2029-09-04',
      'relationship_change',
      2,
      `${first} meets Daniel Osei at induction`,
      'Two new members find common ground over council housing.',
      [PLAYER_ID],
      ['pol_osei'],
    ],
    [
      1,
      '2029-09-04',
      'negotiation',
      2,
      'Tom Fairley convenes Shire & Suburbs',
      `Twelve marginal-seat MPs, including ${playerName}, meet over sandwiches.`,
      ['pol_fairley'],
      [PLAYER_ID],
    ],
    [
      1,
      '2029-09-05',
      'division',
      3,
      'Housing Delivery Bill: first reading',
      'The bill is formally presented to the House.',
      ['pol_nair'],
      [HDB_ID],
    ],
    [
      1,
      '2029-09-05',
      'campaign',
      2,
      'Wold Common action group formed',
      'Residents in Ashby and Wold organise against the bill.',
      [],
      [PLAYER_ID],
    ],
    [
      1,
      '2029-09-06',
      'relationship_change',
      2,
      'Sarah Kemp courts the Chancellor',
      'Kemp is seen at a Treasury reception, twice.',
      ['pol_kemp'],
      ['pol_coyle'],
    ],
    [
      1,
      '2029-09-06',
      'action_outcome',
      2,
      `${first} meets the Chief Whip`,
      'Pryce notes a "sound" new member.',
      [PLAYER_ID],
      ['pol_pryce'],
    ],
    [
      1,
      '2029-09-07',
      'event',
      1,
      'Constituency surgery in Ashby',
      'Forty residents attend. Half mention the green belt.',
      [PLAYER_ID],
      [],
    ],
    [
      2,
      '2029-09-10',
      'negotiation',
      3,
      'Walsh sets out Heartlands terms',
      'A social-housing quota or Heartlands votes against.',
      ['pol_walsh'],
      [HDB_ID],
    ],
    [
      2,
      '2029-09-10',
      'relationship_change',
      2,
      'Coyle lunches with Walsh',
      'The Chancellor is said to be "keeping channels open".',
      ['pol_coyle'],
      ['pol_walsh'],
    ],
    [
      2,
      '2029-09-11',
      'division',
      3,
      'Supply bill passes 352–184',
      'Routine spending authority clears second reading.',
      [],
      ['bill_supply'],
    ],
    [
      2,
      '2029-09-11',
      'action_outcome',
      2,
      `${first} asks a question at Housing questions`,
      'Nair thanks the Member for Ashby and Wold for her "constructive" question.',
      [PLAYER_ID],
      ['pol_nair'],
    ],
    [
      2,
      '2029-09-12',
      'policy_announcement',
      3,
      'Nair: "300,000 homes a year, no excuses"',
      'The Housing Secretary doubles down in a Sunday interview.',
      ['pol_nair'],
      [HDB_ID],
    ],
    [
      2,
      '2029-09-12',
      'scandal',
      2,
      'Shadow minister’s second-home row',
      'Victoria Selby faces questions over a holiday let.',
      [],
      [idForName('Victoria Selby')],
    ],
    [
      2,
      '2029-09-13',
      'division',
      3,
      "Renters' Security Bill passes 401–172",
      'Liberal Reform backs the government. One Constitutional abstention.',
      [],
      ['bill_renters'],
    ],
    [
      2,
      '2029-09-13',
      'relationship_change',
      2,
      'Heartlands recruits Daniel Osei',
      'Walsh takes the new member under her wing.',
      ['pol_walsh'],
      ['pol_osei'],
    ],
    [
      2,
      '2029-09-14',
      'promise',
      2,
      'Kemp pledges loyalty on housing',
      'Sarah Kemp tells the whips she will "be there on the night".',
      ['pol_kemp'],
      ['pol_pryce'],
    ],
    [
      2,
      '2029-09-14',
      'negotiation',
      2,
      'Clarke works the shires',
      'The shadow housing secretary writes to every suburban NPP MP.',
      ['pol_clarke'],
      [],
    ],
    [
      2,
      '2029-09-14',
      'campaign',
      3,
      'Wold Common petition reaches 4,000',
      `Constituents urge ${first} to oppose the bill.`,
      [],
      [PLAYER_ID],
    ],
    [
      3,
      '2029-09-17',
      'negotiation',
      4,
      'Whips begin counting heads',
      'Hargreaves starts one-to-ones with suburban members.',
      ['pol_hargreaves'],
      [],
    ],
    [
      3,
      '2029-09-17',
      'relationship_change',
      2,
      'Fairley and Clarke clash in the tea room',
      'Words exchanged over green-belt leaflets.',
      ['pol_fairley'],
      ['pol_clarke'],
    ],
    [
      3,
      '2029-09-17',
      'event',
      3,
      'Whips’ Office summons',
      `${first} is asked to drop by the Whips’ Office.`,
      ['pol_hargreaves'],
      [PLAYER_ID],
    ],
    [
      3,
      '2029-09-17',
      'campaign',
      3,
      'Protest planned at Wold Common',
      'Organisers invite the local MP to speak.',
      [],
      [PLAYER_ID],
    ],
    [
      3,
      '2029-09-17',
      'policy_announcement',
      2,
      'MacRae hints at abstention',
      'Liberal Reform wants "something for councils" before it decides.',
      ['pol_macrae'],
      [HDB_ID],
    ],
    [
      3,
      '2029-09-17',
      'relationship_change',
      1,
      'Bramley hosts new intake drinks',
      'The Father of the House offers advice on "picking your fights".',
      ['pol_bramley'],
      [],
    ],
  ];
}

function buildHistory(playerName: string, maxTurn: number): HistoryItem[] {
  const specs = historySpecs(playerName).filter((s) => s[0] <= maxTurn);
  // Pad with generated colleague-level chatter so the timeline is dense (~45 items for turn 3).
  const extra: HistorySpec[] = [];
  const pairs: [string, string][] = [
    ['Maureen Tighe', 'Jamal Okafor'],
    ['Harriet Lowe', 'Simon Pargeter'],
    ['Alex Fenwick', 'Hannah Ives'],
    ['Charles Wexford', 'Annabel Pryor'],
    ['Claire Whitlock', 'Nadia Brennan'],
    ['Aisha Rahman', 'Siobhan Grady'],
    ['Kiran Bhatt', 'Marcus Doyle'],
    ['Iain Strachan', 'Kirsty Munro'],
    ['Rupert Ainsley', 'James Corrigan'],
    ['Pete Mallory', 'Colin Haskett'],
    ['Beth Arundel', 'Ravi Chandra'],
    ['Tobias Fell', 'Amira Haddad'],
    ['Owen Prothero', 'Gwen Ellery'],
  ];
  pairs.forEach(([a, b], i) => {
    const turn = 1 + (i % 3);
    if (turn > maxTurn) return;
    const date = addDays(turnStart(turn), (i % 4) + 1);
    extra.push([
      turn,
      date,
      i % 2 === 0 ? 'relationship_change' : 'negotiation',
      1,
      `${a} and ${b} compare notes`,
      i % 2 === 0 ? 'A tea-room alliance forms.' : 'Talk turns to the housing bill.',
      [idForName(a)],
      [idForName(b)],
    ]);
  });
  const all = [...specs, ...extra].sort((x, y) => (x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  return all.map(([turn, simDate, type, importance, title, summary, actorIds, subjectIds], i) => ({
    seq: i + 1,
    turn,
    simDate,
    type,
    importance,
    title,
    summary,
    actorIds,
    subjectIds,
  }));
}

/* ----------------------------------------------------------------------------
 * Career overview pieces
 * ------------------------------------------------------------------------- */

export function whipsSummonsEvent(raisedOnTurn: number): PendingEvent {
  return {
    id: 'evt_whips_summons',
    title: 'The Whips’ Office wants a word',
    body: 'Lucy Hargreaves has asked you to drop by before Thursday. Word is your name is on a list of colleagues "still thinking" about the Housing Delivery Bill.',
    raisedOnTurn,
    options: [
      {
        key: 'reassure',
        label: 'Reassure them',
        description: 'Tell Hargreaves you will be in the Aye lobby. The whips will remember it.',
        capitalCost: 0,
      },
      {
        key: 'non_committal',
        label: 'Stay non-committal',
        description: 'Say you are listening to constituents. Nothing changes, for now.',
        capitalCost: 0,
      },
      {
        key: 'warn',
        label: 'Warn them about the shires',
        description:
          'Tell them Ashby and Wold won’t wear it. The whips will cool on you; Heartlands will hear.',
        capitalCost: 0,
      },
    ],
  };
}

export function greenBeltProtestEvent(raisedOnTurn: number): PendingEvent {
  return {
    id: 'evt_green_belt_protest',
    title: 'Protest at Wold Common',
    body: 'The Wold Common action group is holding a rally on Saturday against the Housing Delivery Bill. They have invited you to speak. The local paper will be there.',
    raisedOnTurn,
    options: [
      {
        key: 'join',
        label: 'Join the protest',
        description: 'Speak at the rally. Local reputation up; the whips will not be pleased.',
        capitalCost: 1,
      },
      {
        key: 'meet_organisers',
        label: 'Meet the organisers privately',
        description: 'A quieter conversation. Costs a diary slot next week.',
        capitalCost: 0,
      },
      {
        key: 'back_bill',
        label: 'Back the bill publicly',
        description: 'Explain why the country needs the homes. Expect angry letters.',
        capitalCost: 0,
      },
    ],
  };
}

export function lobbyJournalistEvent(raisedOnTurn: number): PendingEvent {
  return {
    id: 'evt_lobby_call',
    title: 'A lobby journalist calls',
    body: 'The political editor of the Evening Courier wants a quote on the housing rebellion. "Off the record, of course."',
    raisedOnTurn,
    options: [
      {
        key: 'on_record',
        label: 'Give an on-record line',
        description: 'Loyal and dull. Media reputation steady.',
        capitalCost: 0,
      },
      {
        key: 'off_record',
        label: 'Brief off the record',
        description: 'Media reputation up. A risk that your intentions leak.',
        capitalCost: 0,
      },
      {
        key: 'decline',
        label: 'Decline to comment',
        description: 'Nothing gained, nothing lost.',
        capitalCost: 0,
      },
    ],
  };
}

function briefingTurn3(): Headline[] {
  return [
    {
      text: 'Walsh draws a line: no social housing, no second reading',
      standfirst:
        'Heartlands leader tells colleagues she will vote against the Housing Delivery Bill unless the government guarantees a social-housing quota.',
      importance: 5,
    },
    {
      text: 'Whips start counting heads in the shires',
      standfirst:
        'Lucy Hargreaves begins one-to-ones with suburban members ahead of the three-line whip.',
      importance: 4,
    },
    {
      text: 'Nair: 300,000 homes a year, "and no excuses"',
      standfirst: 'The Housing Secretary refuses to soften the targets.',
      importance: 3,
    },
    { text: 'Kemp seen leaving the Chief Whip’s office, twice', importance: 2 },
    { text: 'Vane: "This bill concretes over Middle England"', importance: 2 },
  ];
}

function briefingTurn1(): Headline[] {
  return [
    {
      text: 'Homes for a generation: Ashdown’s first King’s Speech',
      standfirst:
        'The new government puts the Housing Delivery Bill at the heart of its programme.',
      importance: 5,
    },
    {
      text: 'New intake arrives, and the whips are watching',
      standfirst: 'More than 140 first-time MPs take their seats.',
      importance: 3,
    },
    { text: 'Vane confirmed as Leader of the Opposition', importance: 2 },
  ];
}

function notificationsTurn3(): Notification[] {
  return [
    {
      id: 'ntf_1',
      turn: 1,
      severity: 'info',
      title: 'Welcome to Westminster',
      body: 'You have 5 diary slots each week and 3 political capital. Plan your week, then end it.',
    },
    {
      id: 'ntf_2',
      turn: 2,
      severity: 'good',
      title: 'Nair noticed your question',
      body: 'The Housing Secretary thanked you for a constructive question.',
      link: { kind: 'politician', id: 'pol_nair' },
    },
    {
      id: 'ntf_3',
      turn: 2,
      severity: 'warning',
      title: 'Petition against the bill',
      body: '4,000 constituents have signed the Wold Common petition.',
      link: { kind: 'bill', id: HDB_ID },
    },
    {
      id: 'ntf_4',
      turn: 3,
      severity: 'warning',
      title: 'Summoned by the whips',
      body: 'Lucy Hargreaves wants a word before Thursday.',
      link: { kind: 'event', id: 'evt_whips_summons' },
    },
    {
      id: 'ntf_5',
      turn: 3,
      severity: 'info',
      title: 'Second reading on 26 September',
      body: 'The Housing Delivery Bill is three-line whipped. Every vote counts.',
      link: { kind: 'division', id: HDB_2R_DIVISION_ID },
    },
    {
      id: 'ntf_6',
      turn: 3,
      severity: 'critical',
      title: 'Sarah Kemp is after the Housing PPS',
      body: 'Kemp has been seeking endorsements from senior colleagues.',
      link: { kind: 'politician', id: 'pol_kemp' },
    },
  ];
}

function intelligenceTurn3(): CareerOverview['intelligence'] {
  return [
    {
      turn: 3,
      text: 'Bernadette Walsh is recruiting new members to vote against second reading.',
      politicianId: 'pol_walsh',
    },
    {
      turn: 3,
      text: 'Imogen Clarke has written to every suburban NPP MP about green-belt loss.',
      politicianId: 'pol_clarke',
    },
    {
      turn: 3,
      text: 'Tom Fairley says he will abstain unless green-belt protections are added.',
      politicianId: 'pol_fairley',
    },
    {
      turn: 2,
      text: 'Martin Coyle lunched with Walsh. The Treasury is hedging.',
      politicianId: 'pol_coyle',
    },
    { turn: 2, text: 'Sarah Kemp asked Ken Bramley for an endorsement.', politicianId: 'pol_kemp' },
    {
      turn: 2,
      text: 'Harriet Lowe will abstain: her majority is 640.',
      politicianId: idForName('Harriet Lowe'),
    },
  ];
}

export function upcomingFor(
  simDate: string,
  hdbDivisionPending: boolean,
): CareerOverview['upcoming'] {
  const all: CareerOverview['upcoming'] = [
    {
      date: '2029-09-05',
      label: 'Housing Delivery Bill: first reading',
      kind: 'reading',
      refId: HDB_ID,
    },
    { date: '2029-09-19', label: 'Prime Minister’s Questions', kind: 'other' },
    { date: '2029-09-20', label: 'Shire & Suburbs group meeting', kind: 'event' },
    {
      date: '2029-09-22',
      label: 'Wold Common rally',
      kind: 'event',
      refId: 'evt_green_belt_protest',
    },
    {
      date: '2029-09-26',
      label: 'Housing Delivery Bill: second reading (three-line whip)',
      kind: 'division',
      refId: HDB_2R_DIVISION_ID,
    },
    {
      date: '2029-10-03',
      label: 'Renters’ Security Bill: committee stage',
      kind: 'reading',
      refId: 'bill_renters',
    },
    { date: '2029-10-17', label: 'Autumn Budget statement', kind: 'other' },
    {
      date: '2029-11-07',
      label: 'Housing Delivery Bill: report stage and third reading',
      kind: 'division',
      refId: HDB_3R_DIVISION_ID,
    },
  ];
  return all.filter(
    (u) => u.date >= simDate && (hdbDivisionPending || u.refId !== HDB_2R_DIVISION_ID),
  );
}

/* ----------------------------------------------------------------------------
 * World builder
 * ------------------------------------------------------------------------- */

export interface BuildWorldOptions {
  id: string;
  name: string;
  player?: PlayerSetup;
  /** Fresh campaign at turn 1 (created via POST /campaigns) instead of the seeded turn-3 save. */
  fresh?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export function buildWorld(opts: BuildWorldOptions): MockWorld {
  const setup = opts.player ?? DEFAULT_PLAYER;
  const playerName = `${setup.firstName} ${setup.lastName}`;
  const fresh = opts.fresh ?? false;
  const turn = fresh ? 1 : 3;
  const simDate = turnStart(turn);

  const me = playerProfile(setup);
  const cast = CAST.map((c) => castProfile(c, playerName));
  const gen = GENERATED.map((g, i) => generatedProfile(g, i));
  const politicians = [me, ...cast, ...gen.map((g) => g.profile)];
  const hiddenIntentions: Record<string, Vote> = {};
  CAST.forEach((c) => (hiddenIntentions[c.id] = c.intention));
  gen.forEach((g) => (hiddenIntentions[g.profile.id] = g.intention));

  if (fresh) {
    // New intake: barely anyone knows you yet.
    for (const p of politicians) {
      if (p.isPlayer) continue;
      if (p.id !== 'pol_osei' && p.id !== 'pol_fairley') {
        if (p.relationshipToPlayer) {
          p.relationshipToPlayer = rel(0, 3, 0);
          p.relationship.towardsPlayer = p.relationshipToPlayer;
        }
        p.relationship.memories = [];
      }
      if (p.knownIntention !== null && p.id !== 'pol_walsh' && !p.offices.length)
        p.knownIntention = 'unknown';
    }
  }

  const parl = parliament();
  const history = buildHistory(playerName, turn);

  const summary: CampaignSummary = {
    id: opts.id,
    name: opts.name,
    scenarioKey: 'first_weeks',
    status: 'active',
    simDate,
    turn,
    revision: fresh ? 1 : 12,
    playerName,
    simulationVersion: SIMULATION_VERSION,
    createdAt: opts.createdAt ?? '2026-10-20T19:42:11.000Z',
    updatedAt: opts.updatedAt ?? '2026-10-23T21:05:37.000Z',
  };

  const overview: MockWorld['overview'] = {
    player: {
      id: me.id,
      name: me.name,
      partyId: me.partyId ?? 'party.npp',
      partyName: 'National Progressive Party',
      partyColour: me.partyColour ?? '#C8322B',
      constituencyName: 'Ashby and Wold',
      majority: 1840,
      offices: [],
      factionName: me.factionName,
      skills: { ...me.skills },
      traits: me.traits,
      ideology: me.ideology,
    },
    standing: {
      politicalCapital: 3,
      capitalIncome: 1,
      influence: {
        total: 14,
        breakdown: [
          { label: 'Office', value: 0 },
          { label: 'Relationships', value: 6 },
          { label: 'Reputation', value: 5 },
          { label: 'Faction standing', value: 3 },
        ],
      },
      reputation: { ...me.reputation },
      partyLoyalty: 80,
      endorsements: [],
    },
    diary: fresh
      ? { slotsTotal: 5, slotsUsed: 0, planned: [] }
      : {
          slotsTotal: 5,
          slotsUsed: 1,
          planned: [
            {
              id: 'pa_1',
              kind: 'meet_politician',
              label: 'Meet Daniel Osei',
              slots: 1,
              capitalCost: 0,
              params: { targetId: 'pol_osei' },
            },
          ],
        },
    pendingEvents: fresh ? [] : [whipsSummonsEvent(3), greenBeltProtestEvent(3)],
    notifications: fresh ? notificationsTurn3().filter((n) => n.turn === 1) : notificationsTurn3(),
    briefing: { turn, headlines: fresh ? briefingTurn1() : briefingTurn3() },
    upcoming: upcomingFor(simDate, true),
    intelligence: fresh
      ? [
          {
            turn: 1,
            text: 'Bernadette Walsh has called the Housing Delivery Bill "a developer’s charter".',
            politicianId: 'pol_walsh',
          },
        ]
      : intelligenceTurn3(),
  };

  return {
    summary,
    overview,
    politicians,
    hiddenIntentions,
    parliament: parl,
    party: partyView(me.factionName),
    history,
    meta: {
      nextSeq: history.length + 1,
      nextPlannedId: 2,
      nextNotificationId: 7,
      lastPromotionRequestTurn: null,
      plannedEvents: {},
    },
  };
}

/* ----------------------------------------------------------------------------
 * Ready-made fixtures (for tests and stories)
 * ------------------------------------------------------------------------- */

export const seedWorld: MockWorld = buildWorld({ id: CAMPAIGN_ID, name: 'Ashby & Wold' });

export const campaignSummaryFixture: CampaignSummary = seedWorld.summary;
export const careerOverviewFixture: CareerOverview = {
  campaign: seedWorld.summary,
  ...seedWorld.overview,
};
export const politicianProfilesFixture: PoliticianProfile[] = seedWorld.politicians;
export const parliamentFixture: ParliamentView = seedWorld.parliament;
export const partyFixture: PartyView = seedWorld.party;
/** Newest first, as served by GET /history. */
export const historyFixture: HistoryItem[] = [...seedWorld.history].reverse();
export const divisionForecastFixture: DivisionForecast = hdbSecondReadingForecast();
export const hdbSecondReadingResultFixture: DivisionResult = hdbSecondReadingResult(
  'aye',
  'Rachel Danby',
);

/** The report produced when week 4 (the second-reading week, w/c Mon 24 Sep 2029) resolves; week 5 opens. */
export const turnReportFixture: TurnReport = {
  revision: 14,
  turn: 4,
  simDate: '2029-09-24',
  nextTurn: 5,
  nextSimDate: '2029-10-01',
  headlines: [
    {
      text: 'Housing bill clears the Commons by 140 despite Heartlands revolt',
      standfirst:
        'Fourteen government MPs defy a three-line whip as Bernadette Walsh leads the largest rebellion of the new Parliament.',
      importance: 5,
    },
    {
      text: 'Pryce’s little black book gets longer',
      standfirst: 'The Chief Whip is said to be "taking names" after the vote.',
      importance: 4,
    },
    { text: 'Nair hails "a historic night for first-time buyers"', importance: 3 },
    { text: 'Shire MPs abstain as green-belt anger grows', importance: 3 },
  ],
  actionOutcomes: [
    {
      plannedActionId: 'pa_1',
      kind: 'meet_politician',
      label: 'Meet Daniel Osei',
      status: 'succeeded',
      summary: 'A frank coffee in Portcullis House. Osei is torn, but leaning towards Walsh.',
      effects: [
        'Daniel Osei: trust +6',
        'Daniel Osei: affinity +4',
        'Revealed: Daniel Osei intends to vote no on second reading',
      ],
    },
    {
      plannedActionId: 'pa_2',
      kind: 'support_legislation',
      label: 'Support the Housing Delivery Bill',
      status: 'succeeded',
      summary: 'Your speech on first-time buyers in the shires landed well with the front bench.',
      effects: [
        'Whips’ view of you: +4',
        'Reputation with the public: +2',
        'Reputation with colleagues: +1',
        'Harriet Lowe: lobbied towards aye',
      ],
    },
    {
      plannedActionId: 'pa_3',
      kind: 'request_promotion',
      label: 'Ask the Chief Whip about a PPS role',
      status: 'partial',
      summary: 'Pryce noted your interest. "Keep your head down and we’ll see."',
      effects: ['Gareth Pryce: respect +2', 'Promotion requests on cooldown for 6 weeks'],
    },
  ],
  divisions: [hdbSecondReadingResultFixture],
  notifications: [
    {
      id: 'ntf_20',
      turn: 5,
      severity: 'good',
      title: 'Second reading passed',
      body: 'The Housing Delivery Bill passed 356–216. You voted with the government.',
      link: { kind: 'division', id: HDB_2R_DIVISION_ID },
    },
    {
      id: 'ntf_21',
      turn: 5,
      severity: 'warning',
      title: 'Daniel Osei rebelled',
      body: 'Your friend voted against the whip. The whips have noticed.',
      link: { kind: 'politician', id: 'pol_osei' },
    },
    {
      id: 'ntf_22',
      turn: 5,
      severity: 'info',
      title: 'Capital income',
      body: 'You gained 1 political capital this week.',
    },
  ],
  capitalChange: 1,
};
