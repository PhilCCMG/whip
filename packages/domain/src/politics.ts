import { z } from 'zod';
import {
  ConstituencyIdSchema,
  FactionIdSchema,
  PartyIdSchema,
  PoliticianIdSchema,
  type ConstituencyId,
  type FactionId,
  type PartyId,
  type PoliticianId,
  type TurnNumber,
} from './ids';
import {
  AmbitionKeySchema,
  GenderSchema,
  IssueKeySchema,
  NationSchema,
  OfficeKeySchema,
  RegionKeySchema,
  StanceSchema,
  TraitKeySchema,
  type AmbitionKey,
  type Audience,
  type Gender,
  type IssueKey,
  type Nation,
  type OfficeKey,
  type RegionKey,
  type SkillKey,
  type Stance,
  type TraitKey,
} from './keys';
import { SimDateValueSchema, type SimDate } from './sim-date';

/* ----------------------------------------------------------------------------
 * Attribute value types (doc 02 §2)
 * ------------------------------------------------------------------------- */

/** Two-axis position. economic −100 collectivist … +100 free-market; social −100 liberal … +100 traditional. */
export interface Ideology {
  economic: number;
  social: number;
}
export const IdeologySchema: z.ZodType<Ideology> = z.strictObject({
  economic: z.number().min(-100).max(100),
  social: z.number().min(-100).max(100),
});

/** Skills 1..20 (10 = typical MP, 15+ gifted, 5− a liability). */
export type Skills = Record<SkillKey, number>;
const skill = z.number().int().min(1).max(20);
export const SkillsSchema: z.ZodType<Skills> = z.strictObject({
  oratory: skill,
  negotiation: skill,
  administration: skill,
  intrigue: skill,
  media: skill,
  policy: skill,
});

/** Reputation −100..100 per audience; 0 = unknown/neutral. */
export type Reputation = Record<Audience, number>;
const rep = z.number().min(-100).max(100);
export const ReputationSchema: z.ZodType<Reputation> = z.strictObject({
  public: rep,
  party_members: rep,
  colleagues: rep,
  media: rep,
  whips: rep,
});

/** What they want and how badly (intensity 1..5). `cause` is set for ambition.policy_cause. */
export interface Ambition {
  target: AmbitionKey;
  intensity: number;
  cause: IssueKey | null;
}
export const AmbitionSchema: z.ZodType<Ambition> = z.strictObject({
  target: AmbitionKeySchema,
  intensity: z.number().int().min(1).max(5),
  cause: IssueKeySchema.nullable(),
});

export type IssueStances = Partial<Record<IssueKey, Stance>>;
export const IssueStancesSchema: z.ZodType<IssueStances> = z.record(z.string(), StanceSchema);

export interface OfficeHolding {
  officeKey: OfficeKey;
  since: SimDate;
}
export const OfficeHoldingSchema: z.ZodType<OfficeHolding> = z.strictObject({
  officeKey: OfficeKeySchema,
  since: SimDateValueSchema,
});

export const CAREER_ENTRY_KINDS = [
  'elected',
  'appointed',
  'resigned',
  'sacked',
  'moved',
  'endorsed',
  'rebelled',
  'declined_office',
] as const;
export type CareerEntryKind = (typeof CAREER_ENTRY_KINDS)[number];

/** Compact career milestone. `text` is a human-readable deterministic sentence. */
export interface CareerEntry {
  date: SimDate;
  turn: TurnNumber;
  kind: CareerEntryKind;
  officeKey: OfficeKey | null;
  text: string;
}
export const CareerEntrySchema: z.ZodType<CareerEntry> = z.strictObject({
  date: SimDateValueSchema,
  turn: z.number().int().min(0),
  kind: z.enum(CAREER_ENTRY_KINDS),
  officeKey: OfficeKeySchema.nullable(),
  text: z.string(),
});

export const FIDELITY_TIERS = ['high', 'medium', 'low'] as const;
export type FidelityTier = (typeof FIDELITY_TIERS)[number];

/** A remembered NPC move, kept for the intelligence panel and AI anti-repetition. */
export interface AiActionMemo {
  turn: TurnNumber;
  kind: string;
  targetId: PoliticianId | null;
  reasons: string[];
}
export const AiActionMemoSchema: z.ZodType<AiActionMemo> = z.strictObject({
  turn: z.number().int().min(0),
  kind: z.string(),
  targetId: PoliticianIdSchema.nullable(),
  reasons: z.array(z.string()),
});

