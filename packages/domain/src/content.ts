import { z } from 'zod';
import { EventDefinitionSchema, type EventDefinition } from './events';
import {
  BillIdSchema,
  ConstituencyIdSchema,
  DivisionIdSchema,
  FactionIdSchema,
  PartyIdSchema,
  PoliticianIdSchema,
} from './ids';
import type {
  BillId,
  ConstituencyId,
  DivisionId,
  FactionId,
  PartyId,
  PoliticianId,
  TurnNumber,
} from './ids';
import {
  AmbitionKeySchema,
  DepartmentKeySchema,
  GenderSchema,
  IssueKeySchema,
  NationSchema,
  OfficeKeySchema,
  RegionKeySchema,
  SkillKeySchema,
  StanceSchema,
  TraitKeySchema,
  type AmbitionKey,
  type DepartmentKey,
  type EventKey,
  type Gender,
  type IssueKey,
  type Nation,
  type OfficeKey,
  type RegionKey,
  type SkillKey,
  type Stance,
  type TraitKey,
} from './keys';
import {
  IdeologySchema,
  SkillsSchema,
  type Ideology,
  type Skills,
  type Urbanity,
} from './politics';
import { WhipInstructionSchema, type WhipInstruction } from './parliament';
import { SimDateValueSchema, type SimDate } from './sim-date';

/* ----------------------------------------------------------------------------
 * Content registry (static definitions injected via SimulationContext)
 * ------------------------------------------------------------------------- */

/** Named AI considerations whose weights traits can scale (doc 03 §6). */
export const AI_CONSIDERATIONS = [
  'careerGain',
  'ideologicalFit',
  'relationshipValue',
  'factionDemand',
  'riskOfWhipAnger',
  'whipDuty',
  'billStake',
  'publicProfile',
] as const;
export type AiConsideration = (typeof AI_CONSIDERATIONS)[number];

export interface TraitDefinition {
  key: TraitKey;
  label: string;
  description: string;
  /** Relative frequency when generating MPs (0 = never generated). */
  weight: number;
  /** Multipliers applied to AI consideration weights (1 = unchanged). */
  ai: Partial<Record<AiConsideration, number>>;
  /** Additive modifiers on the vote-utility function. */
  vote: {
    /** Added to effective loyalty (−100..100 scale) when weighing the whip. */
    loyaltyBonus: number;
    /** Multiplier on the ideological-fit / faction-line terms. */
    principleWeight: number;
  };
  /** How the holder responds to relationship actions aimed at them. */
  relationship: {
    /** Extra multiplier when courted with flattery (build_relationship by a high-media actor). */
    flatteryResponse: number;
    /** Extra multiplier when courted with substance (build_relationship by a high-policy actor). */
    substanceResponse: number;
    /** Multiplier on negative trust changes (grudges). */
    grudgeMultiplier: number;
  };
  /** Mutually exclusive traits (not generated together). */
  excludes: TraitKey[];
}
export const TraitDefinitionSchema: z.ZodType<TraitDefinition> = z.object({
  key: TraitKeySchema,
  label: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0),
  ai: z.partialRecord(z.enum(AI_CONSIDERATIONS), z.number()),
  vote: z.object({ loyaltyBonus: z.number(), principleWeight: z.number().min(0) }),
  relationship: z.object({
    flatteryResponse: z.number().min(0),
    substanceResponse: z.number().min(0),
    grudgeMultiplier: z.number().min(0),
  }),
  excludes: z.array(TraitKeySchema),
});

export interface IssueDefinition {
  key: IssueKey;
  label: string;
  description: string;
  /** Labels for stance values −2..2 (index 0 = −2). */
  stanceLabels: [string, string, string, string, string];
}
export const IssueDefinitionSchema: z.ZodType<IssueDefinition> = z.object({
  key: IssueKeySchema,
  label: z.string().min(1),
  description: z.string().min(1),
  stanceLabels: z.tuple([z.string(), z.string(), z.string(), z.string(), z.string()]),
});

export const OFFICE_KINDS = [
  'prime_minister',
  'cabinet',
  'minister',
  'whip',
  'pps',
  'speaker',
  'opposition_leader',
  'shadow',
] as const;
export type OfficeKind = (typeof OFFICE_KINDS)[number];

