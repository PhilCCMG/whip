import { z } from 'zod';
import {
  ACTION_OUTCOME_STATUSES,
  ActionKindSchema,
  type ActionKind,
  type ActionOutcomeStatus,
} from './actions';
import {
  BillIdSchema,
  ConstituencyIdSchema,
  DivisionIdSchema,
  EventInstanceIdSchema,
  HistoryRecordIdSchema,
  NotificationIdSchema,
  PartyIdSchema,
  PlannedActionIdSchema,
  PoliticianIdSchema,
  type BillId,
  type ConstituencyId,
  type DivisionId,
  type EventInstanceId,
  type HistoryRecordId,
  type NotificationId,
  type PartyId,
  type PlannedActionId,
  type PoliticianId,
  type TurnNumber,
} from './ids';
import {
  EventKeySchema,
  IssueKeySchema,
  OfficeKeySchema,
  StanceSchema,
  VoteSchema,
  type EventKey,
  type IssueKey,
  type OfficeKey,
  type Stance,
  type Vote,
} from './keys';
import { SimDateValueSchema, type SimDate } from './sim-date';

/* ----------------------------------------------------------------------------
 * History records (doc 02 §5). Values of `type` match contracts' HistoryTypeSchema.
 * ------------------------------------------------------------------------- */

export const HISTORY_TYPES = [
  'election',
  'appointment',
  'resignation',
  'dismissal',
  'division',
  'leadership_contest',
  'scandal',
  'policy_announcement',
  'negotiation',
  'relationship_change',
  'action_outcome',
  'event',
  'promise',
  'campaign',
] as const;
export type HistoryType = (typeof HISTORY_TYPES)[number];

export interface HistoryPayloads {
  election: { constituencyId: ConstituencyId; partyId: PartyId; majority: number };
  appointment: {
    officeKey: OfficeKey;
    politicianId: PoliticianId;
    previousHolderId: PoliticianId | null;
  };
  resignation: { officeKey: OfficeKey; politicianId: PoliticianId; reason: string };
  dismissal: { officeKey: OfficeKey; politicianId: PoliticianId; reason: string };
  division: {
    divisionId: DivisionId;
    billId: BillId;
    stage: string;
    ayes: number;
    noes: number;
    abstentions: number;
    passed: boolean;
    governmentWon: boolean;
    rebelIds: PoliticianId[];
  };
  leadership_contest: { note: string };
  scandal: { note: string };
  policy_announcement: { billId: BillId; issueKey: IssueKey; from: Stance; to: Stance };
  negotiation: { note: string };
  relationship_change: {
    from: PoliticianId;
    to: PoliticianId;
    trust: number;
    respect: number;
    affinity: number;
  };
  action_outcome: {
    kind: ActionKind;
    status: ActionOutcomeStatus;
    plannedActionId: PlannedActionId | null;
    effects: string[];
  };
  event: { eventId: EventInstanceId; definitionKey: EventKey; optionKey: string | null };
  promise: {
    promiserId: PoliticianId;
    promiseeId: PoliticianId;
    divisionId: DivisionId;
    vote: Vote;
    kept: boolean;
  };
  campaign: { note: string };
}

export interface HistoryRecordBase {
  id: HistoryRecordId;
  /** Campaign-wide monotonically increasing sequence number. */
  seq: number;
  turn: TurnNumber;
  date: SimDate;
  /** 1 (trivia) … 5 (era-defining). */
  importance: number;
  /** Human-readable, deterministic template output. */
  title: string;
  summary: string;
  actorIds: PoliticianId[];
  subjectIds: string[];
  /** `turn:phase:seq` ids of the effects that produced this record. */
  effectIds: string[];
}

/** Discriminated on `type`; `payload` shape depends on it. */
export type HistoryRecord = {
  [T in HistoryType]: HistoryRecordBase & { type: T; payload: HistoryPayloads[T] };
}[HistoryType];

const pid = PoliticianIdSchema;
const note = z.strictObject({ note: z.string() });
const historyPayloadSchemas: { [T in HistoryType]: z.ZodType<HistoryPayloads[T]> } = {
  election: z.strictObject({
    constituencyId: ConstituencyIdSchema,
    partyId: PartyIdSchema,
    majority: z.number().int(),
  }),
  appointment: z.strictObject({
    officeKey: OfficeKeySchema,
    politicianId: pid,
    previousHolderId: pid.nullable(),
  }),
  resignation: z.strictObject({
    officeKey: OfficeKeySchema,
    politicianId: pid,
    reason: z.string(),
  }),
  dismissal: z.strictObject({ officeKey: OfficeKeySchema, politicianId: pid, reason: z.string() }),
  division: z.strictObject({
    divisionId: DivisionIdSchema,
    billId: BillIdSchema,
    stage: z.string(),
    ayes: z.number().int(),
    noes: z.number().int(),
    abstentions: z.number().int(),
    passed: z.boolean(),
    governmentWon: z.boolean(),
    rebelIds: z.array(pid),
  }),
  leadership_contest: note,
  scandal: note,
  policy_announcement: z.strictObject({
    billId: BillIdSchema,
    issueKey: IssueKeySchema,
    from: StanceSchema,
    to: StanceSchema,
  }),
  negotiation: note,
  relationship_change: z.strictObject({
    from: pid,
    to: pid,
    trust: z.number(),
    respect: z.number(),
    affinity: z.number(),
  }),
  action_outcome: z.strictObject({
    kind: ActionKindSchema,
    status: z.enum(ACTION_OUTCOME_STATUSES),
    plannedActionId: PlannedActionIdSchema.nullable(),
    effects: z.array(z.string()),
  }),
  event: z.strictObject({
    eventId: EventInstanceIdSchema,
    definitionKey: EventKeySchema,
    optionKey: z.string().nullable(),
  }),
  promise: z.strictObject({
    promiserId: pid,
    promiseeId: pid,
    divisionId: DivisionIdSchema,
    vote: VoteSchema,
    kept: z.boolean(),
  }),
  campaign: note,
};

