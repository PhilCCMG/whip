import { z } from 'zod';
import {
  BillIdSchema,
  DivisionIdSchema,
  EventInstanceIdSchema,
  PoliticianIdSchema,
  type BillId,
  type DivisionId,
  type EventInstanceId,
  type PoliticianId,
  type TurnNumber,
} from './ids';
import {
  AudienceSchema,
  EventKeySchema,
  IssueKeySchema,
  OfficeKeySchema,
  StanceSchema,
  VoteSchema,
  type Audience,
  type EventKey,
  type IssueKey,
  type OfficeKey,
  type Stance,
  type TraitKey,
  type Vote,
} from './keys';

/* ----------------------------------------------------------------------------
 * Event instances (GameState.events.pending)
 * ------------------------------------------------------------------------- */

/** Entities an event instance is about. */
export interface EventSubjects {
  politicianIds: PoliticianId[];
  billId: BillId | null;
  divisionId: DivisionId | null;
  officeKey: OfficeKey | null;
}
export const EventSubjectsSchema: z.ZodType<EventSubjects> = z.strictObject({
  politicianIds: z.array(PoliticianIdSchema),
  billId: BillIdSchema.nullable(),
  divisionId: DivisionIdSchema.nullable(),
  officeKey: OfficeKeySchema.nullable(),
});

export interface EventInstance {
  id: EventInstanceId;
  definitionKey: EventKey;
  raisedTurn: TurnNumber;
  /** Last turn in which it can be answered; after that the default option is applied. */
  expiresTurn: TurnNumber;
  addresseeId: PoliticianId;
  subjects: EventSubjects;
  status: 'pending' | 'resolved' | 'expired';
  resolution: { optionKey: string; turn: TurnNumber } | null;
}
export const EventInstanceSchema: z.ZodType<EventInstance> = z.strictObject({
  id: EventInstanceIdSchema,
  definitionKey: EventKeySchema,
  raisedTurn: z.number().int().min(0),
  expiresTurn: z.number().int().min(0),
  addresseeId: PoliticianIdSchema,
  subjects: EventSubjectsSchema,
  status: z.enum(['pending', 'resolved', 'expired']),
  resolution: z.strictObject({ optionKey: z.string(), turn: z.number().int().min(0) }).nullable(),
});

/* ----------------------------------------------------------------------------
 * Event definitions (static content, @whip/content)
 * ------------------------------------------------------------------------- */

/**
 * Who an event-option effect refers to, resolved against the instance:
 * `addressee`, office holders, the bill sponsor, the first subject politician, or the leader of a
 * faction (`faction:<factionId>`).
 */
export type RoleRef =
  | 'addressee'
  | 'chief_whip'
  | 'deputy_chief_whip'
  | 'prime_minister'
  | 'bill_sponsor'
  | 'subject'
  | `faction:${string}`;
export const RoleRefSchema = z.custom<RoleRef>(
  (v) =>
    typeof v === 'string' &&
    ([
      'addressee',
      'chief_whip',
      'deputy_chief_whip',
      'prime_minister',
      'bill_sponsor',
      'subject',
    ].includes(v) ||
      /^faction:faction\.[a-z_]+$/.test(v)),
  'Expected a role reference',
);

/** Declarative effect template used by event options; the engine binds roles and emits Effects. */
export type EventEffectTemplate =
  | {
      kind: 'relationship';
      from: RoleRef;
      to: RoleRef;
      trust: number;
      respect: number;
      affinity: number;
    }
  | { kind: 'reputation'; who: RoleRef; audience: Audience; delta: number }
  | { kind: 'capital'; who: RoleRef; delta: number }
  | { kind: 'local_standing'; who: RoleRef; delta: number }
  | { kind: 'loyalty'; who: RoleRef; delta: number }
  | { kind: 'stability'; delta: number }
  | { kind: 'amend_bill'; issueKey: IssueKey; stance: Stance }
  /** Scheduled for next week: changes the addressee's diary slots. */
  | { kind: 'slots_next_week'; who: RoleRef; delta: number }
  /** The whips' office learns the addressee's current intention on the subject division. */
  | { kind: 'whips_learn_intention' }
  /** The addressee publicly declares a vote on the subject division. */
  | { kind: 'declare_vote'; vote: Vote }
  /** The addressee leaves every ministerial office they hold. */
  | { kind: 'resign_office' }
  /** The addressee takes the subject office. */
  | { kind: 'accept_office' }
  | { kind: 'decline_office' }
  | { kind: 'intel'; text: string };