export interface OfficeDefinition {
  key: OfficeKey;
  label: string;
  kind: OfficeKind;
  /** Government office held by a minister (blocks request_promotion; earns capital). PPS = false. */
  ministerial: boolean;
  /** Counts as "office" for capital income (+1/turn): ministerial offices and PPS posts. */
  earnsCapital: boolean;
  departmentKey: DepartmentKey | null;
  /** Influence points contributed to the holder's derived influence. */
  influence: number;
  /** Ordering for display & reshuffles (lower = more senior). */
  rank: number;
}
export const OfficeDefinitionSchema: z.ZodType<OfficeDefinition> = z.object({
  key: OfficeKeySchema,
  label: z.string().min(1),
  kind: z.enum(OFFICE_KINDS),
  ministerial: z.boolean(),
  earnsCapital: z.boolean(),
  departmentKey: DepartmentKeySchema.nullable(),
  influence: z.number().min(0),
  rank: z.number().int().min(0),
});

export interface LabelledDefinition<K extends string> {
  key: K;
  label: string;
  description: string;
}
export interface AmbitionDefinition extends LabelledDefinition<AmbitionKey> {
  /** Relative frequency when generating MPs. */
  weight: number;
  /** Whether this ambition is about advancing in office (drives careerGain). */
  careerist: boolean;
}
export const AmbitionDefinitionSchema: z.ZodType<AmbitionDefinition> = z.object({
  key: AmbitionKeySchema,
  label: z.string().min(1),
  description: z.string().min(1),
  weight: z.number().min(0),
  careerist: z.boolean(),
});
export type SkillDefinition = LabelledDefinition<SkillKey>;
export const SkillDefinitionSchema: z.ZodType<SkillDefinition> = z.object({
  key: SkillKeySchema,
  label: z.string().min(1),
  description: z.string().min(1),
});

export interface NamePools {
  female: string[];
  male: string[];
  nonbinary: string[];
  surnames: string[];
}
export const NamePoolsSchema: z.ZodType<NamePools> = z.object({
  female: z.array(z.string().min(1)).min(20),
  male: z.array(z.string().min(1)).min(20),
  nonbinary: z.array(z.string().min(1)).min(5),
  surnames: z.array(z.string().min(1)).min(100),
});

/** Parts for generating fictional constituency names per nation. */
export interface PlaceNameParts {
  /** Complete town names. */
  towns: string[];
  /** Syllable stems + endings combined into extra town names (`Ash` + `bury`). */
  stems: string[];
  endings: string[];
  /** Compass / descriptive qualifiers ("North", "East", "Central"). */
  qualifiers: string[];
  /** Rural district names used in "X and Y" seats ("Wold", "the Vale"). */
  districts: string[];
}
export const PlaceNamePartsSchema: z.ZodType<PlaceNameParts> = z.object({
  towns: z.array(z.string().min(1)).min(10),
  stems: z.array(z.string().min(1)).min(5),
  endings: z.array(z.string().min(1)).min(5),
  qualifiers: z.array(z.string().min(1)).min(3),
  districts: z.array(z.string().min(1)).min(5),
});

/** Template keys the engine expects; content must provide each (checked by type and test). */
export const HISTORY_TEMPLATE_KEYS = [
  'campaign.created',
  'election.won',
  'action.meet_politician',
  'action.build_relationship',
  'action.seek_endorsement.success',
  'action.seek_endorsement.failure',
  'action.make_political_promise',
  'action.support_legislation',
  'action.oppose_legislation',
  'action.rebel_against_party',
  'action.request_promotion',
  'action.respond_to_event',
  'action.call_reshuffle',
  'action.rejected',
  'division.passed',
  'division.defeated',
  'appointment',
  'resignation',
  'dismissal',
  'promise.kept',
  'promise.broken',
  'relationship.warmed',
  'relationship.soured',
  'event.resolved',
  'policy.concession',
  'promotion.refused',
] as const;
export type HistoryTemplateKey = (typeof HISTORY_TEMPLATE_KEYS)[number];

export const HEADLINE_TEMPLATE_KEYS = [
  'division.won_comfortably',
  'division.won_narrowly',
  'division.lost',
  'division.rebellion',
  'division.upcoming',
  'resignation',
  'appointment',
  'reshuffle',
  'concession',
  'stability.low',
  'player.rebelled',
  'player.promoted',
  'quiet_week',
] as const;
export type HeadlineTemplateKey = (typeof HEADLINE_TEMPLATE_KEYS)[number];

