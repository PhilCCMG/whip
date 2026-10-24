import { z } from 'zod';
import {
  BillIdSchema,
  DivisionIdSchema,
  PartyIdSchema,
  PoliticianIdSchema,
  type BillId,
  type DivisionId,
  type PartyId,
  type PoliticianId,
  type TurnNumber,
} from './ids';
import {
  DepartmentKeySchema,
  IssueKeySchema,
  StanceSchema,
  VoteSchema,
  type DepartmentKey,
  type IssueKey,
  type OfficeKey,
  type Stance,
  type Vote,
} from './keys';
import { IssueStancesSchema, type IssueStances } from './politics';
import { SimDateValueSchema, type SimDate } from './sim-date';

/** Generic table: records keyed by id plus a sorted id index for deterministic iteration. */
export interface EntityTable<K extends string, V> {
  byId: Record<K, V>;
  ids: K[];
}
export function entityTableSchema<K extends string, V>(
  idSchema: z.ZodType<K>,
  value: z.ZodType<V>,
): z.ZodType<EntityTable<K, V>> {
  return z.strictObject({ byId: z.record(z.string(), value), ids: z.array(idSchema) });
}

/* ----------------------------------------------------------------------------
 * Bills
 * ------------------------------------------------------------------------- */

export const BILL_STAGES = [
  'first_reading',
  'second_reading',
  'committee',
  'report',
  'third_reading',
  'passed',
  'defeated',
  'withdrawn',
] as const;
export type BillStage = (typeof BILL_STAGES)[number];
export const BillStageSchema = z.enum(BILL_STAGES);

export const WHIP_LINES = ['three_line', 'two_line', 'free', 'none'] as const;
export type WhipLine = (typeof WHIP_LINES)[number];

/** `direction` is null for free votes / no whip. */
export interface WhipInstruction {
  line: WhipLine;
  direction: Vote | null;
}
export const WhipInstructionSchema: z.ZodType<WhipInstruction> = z.strictObject({
  line: z.enum(WHIP_LINES),
  direction: VoteSchema.nullable(),
});

export interface BillAmendment {
  turn: TurnNumber;
  issueKey: IssueKey;
  from: Stance;
  to: Stance;
  reason: string;
}
export const BillAmendmentSchema: z.ZodType<BillAmendment> = z.strictObject({
  turn: z.number().int().min(0),
  issueKey: IssueKeySchema,
  from: StanceSchema,
  to: StanceSchema,
  reason: z.string(),
});

export interface Bill {
  id: BillId;
  title: string;
  summary: string;
  sponsorId: PoliticianId;
  departmentKey: DepartmentKey;
  /** Bill stance per issue it touches (−2..2). */
  issues: IssueStances;
  stage: BillStage;
  stageDates: Partial<Record<BillStage, SimDate>>;
  whipping: Record<PartyId, WhipInstruction>;
  divisionIds: DivisionId[];
  amendments: BillAmendment[];
  /** England-only bills get free votes / abstention from Scottish members. */
  englandOnly: boolean;
}
export const BillSchema: z.ZodType<Bill> = z.strictObject({
  id: BillIdSchema,
  title: z.string(),
  summary: z.string(),
  sponsorId: PoliticianIdSchema,
  departmentKey: DepartmentKeySchema,
  issues: IssueStancesSchema,
  stage: BillStageSchema,
  stageDates: z.record(z.string(), SimDateValueSchema),
  whipping: z.record(z.string(), WhipInstructionSchema),
  divisionIds: z.array(DivisionIdSchema),
  amendments: z.array(BillAmendmentSchema),
  englandOnly: z.boolean(),
});

/* ----------------------------------------------------------------------------
 * Divisions
 * ------------------------------------------------------------------------- */

export const DECLARATION_SOURCES = ['rebellion', 'statement', 'promise'] as const;
export type DeclarationSource = (typeof DECLARATION_SOURCES)[number];
/** Precedence when one MP has several declarations: rebellion > statement > promise. */
export const DECLARATION_PRECEDENCE: Record<DeclarationSource, number> = {
  rebellion: 3,
  statement: 2,
  promise: 1,
};

/** A committed / publicly stated voting intention. */
export interface Declaration {
  vote: Vote;
  source: DeclarationSource;
  turn: TurnNumber;
}
export const DeclarationSchema: z.ZodType<Declaration> = z.strictObject({
  vote: VoteSchema,
  source: z.enum(DECLARATION_SOURCES),
  turn: z.number().int().min(0),
});

/**
 * Lobbying pressure on one MP for one division. Positive = towards aye. `total` is the sum of
 * `bySource`, clamped when used in vote utility.
 */
export interface Pressure {
  total: number;
  bySource: Record<PoliticianId, number>;
}
export const PressureSchema: z.ZodType<Pressure> = z.strictObject({
  total: z.number(),
  bySource: z.record(z.string(), z.number()),
});

export interface RebelEntry {
  politicianId: PoliticianId;
  vote: Vote;
  reason: string;
}
export const RebelEntrySchema: z.ZodType<RebelEntry> = z.strictObject({
  politicianId: PoliticianIdSchema,
  vote: VoteSchema,
  reason: z.string(),
});