export interface AiState {
  lastPlannedTurn: TurnNumber;
  recentActions: AiActionMemo[];
}
export const AiStateSchema: z.ZodType<AiState> = z.strictObject({
  lastPlannedTurn: z.number().int().min(0),
  recentActions: z.array(AiActionMemoSchema),
});

/** How long individual rebellion records are kept on a politician (one year of weekly turns). */
export const REBELLION_WINDOW_TURNS = 52;

/** A recorded vote against the party whip (the recent "loyalty record"). */
export interface RebellionRecord {
  divisionId: string;
  vote: 'aye' | 'no' | 'abstain';
  turn: TurnNumber;
  whipLine: 'three_line' | 'two_line';
}
export const RebellionRecordSchema: z.ZodType<RebellionRecord> = z.strictObject({
  divisionId: z.string(),
  vote: z.enum(['aye', 'no', 'abstain']),
  turn: z.number().int().min(0),
  whipLine: z.enum(['three_line', 'two_line']),
});

export const POLITICIAN_STATUSES = ['mp', 'candidate', 'former_mp', 'peer', 'retired'] as const;
export type PoliticianStatus = (typeof POLITICIAN_STATUSES)[number];

export interface PersonName {
  first: string;
  last: string;
  honorific: string | null;
}

export interface Politician {
  id: PoliticianId;
  name: PersonName;
  dateOfBirth: SimDate;
  gender: Gender;
  partyId: PartyId | null;
  factionId: FactionId | null;
  constituencyId: ConstituencyId | null;
  status: PoliticianStatus;
  offices: OfficeHolding[];
  ideology: Ideology;
  stances: IssueStances;
  traits: TraitKey[];
  skills: Skills;
  ambition: Ambition;
  /** −2..+2 willingness to take career risks (rebel, defect, plot). */
  riskTolerance: number;
  reputation: Reputation;
  /** −100..100 disposition towards the party line. */
  partyLoyalty: number;
  /** Integer ≥ 0, spendable currency of influence. */
  politicalCapital: number;
  /** −100..100 standing with their own constituents ("local reputation"). */
  localStanding: number;
  /** Politicians who have endorsed this one for promotion (sorted ids). */
  endorsedBy: PoliticianId[];
  /** Elected for the first time at the scenario's general election. */
  newIntake: boolean;
  isPlayer: boolean;
  /** Scenario cast key for named characters (e.g. `cast.priya_nair`), null for generated MPs. */
  castKey: string | null;
  /** Milestones are kept for life; routine entries (endorsements) are capped by the engine. */
  career: CareerEntry[];
  /** Votes against the whip in the last REBELLION_WINDOW_TURNS turns (older ones age out). */
  rebellions: RebellionRecord[];
  /** Lifetime count of votes against the whip (never decreases; includes aged-out records). */
  rebellionCount: number;
  fidelity: FidelityTier;
  ai: AiState | null;
}

export const PoliticianSchema: z.ZodType<Politician> = z.strictObject({
  id: PoliticianIdSchema,
  name: z.strictObject({
    first: z.string().min(1),
    last: z.string().min(1),
    honorific: z.string().nullable(),
  }),
  dateOfBirth: SimDateValueSchema,
  gender: GenderSchema,
  partyId: PartyIdSchema.nullable(),
  factionId: FactionIdSchema.nullable(),
  constituencyId: ConstituencyIdSchema.nullable(),
  status: z.enum(POLITICIAN_STATUSES),
  offices: z.array(OfficeHoldingSchema),
  ideology: IdeologySchema,
  stances: IssueStancesSchema,
  traits: z.array(TraitKeySchema),
  skills: SkillsSchema,
  ambition: AmbitionSchema,
  riskTolerance: z.number().int().min(-2).max(2),
  reputation: ReputationSchema,
  partyLoyalty: z.number().min(-100).max(100),
  politicalCapital: z.number().int().min(0),
  localStanding: z.number().min(-100).max(100),
  endorsedBy: z.array(PoliticianIdSchema),
  newIntake: z.boolean(),
  isPlayer: z.boolean(),
  castKey: z.string().nullable(),
  career: z.array(CareerEntrySchema),
  rebellions: z.array(RebellionRecordSchema),
  rebellionCount: z.number().int().min(0),
  fidelity: z.enum(FIDELITY_TIERS),
  ai: AiStateSchema.nullable(),
});