export interface TextTemplates {
  /** `{placeholder}` substitution; unknown placeholders are left as-is. */
  history: Record<HistoryTemplateKey, { title: string; summary: string }>;
  /** Several variants per key; the engine picks one deterministically. */
  headlines: Record<HeadlineTemplateKey, { text: string; standfirst: string }[]>;
}
const templatePair = z.object({ title: z.string().min(1), summary: z.string().min(1) });
const headlineVariants = z
  .array(z.object({ text: z.string().min(1), standfirst: z.string() }))
  .min(1);
export const TextTemplatesSchema: z.ZodType<TextTemplates> = z.object({
  history: z.object(Object.fromEntries(HISTORY_TEMPLATE_KEYS.map((k) => [k, templatePair]))),
  headlines: z.object(Object.fromEntries(HEADLINE_TEMPLATE_KEYS.map((k) => [k, headlineVariants]))),
}) as unknown as z.ZodType<TextTemplates>;

export interface ContentRegistry {
  version: number;
  traits: Record<TraitKey, TraitDefinition>;
  issues: Record<IssueKey, IssueDefinition>;
  offices: Record<OfficeKey, OfficeDefinition>;
  skills: Record<SkillKey, SkillDefinition>;
  ambitions: Record<AmbitionKey, AmbitionDefinition>;
  events: Record<EventKey, EventDefinition>;
  names: NamePools;
  places: Record<Nation, PlaceNameParts>;
  templates: TextTemplates;
}
export const ContentRegistrySchema: z.ZodType<ContentRegistry> = z.object({
  version: z.number().int().min(1),
  traits: z.record(z.string(), TraitDefinitionSchema),
  issues: z.record(z.string(), IssueDefinitionSchema),
  offices: z.record(z.string(), OfficeDefinitionSchema),
  skills: z.object({
    oratory: SkillDefinitionSchema,
    negotiation: SkillDefinitionSchema,
    administration: SkillDefinitionSchema,
    intrigue: SkillDefinitionSchema,
    media: SkillDefinitionSchema,
    policy: SkillDefinitionSchema,
  }),
  ambitions: z.record(z.string(), AmbitionDefinitionSchema),
  events: z.record(z.string(), EventDefinitionSchema),
  names: NamePoolsSchema,
  places: z.object({
    england: PlaceNamePartsSchema,
    scotland: PlaceNamePartsSchema,
    wales: PlaceNamePartsSchema,
    northern_ireland: PlaceNamePartsSchema,
  }),
  templates: TextTemplatesSchema,
});

/* ----------------------------------------------------------------------------
 * Scenario definition
 * ------------------------------------------------------------------------- */

export const IDEOLOGY_PRESETS = ['moderniser', 'heartlands', 'independent'] as const;
export type IdeologyPreset = (typeof IDEOLOGY_PRESETS)[number];
export const PLAYER_STRENGTHS = ['oratory', 'negotiation', 'intrigue', 'policy'] as const;
export type PlayerStrength = (typeof PLAYER_STRENGTHS)[number];

/** Choices made at campaign creation (07 §3). */
export interface PlayerSetup {
  firstName: string;
  lastName: string;
  gender: Gender;
  strength: PlayerStrength;
  ideologyPreset: IdeologyPreset;
}
export const PlayerSetupSchema: z.ZodType<PlayerSetup> = z.object({
  firstName: z.string().min(1).max(40),
  lastName: z.string().min(1).max(40),
  gender: GenderSchema,
  strength: z.enum(PLAYER_STRENGTHS),
  ideologyPreset: z.enum(IDEOLOGY_PRESETS),
});

/** Float baseline stance per issue (rounded & clamped to −2..2 after noise). */
export type StanceBaseline = Partial<Record<IssueKey, number>>;
const StanceBaselineSchema: z.ZodType<StanceBaseline> = z.record(
  z.string(),
  z.number().min(-3).max(3),
);

export interface ScenarioPartySpec {
  id: PartyId;
  name: string;
  shortName: string;
  colour: string;
  ideology: Ideology;
  /** 1..5; 0 for the non-party "Independents & others" bloc. */
  whipStrength: number;
  seats: number;
  seatsByNation: Record<Nation, number>;
  membership: number;
  funds: number;
  pollShare: number;
  isGovernment: boolean;
  /** Cast member who leads the party; null = generated (highest oratory) or none for whipStrength 0. */
  leaderCastKey: string | null;
  /** Cast member who is chief whip; null = generated (highest intrigue) or none for whipStrength 0. */
  chiefWhipCastKey: string | null;
  /** Spread of generated MPs' ideology around the centroid (std-dev-like, points). */
  ideologySpread: number;
  stanceBaseline: StanceBaseline;
  /** Mean party loyalty for generated MPs (−100..100). */
  loyaltyMean: number;
  /** Typical constituency profile weights for generated seats. */
  urbanityWeights: Record<Urbanity, number>;
  /** Typical majority range for generated seats [min, max]. */
  majorityRange: [number, number];
  /**
   * Low-interest bloc: generated members abstain unless strongly moved (07 §4.2: "low-interest
   * independents").
   */
  lowInterest: boolean;
}