const n = z.number();
export const EventEffectTemplateSchema: z.ZodType<EventEffectTemplate> = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('relationship'),
      from: RoleRefSchema,
      to: RoleRefSchema,
      trust: n,
      respect: n,
      affinity: n,
    }),
    z.object({
      kind: z.literal('reputation'),
      who: RoleRefSchema,
      audience: AudienceSchema,
      delta: n,
    }),
    z.object({ kind: z.literal('capital'), who: RoleRefSchema, delta: z.number().int() }),
    z.object({ kind: z.literal('local_standing'), who: RoleRefSchema, delta: n }),
    z.object({ kind: z.literal('loyalty'), who: RoleRefSchema, delta: n }),
    z.object({ kind: z.literal('stability'), delta: n }),
    z.object({ kind: z.literal('amend_bill'), issueKey: IssueKeySchema, stance: StanceSchema }),
    z.object({ kind: z.literal('slots_next_week'), who: RoleRefSchema, delta: z.number().int() }),
    z.object({ kind: z.literal('whips_learn_intention') }),
    z.object({ kind: z.literal('declare_vote'), vote: VoteSchema }),
    z.object({ kind: z.literal('resign_office') }),
    z.object({ kind: z.literal('accept_office') }),
    z.object({ kind: z.literal('decline_office') }),
    z.object({ kind: z.literal('intel'), text: z.string() }),
  ],
);

/** How an NPC addressee scores an option: base + Σ trait modifiers (+ small seeded jitter). */
export interface EventOptionAi {
  base: number;
  traitModifiers: Partial<Record<TraitKey, number>>;
}

export interface EventOptionDefinition {
  key: string;
  label: string;
  description: string;
  capitalCost: number;
  effects: EventEffectTemplate[];
  ai: EventOptionAi;
}
export const EventOptionDefinitionSchema: z.ZodType<EventOptionDefinition> = z.object({
  key: z.string().regex(/^[a-z_]+$/),
  label: z.string().min(1),
  description: z.string().min(1),
  capitalCost: z.number().int().min(0),
  effects: z.array(EventEffectTemplateSchema),
  ai: z.object({ base: z.number(), traitModifiers: z.record(z.string(), z.number()) }),
});

/**
 * Declarative trigger. The engine has one evaluator per trigger kind; parameters live in content.
 * `engine` = raised only by game rules (e.g. after a defeat), never by the event generation phase.
 */
export type EventTrigger =
  | { kind: 'whips_suspect_waverer'; chance: number; maxWeeksBeforeDivision: number }
  | {
      kind: 'constituency_protest';
      issueKey: IssueKey;
      minConcern: number;
      chance: number;
      firstTurn: TurnNumber;
      lastTurn: TurnNumber;
    }
  | { kind: 'journalist_call'; chance: number; firstTurn: TurnNumber }
  | { kind: 'forecast_rebellion'; fractionOfMajority: number; maxWeeksBeforeDivision: number }
  | { kind: 'engine' };
export const EventTriggerSchema: z.ZodType<EventTrigger> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('whips_suspect_waverer'),
    chance: z.number().min(0).max(1),
    maxWeeksBeforeDivision: z.number().int().min(0),
  }),
  z.object({
    kind: z.literal('constituency_protest'),
    issueKey: IssueKeySchema,
    minConcern: z.number(),
    chance: z.number().min(0).max(1),
    firstTurn: z.number().int(),
    lastTurn: z.number().int(),
  }),
  z.object({
    kind: z.literal('journalist_call'),
    chance: z.number().min(0).max(1),
    firstTurn: z.number().int(),
  }),
  z.object({
    kind: z.literal('forecast_rebellion'),
    fractionOfMajority: z.number().min(0),
    maxWeeksBeforeDivision: z.number().int().min(0),
  }),
  z.object({ kind: z.literal('engine') }),
]);

export interface EventDefinition {
  key: EventKey;
  title: string;
  /** Body template; placeholders: {addressee} {bill} {office} {subject} {date}. */
  body: string;
  /** `player`: only the player; `npc`: only NPCs (informational for the player); `any`. */
  audience: 'player' | 'npc' | 'any';
  trigger: EventTrigger;
  cooldownWeeks: number;
  expiresAfterWeeks: number;
  defaultOptionKey: string;
  options: EventOptionDefinition[];
}
export const EventDefinitionSchema: z.ZodType<EventDefinition> = z.object({
  key: EventKeySchema,
  title: z.string().min(1),
  body: z.string().min(1),
  audience: z.enum(['player', 'npc', 'any']),
  trigger: EventTriggerSchema,
  cooldownWeeks: z.number().int().min(0),
  expiresAfterWeeks: z.number().int().min(0),
  defaultOptionKey: z.string(),
  options: z.array(EventOptionDefinitionSchema).min(1),
});