const historyBaseShape = {
  id: HistoryRecordIdSchema,
  seq: z.number().int().min(1),
  turn: z.number().int().min(0),
  date: SimDateValueSchema,
  importance: z.number().int().min(1).max(5),
  title: z.string(),
  summary: z.string(),
  actorIds: z.array(pid),
  subjectIds: z.array(z.string()),
  effectIds: z.array(z.string()),
};

function historyVariant<T extends HistoryType>(type: T) {
  return z.strictObject({
    ...historyBaseShape,
    type: z.literal(type),
    payload: historyPayloadSchemas[type],
  });
}

export const HistoryRecordSchema: z.ZodType<HistoryRecord> = z.discriminatedUnion('type', [
  historyVariant('election'),
  historyVariant('appointment'),
  historyVariant('resignation'),
  historyVariant('dismissal'),
  historyVariant('division'),
  historyVariant('leadership_contest'),
  historyVariant('scandal'),
  historyVariant('policy_announcement'),
  historyVariant('negotiation'),
  historyVariant('relationship_change'),
  historyVariant('action_outcome'),
  historyVariant('event'),
  historyVariant('promise'),
  historyVariant('campaign'),
]);

/* ----------------------------------------------------------------------------
 * Notifications, headlines, intelligence
 * ------------------------------------------------------------------------- */

export type NotificationSeverity = 'info' | 'good' | 'warning' | 'critical';
export type NotificationLinkKind = 'politician' | 'bill' | 'division' | 'event' | 'history';

export interface Notification {
  id: NotificationId;
  turn: TurnNumber;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: { kind: NotificationLinkKind; id: string } | null;
}
export const NotificationSchema: z.ZodType<Notification> = z.strictObject({
  id: NotificationIdSchema,
  turn: z.number().int().min(0),
  severity: z.enum(['info', 'good', 'warning', 'critical']),
  title: z.string(),
  body: z.string(),
  link: z
    .object({
      kind: z.enum(['politician', 'bill', 'division', 'event', 'history']),
      id: z.string(),
    })
    .nullable(),
});

/** Newspaper-style briefing headline. */
export interface Headline {
  text: string;
  standfirst: string | null;
  importance: number;
}
export const HeadlineSchema: z.ZodType<Headline> = z.strictObject({
  text: z.string(),
  standfirst: z.string().nullable(),
  importance: z.number().int().min(1).max(5),
});

export interface Briefing {
  turn: TurnNumber;
  date: SimDate;
  headlines: Headline[];
}
export const BriefingSchema: z.ZodType<Briefing> = z.strictObject({
  turn: z.number().int().min(0),
  date: SimDateValueSchema,
  headlines: z.array(HeadlineSchema),
});

/** One item of the player's political-intelligence feed (NPC moves the player learned about). */
export interface IntelItem {
  turn: TurnNumber;
  text: string;
  politicianId: PoliticianId | null;
}
export const IntelItemSchema: z.ZodType<IntelItem> = z.strictObject({
  turn: z.number().int().min(0),
  text: z.string(),
  politicianId: pid.nullable(),
});

/** What the player knows about one MP's voting intention on one division. */
export interface KnownIntention {
  value: Vote;
  asOfTurn: TurnNumber;
  /** How it was learned: "meeting", "public statement", "whips' office"… */
  source: string;
}
export const KnownIntentionSchema: z.ZodType<KnownIntention> = z.strictObject({
  value: VoteSchema,
  asOfTurn: z.number().int().min(0),
  source: z.string(),
});

/** Player fog-of-war knowledge (07 §5). */
export interface Knowledge {
  /** intentions[politicianId][divisionId] */
  intentions: Record<PoliticianId, Record<DivisionId, KnownIntention>>;
  /** Newest last; capped. */
  intel: IntelItem[];
}
export const KnowledgeSchema: z.ZodType<Knowledge> = z.strictObject({
  intentions: z.record(z.string(), z.record(z.string(), KnownIntentionSchema)),
  intel: z.array(IntelItemSchema),
});

export const MAX_INTEL_ITEMS = 60;
export const MAX_INBOX_NOTIFICATIONS = 60;