export interface ScenarioFactionSpec {
  id: FactionId;
  partyId: PartyId;
  name: string;
  ideology: Ideology;
  demands: IssueKey[];
  leaderCastKey: string;
  /** Fraction of the party's generated MPs who join (07: ~35% of NPP MPs belong to none). */
  share: number;
  cohesion: number;
  stanceShift: StanceBaseline;
  loyaltyShift: number;
  /** Preference multipliers used to place members in seats. */
  urbanityAffinity: Record<Urbanity, number>;
  regionAffinity: Partial<Record<RegionKey, number>>;
  /** Extra weight for seats with majority below this (marginal-seat faction). */
  marginalAffinity: number;
}

export interface CastSeatSpec {
  id: ConstituencyId;
  name: string;
  nation: Nation;
  region: RegionKey;
  urbanity: Urbanity;
  majority: number;
  runnerUpPartyId: PartyId;
  homeownerShare: number;
  concerns: Partial<Record<IssueKey, number>>;
}

export interface CastSpec {
  key: string;
  id: PoliticianId;
  first: string;
  last: string;
  honorific: string | null;
  gender: Gender;
  dateOfBirth: SimDate;
  partyId: PartyId;
  factionId: FactionId | null;
  offices: OfficeKey[];
  traits: TraitKey[];
  ambition: { target: AmbitionKey; intensity: number; cause: IssueKey | null };
  skills: Skills;
  ideology: Ideology;
  stances: Partial<Record<IssueKey, Stance>>;
  riskTolerance: number;
  partyLoyalty: number;
  newIntake: boolean;
  /** Long-serving MPs (no "elected" in this election). */
  firstElected: SimDate;
  isFatherOfHouse: boolean;
  /** Short role line for the UI ("Chief Whip", "Heartlands leader"). */
  role: string;
  /** What they want, in a sentence (for profiles and intelligence text). */
  wants: string;
  seat: CastSeatSpec;
}

export interface CastRelationshipSpec {
  from: string;
  to: string;
  trust: number;
  respect: number;
  affinity: number;
  rivalry: number;
  note: string;
}

export interface ScenarioDivisionSpec {
  id: DivisionId;
  stage: 'second_reading' | 'third_reading';
  turn: TurnNumber;
  date: SimDate;
}

export interface ScenarioBillSpec {
  id: BillId;
  title: string;
  summary: string;
  sponsorCastKey: string;
  departmentKey: DepartmentKey;
  issues: Partial<Record<IssueKey, Stance>>;
  englandOnly: boolean;
  introducedOn: SimDate;
  whipping: Record<PartyId, WhipInstruction>;
  divisions: ScenarioDivisionSpec[];
}

export interface IdeologyPresetSpec {
  label: string;
  description: string;
  ideology: Ideology;
  factionId: FactionId | null;
  stances: Partial<Record<IssueKey, Stance>>;
  partyLoyalty: number;
  riskTolerance: number;
}

export interface ScenarioDefinition {
  key: string;
  title: string;
  description: string;
  startDate: SimDate;
  electionDate: SimDate;
  sessionNumber: number;
  governmentPartyId: PartyId;
  speakerPartyId: PartyId;
  parties: ScenarioPartySpec[];
  factions: ScenarioFactionSpec[];
  cast: CastSpec[];
  /**
   * Authored starting relationships between named characters (`player` = the player). Directional.
   * Values are added on top of the derived default relationship.
   */
  castRelationships: CastRelationshipSpec[];
  /** Regions per nation with relative weights for seat placement. */
  regions: Record<Nation, { key: RegionKey; label: string; weight: number }[]>;
  /** Government offices in play (excluding generated cabinet posts). */
  governmentOffices: OfficeKey[];
  /** 18 cabinet posts held by generated NPP MPs. */
  generatedCabinetOffices: OfficeKey[];
  oppositionOffices: OfficeKey[];
  /** Offices vacant at the start (reshuffle and promotion targets). */
  vacantOffices: OfficeKey[];
  player: {
    id: PoliticianId;
    seat: CastSeatSpec;
    startingCapital: number;
    diarySlots: number;
    skillRange: [number, number];
    strengthValue: number;
    presets: Record<IdeologyPreset, IdeologyPresetSpec>;
    ambition: { target: AmbitionKey; intensity: number };
    dateOfBirth: SimDate;
  };
  bills: ScenarioBillSpec[];
  /** Share of the government party's generated MPs who are new intake. */
  newIntakeShare: number;
  /** Concern weights for generated seats by urbanity (constituents' preferred direction). */
  concernsByUrbanity: Record<Urbanity, Partial<Record<IssueKey, number>>>;
  recesses: { from: SimDate; to: SimDate; label: string }[];
  priorities: IssueKey[];
}