export interface DivisionResult {
  heldOn: SimDate;
  ayes: number;
  noes: number;
  abstentions: number;
  /** MPs eligible to vote (sitting MPs minus the Speaker). ayes + noes + abstentions = eligible. */
  eligible: number;
  passed: boolean;
  governmentWon: boolean;
  /** ayes − noes. */
  margin: number;
  votes: Record<PoliticianId, Vote>;
  rebels: RebelEntry[];
  /** Top reasons, kept for high-fidelity MPs and rebels. */
  explanations: Record<PoliticianId, string[]>;
}
export const DivisionResultSchema: z.ZodType<DivisionResult> = z.strictObject({
  heldOn: SimDateValueSchema,
  ayes: z.number().int().min(0),
  noes: z.number().int().min(0),
  abstentions: z.number().int().min(0),
  eligible: z.number().int().min(0),
  passed: z.boolean(),
  governmentWon: z.boolean(),
  margin: z.number().int(),
  votes: z.record(z.string(), VoteSchema),
  rebels: z.array(RebelEntrySchema),
  explanations: z.record(z.string(), z.array(z.string())),
});

export type DivisionStage = 'second_reading' | 'third_reading';

export interface Division {
  id: DivisionId;
  billId: BillId;
  stage: DivisionStage;
  scheduledFor: SimDate;
  /** Turn in which the division is held. */
  turn: TurnNumber;
  /** cancelled = the bill fell or was withdrawn before this stage. */
  status: 'scheduled' | 'held' | 'cancelled';
  declarations: Record<PoliticianId, Declaration>;
  pressure: Record<PoliticianId, Pressure>;
  /** What the whips' office believes about individual MPs' votes. */
  whipIntel: Record<PoliticianId, Vote>;
  /** How many times the whips have leaned on each MP for this division. */
  whipAttention: Record<PoliticianId, number>;
  result: DivisionResult | null;
}
export const DivisionSchema: z.ZodType<Division> = z.strictObject({
  id: DivisionIdSchema,
  billId: BillIdSchema,
  stage: z.enum(['second_reading', 'third_reading']),
  scheduledFor: SimDateValueSchema,
  turn: z.number().int().min(0),
  status: z.enum(['scheduled', 'held', 'cancelled']),
  declarations: z.record(z.string(), DeclarationSchema),
  pressure: z.record(z.string(), PressureSchema),
  whipIntel: z.record(z.string(), VoteSchema),
  whipAttention: z.record(z.string(), z.number().int().min(0)),
  result: DivisionResultSchema.nullable(),
});

/* ----------------------------------------------------------------------------
 * Parliament / Government
 * ------------------------------------------------------------------------- */

export interface Recess {
  from: SimDate;
  to: SimDate;
  label: string;
}

export interface Parliament {
  session: { number: number; openedOn: SimDate };
  /** Derived from sitting MPs; recomputed, never incremented. */
  seats: Record<PartyId, number>;
  governmentPartyIds: PartyId[];
  confidenceAndSupply: { partyId: PartyId; strength: number }[];
  bills: EntityTable<BillId, Bill>;
  divisions: EntityTable<DivisionId, Division>;
  speakerId: PoliticianId | null;
  fatherOfHouseId: PoliticianId | null;
  sittingWeeks: { recesses: Recess[] };
  /** Opposition front-bench posts (Leader of the Opposition, shadow ministers). null = vacant. */
  oppositionAppointments: Record<OfficeKey, PoliticianId | null>;
}
export const ParliamentSchema: z.ZodType<Parliament> = z.strictObject({
  session: z.strictObject({ number: z.number().int().min(1), openedOn: SimDateValueSchema }),
  seats: z.record(z.string(), z.number().int().min(0)),
  governmentPartyIds: z.array(PartyIdSchema),
  confidenceAndSupply: z.array(
    z.strictObject({ partyId: PartyIdSchema, strength: z.number().int().min(-2).max(2) }),
  ),
  bills: entityTableSchema(BillIdSchema, BillSchema),
  divisions: entityTableSchema(DivisionIdSchema, DivisionSchema),
  speakerId: PoliticianIdSchema.nullable(),
  fatherOfHouseId: PoliticianIdSchema.nullable(),
  sittingWeeks: z.strictObject({
    recesses: z.array(
      z.strictObject({ from: SimDateValueSchema, to: SimDateValueSchema, label: z.string() }),
    ),
  }),
  oppositionAppointments: z.record(z.string(), PoliticianIdSchema.nullable()),
});

export interface Government {
  primeMinisterId: PoliticianId;
  partyIds: PartyId[];
  /** Every government office in play; null = vacant. */
  appointments: Record<OfficeKey, PoliticianId | null>;
  priorities: IssueKey[];
  agenda: BillId[];
  /** −100..100 */
  stability: number;
  lastDefeatTurn: TurnNumber | null;
}
export const GovernmentSchema: z.ZodType<Government> = z.strictObject({
  primeMinisterId: PoliticianIdSchema,
  partyIds: z.array(PartyIdSchema),
  appointments: z.record(z.string(), PoliticianIdSchema.nullable()),
  priorities: z.array(IssueKeySchema),
  agenda: z.array(BillIdSchema),
  stability: z.number().min(-100).max(100),
  lastDefeatTurn: z.number().int().nullable(),
});