/* ----------------------------------------------------------------------------
 * Party / Faction
 * ------------------------------------------------------------------------- */

export interface Party {
  id: PartyId;
  name: string;
  shortName: string;
  colour: string;
  /** Centroid of the leadership's line. */
  ideology: Ideology;
  leaderId: PoliticianId | null;
  chiefWhipId: PoliticianId | null;
  /** 1..5 organisational discipline. */
  whipStrength: number;
  factionIds: FactionId[];
  membership: number;
  funds: number;
  standing: { nationalPollShare: number };
  /** −100..100, derived and smoothed each turn. */
  unity: number;
}
export const PartySchema: z.ZodType<Party> = z.strictObject({
  id: PartyIdSchema,
  name: z.string(),
  shortName: z.string(),
  colour: z.string(),
  ideology: IdeologySchema,
  leaderId: PoliticianIdSchema.nullable(),
  chiefWhipId: PoliticianIdSchema.nullable(),
  whipStrength: z.number().int().min(0).max(5),
  factionIds: z.array(FactionIdSchema),
  membership: z.number().int().min(0),
  funds: z.number().min(0),
  standing: z.strictObject({ nationalPollShare: z.number().min(0).max(1) }),
  unity: z.number().min(-100).max(100),
});

export interface Faction {
  id: FactionId;
  partyId: PartyId;
  name: string;
  ideology: Ideology;
  leaderId: PoliticianId | null;
  memberIds: PoliticianId[];
  /** 0..1 how reliably members follow the faction line. */
  cohesion: number;
  demands: IssueKey[];
}
export const FactionSchema: z.ZodType<Faction> = z.strictObject({
  id: FactionIdSchema,
  partyId: PartyIdSchema,
  name: z.string(),
  ideology: IdeologySchema,
  leaderId: PoliticianIdSchema.nullable(),
  memberIds: z.array(PoliticianIdSchema),
  cohesion: z.number().min(0).max(1),
  demands: z.array(IssueKeySchema),
});

/* ----------------------------------------------------------------------------
 * Constituency
 * ------------------------------------------------------------------------- */

export interface ElectionResult {
  date: SimDate;
  votes: Record<PartyId, number>;
  /** 0..1 */
  turnout: number;
  winnerId: PoliticianId;
  winnerPartyId: PartyId;
}
export const ElectionResultSchema: z.ZodType<ElectionResult> = z.strictObject({
  date: SimDateValueSchema,
  votes: z.record(z.string(), z.number().int().min(0)),
  turnout: z.number().min(0).max(1),
  winnerId: PoliticianIdSchema,
  winnerPartyId: PartyIdSchema,
});

export type Urbanity = 'urban' | 'suburban' | 'rural';

export interface Constituency {
  id: ConstituencyId;
  /** ONS GSS code for future boundary imports; null for fictional seats. */
  externalCode: string | null;
  name: string;
  nation: Nation;
  region: RegionKey;
  electorate: number;
  demographics: {
    medianAge: number;
    graduateShare: number;
    homeownerShare: number;
    urbanity: Urbanity;
  };
  economy: { unemploymentRate: number; medianIncomeIndex: number };
  /** Electorate's centroid. */
  leanings: Ideology;
  /**
   * Local strength of feeling on issues, −1..1: the direction constituents want the MP to lean
   * (e.g. `issue.green_belt: 0.8` = strongly want green-belt protection).
   */
  concerns: Partial<Record<IssueKey, number>>;
  currentMpId: PoliticianId | null;
  results: ElectionResult[];
}
export const ConstituencySchema: z.ZodType<Constituency> = z.strictObject({
  id: ConstituencyIdSchema,
  externalCode: z.string().nullable(),
  name: z.string(),
  nation: NationSchema,
  region: RegionKeySchema,
  electorate: z.number().int().min(0),
  demographics: z.strictObject({
    medianAge: z.number(),
    graduateShare: z.number().min(0).max(1),
    homeownerShare: z.number().min(0).max(1),
    urbanity: z.enum(['urban', 'suburban', 'rural']),
  }),
  economy: z.strictObject({
    unemploymentRate: z.number().min(0).max(1),
    medianIncomeIndex: z.number(),
  }),
  leanings: IdeologySchema,
  concerns: z.record(z.string(), z.number().min(-1).max(1)),
  currentMpId: PoliticianIdSchema.nullable(),
  results: z.array(ElectionResultSchema),
});