const UrbanityWeightsSchema = z.object({
  urban: z.number().min(0),
  suburban: z.number().min(0),
  rural: z.number().min(0),
});
const CastSeatSpecSchema = z.object({
  id: ConstituencyIdSchema,
  name: z.string().min(1),
  nation: NationSchema,
  region: RegionKeySchema,
  urbanity: z.enum(['urban', 'suburban', 'rural']),
  majority: z.number().int().min(1),
  runnerUpPartyId: PartyIdSchema,
  homeownerShare: z.number().min(0).max(1),
  concerns: z.record(z.string(), z.number().min(-1).max(1)),
});

/** Validation schema for scenario content (used by @whip/content tests). */
export const ScenarioDefinitionSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  startDate: SimDateValueSchema,
  electionDate: SimDateValueSchema,
  sessionNumber: z.number().int().min(1),
  governmentPartyId: PartyIdSchema,
  speakerPartyId: PartyIdSchema,
  parties: z.array(
    z.object({
      id: PartyIdSchema,
      name: z.string().min(1),
      shortName: z.string().min(1),
      colour: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      ideology: IdeologySchema,
      whipStrength: z.number().int().min(0).max(5),
      seats: z.number().int().min(0),
      seatsByNation: z.object({
        england: z.number().int().min(0),
        scotland: z.number().int().min(0),
        wales: z.number().int().min(0),
        northern_ireland: z.number().int().min(0),
      }),
      membership: z.number().int().min(0),
      funds: z.number().min(0),
      pollShare: z.number().min(0).max(1),
      isGovernment: z.boolean(),
      leaderCastKey: z.string().nullable(),
      chiefWhipCastKey: z.string().nullable(),
      ideologySpread: z.number().min(0),
      stanceBaseline: StanceBaselineSchema,
      loyaltyMean: z.number().min(-100).max(100),
      urbanityWeights: UrbanityWeightsSchema,
      majorityRange: z.tuple([z.number().int().min(1), z.number().int().min(1)]),
      lowInterest: z.boolean(),
    }),
  ),
  factions: z.array(
    z.object({
      id: FactionIdSchema,
      partyId: PartyIdSchema,
      name: z.string().min(1),
      ideology: IdeologySchema,
      demands: z.array(IssueKeySchema),
      leaderCastKey: z.string(),
      share: z.number().min(0).max(1),
      cohesion: z.number().min(0).max(1),
      stanceShift: StanceBaselineSchema,
      loyaltyShift: z.number(),
      urbanityAffinity: UrbanityWeightsSchema,
      regionAffinity: z.record(z.string(), z.number().min(0)),
      marginalAffinity: z.number().min(0),
    }),
  ),
  cast: z.array(
    z.object({
      key: z.string().regex(/^cast\.[a-z_]+$/),
      id: PoliticianIdSchema,
      first: z.string().min(1),
      last: z.string().min(1),
      honorific: z.string().nullable(),
      gender: GenderSchema,
      dateOfBirth: SimDateValueSchema,
      partyId: PartyIdSchema,
      factionId: FactionIdSchema.nullable(),
      offices: z.array(OfficeKeySchema),
      traits: z.array(TraitKeySchema),
      ambition: z.object({
        target: AmbitionKeySchema,
        intensity: z.number().int().min(1).max(5),
        cause: IssueKeySchema.nullable(),
      }),
      skills: SkillsSchema,
      ideology: IdeologySchema,
      stances: z.record(z.string(), StanceSchema),
      riskTolerance: z.number().int().min(-2).max(2),
      partyLoyalty: z.number().min(-100).max(100),
      newIntake: z.boolean(),
      firstElected: SimDateValueSchema,
      isFatherOfHouse: z.boolean(),
      role: z.string().min(1),
      wants: z.string().min(1),
      seat: CastSeatSpecSchema,
    }),
  ),
  castRelationships: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      trust: z.number().min(-100).max(100),
      respect: z.number().min(-100).max(100),
      affinity: z.number().min(-100).max(100),
      rivalry: z.number().int().min(0).max(3),
      note: z.string(),
    }),
  ),
  regions: z.object({
    england: z
      .array(z.object({ key: RegionKeySchema, label: z.string(), weight: z.number().min(0) }))
      .min(1),
    scotland: z
      .array(z.object({ key: RegionKeySchema, label: z.string(), weight: z.number().min(0) }))
      .min(1),
    wales: z
      .array(z.object({ key: RegionKeySchema, label: z.string(), weight: z.number().min(0) }))
      .min(1),
    northern_ireland: z
      .array(z.object({ key: RegionKeySchema, label: z.string(), weight: z.number().min(0) }))
      .min(1),
  }),
  governmentOffices: z.array(OfficeKeySchema),
  generatedCabinetOffices: z.array(OfficeKeySchema).length(18),
  oppositionOffices: z.array(OfficeKeySchema),
  vacantOffices: z.array(OfficeKeySchema),
  player: z.object({
    id: PoliticianIdSchema,
    seat: CastSeatSpecSchema,
    startingCapital: z.number().int().min(0),
    diarySlots: z.number().int().min(1),
    skillRange: z.tuple([z.number().int().min(1).max(20), z.number().int().min(1).max(20)]),
    strengthValue: z.number().int().min(1).max(20),
    presets: z.object({
      moderniser: z.object({
        label: z.string(),
        description: z.string(),
        ideology: IdeologySchema,
        factionId: FactionIdSchema.nullable(),
        stances: z.record(z.string(), StanceSchema),
        partyLoyalty: z.number(),
        riskTolerance: z.number().int().min(-2).max(2),
      }),
      heartlands: z.object({
        label: z.string(),
        description: z.string(),
        ideology: IdeologySchema,
        factionId: FactionIdSchema.nullable(),
        stances: z.record(z.string(), StanceSchema),
        partyLoyalty: z.number(),
        riskTolerance: z.number().int().min(-2).max(2),
      }),
      independent: z.object({
        label: z.string(),
        description: z.string(),
        ideology: IdeologySchema,
        factionId: FactionIdSchema.nullable(),
        stances: z.record(z.string(), StanceSchema),
        partyLoyalty: z.number(),
        riskTolerance: z.number().int().min(-2).max(2),
      }),
    }),
    ambition: z.object({ target: AmbitionKeySchema, intensity: z.number().int().min(1).max(5) }),
    dateOfBirth: SimDateValueSchema,
  }),
  bills: z.array(
    z.object({
      id: BillIdSchema,
      title: z.string().min(1),
      summary: z.string().min(1),
      sponsorCastKey: z.string(),
      departmentKey: DepartmentKeySchema,
      issues: z.record(z.string(), StanceSchema),
      englandOnly: z.boolean(),
      introducedOn: SimDateValueSchema,
      whipping: z.record(z.string(), WhipInstructionSchema),
      divisions: z.array(
        z.object({
          id: DivisionIdSchema,
          stage: z.enum(['second_reading', 'third_reading']),
          turn: z.number().int().min(1),
          date: SimDateValueSchema,
        }),
      ),
    }),
  ),
  newIntakeShare: z.number().min(0).max(1),
  concernsByUrbanity: z.object({
    urban: z.record(z.string(), z.number().min(-1).max(1)),
    suburban: z.record(z.string(), z.number().min(-1).max(1)),
    rural: z.record(z.string(), z.number().min(-1).max(1)),
  }),
  recesses: z.array(
    z.object({ from: SimDateValueSchema, to: SimDateValueSchema, label: z.string() }),
  ),
  priorities: z.array(IssueKeySchema),
});

/** Compile-time check that the validation schema's output fits the ScenarioDefinition type. */
export const ScenarioDefinitionTypedSchema =
  ScenarioDefinitionSchema as unknown as z.ZodType<ScenarioDefinition>;
const _scenarioSchemaCheck: (s: z.output<typeof ScenarioDefinitionSchema>) => ScenarioDefinition = (
  s,
) => s;
