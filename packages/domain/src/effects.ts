import { z } from 'zod';
import { EventSubjectsSchema, type EventSubjects } from './events';
import {
  BillIdSchema,
  DivisionIdSchema,
  EventInstanceIdSchema,
  FactionIdSchema,
  PoliticianIdSchema,
  ScheduledEffectIdSchema,
  type BillId,
  type DivisionId,
  type EventInstanceId,
  type FactionId,
  type PoliticianId,
  type ScheduledEffectId,
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
  type Vote,
} from './keys';
import { CAREER_ENTRY_KINDS, type CareerEntryKind } from './politics';
import { DECLARATION_SOURCES, type DeclarationSource } from './parliament';
import { MemoryKindSchema, type MemoryKind } from './relationship';

/**
 * Effects are data (ADR-0009). Actions, phases and events *emit* effects; one interpreter
 * (`applyEffect` in @whip/simulation) applies them. Every effect carries enough information to be
 * logged, scheduled and explained to the player.
 */

export interface MemorySpec {
  kind: MemoryKind;
  weight: number;
  decaysBy: number;
  refId: string | null;
}
export const MemorySpecSchema: z.ZodType<MemorySpec> = z.strictObject({
  kind: MemoryKindSchema,
  weight: z.number(),
  decaysBy: z.number().min(0),
  refId: z.string().nullable(),
});

export type Effect =
  /** Adjust the directional edge from → to (created from the derived default if absent). */
  | {
      kind: 'relationship.adjust';
      from: PoliticianId;
      to: PoliticianId;
      trust: number;
      respect: number;
      affinity: number;
      obligation: number;
      rivalry: number;
      memory: MemorySpec | null;
      reason: string;
    }
  | {
      kind: 'reputation.adjust';
      politicianId: PoliticianId;
      audience: Audience;
      delta: number;
      reason: string;
    }
  | { kind: 'capital.adjust'; politicianId: PoliticianId; delta: number; reason: string }
  | { kind: 'loyalty.adjust'; politicianId: PoliticianId; delta: number; reason: string }
  | { kind: 'local_standing.adjust'; politicianId: PoliticianId; delta: number; reason: string }
  /** Lobbying pressure on `targetId` for a division; positive = towards aye. */
  | {
      kind: 'division.pressure';
      divisionId: DivisionId;
      targetId: PoliticianId;
      sourceId: PoliticianId;
      delta: number;
      reason: string;
    }
  | {
      kind: 'division.declare';
      divisionId: DivisionId;
      politicianId: PoliticianId;
      vote: Vote;
      source: DeclarationSource;
    }
  | { kind: 'division.whip_intel'; divisionId: DivisionId; politicianId: PoliticianId; vote: Vote }
  | { kind: 'division.whip_attention'; divisionId: DivisionId; politicianId: PoliticianId }
  /** The player learns a politician's current voting intention (fog of war). */
  | {
      kind: 'knowledge.intention';
      politicianId: PoliticianId;
      divisionId: DivisionId;
      value: Vote;
      source: string;
    }
  /** An item for the player's political-intelligence feed. */
  | { kind: 'knowledge.intel'; text: string; politicianId: PoliticianId | null }
  | { kind: 'endorsement.add'; endorserId: PoliticianId; endorseeId: PoliticianId }
  | { kind: 'career.request_promotion'; politicianId: PoliticianId }
  | { kind: 'career.call_reshuffle'; politicianId: PoliticianId }
  | {
      kind: 'career.record';
      politicianId: PoliticianId;
      entryKind: CareerEntryKind;
      officeKey: OfficeKey | null;
      text: string;
    }
  | {
      kind: 'rebellion.record';
      politicianId: PoliticianId;
      divisionId: DivisionId;
      vote: Vote;
      whipLine: 'three_line' | 'two_line';
    }
  /** Scheduled after a division: compares the promiser's actual vote with the promise. */
  | {
      kind: 'promise.check';
      promiserId: PoliticianId;
      promiseeId: PoliticianId;
      divisionId: DivisionId;
      vote: Vote;
    }
  | { kind: 'government.stability'; delta: number; reason: string }
  | { kind: 'bill.amend'; billId: BillId; issueKey: IssueKey; stance: Stance; reason: string }
  | { kind: 'faction.cohesion'; factionId: FactionId; delta: number; reason: string }
  /** Changes the player's diary capacity for the turn in which it is due (scheduled). */
  | { kind: 'diary.adjust_slots'; politicianId: PoliticianId; delta: number; reason: string }
  | { kind: 'office.appoint'; officeKey: OfficeKey; politicianId: PoliticianId; reason: string }
  | {
      kind: 'office.vacate';
      officeKey: OfficeKey;
      reason: 'resigned' | 'sacked' | 'moved';
      note: string;
    }
  | {
      kind: 'event.raise';
      definitionKey: EventKey;
      addresseeId: PoliticianId;
      subjects: EventSubjects;
    }
  | { kind: 'event.resolve'; eventId: EventInstanceId; optionKey: string; expired: boolean };

export type EffectKind = Effect['kind'];

const pid = PoliticianIdSchema;
const reason = z.string();

export const EffectSchema: z.ZodType<Effect> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('relationship.adjust'),
    from: pid,
    to: pid,
    trust: z.number(),
    respect: z.number(),
    affinity: z.number(),
    obligation: z.number().int(),
    rivalry: z.number().int(),
    memory: MemorySpecSchema.nullable(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('reputation.adjust'),
    politicianId: pid,
    audience: AudienceSchema,
    delta: z.number(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('capital.adjust'),
    politicianId: pid,
    delta: z.number().int(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('loyalty.adjust'),
    politicianId: pid,
    delta: z.number(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('local_standing.adjust'),
    politicianId: pid,
    delta: z.number(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('division.pressure'),
    divisionId: DivisionIdSchema,
    targetId: pid,
    sourceId: pid,
    delta: z.number(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('division.declare'),
    divisionId: DivisionIdSchema,
    politicianId: pid,
    vote: VoteSchema,
    source: z.enum(DECLARATION_SOURCES),
  }),
  z.strictObject({
    kind: z.literal('division.whip_intel'),
    divisionId: DivisionIdSchema,
    politicianId: pid,
    vote: VoteSchema,
  }),
  z.strictObject({
    kind: z.literal('division.whip_attention'),
    divisionId: DivisionIdSchema,
    politicianId: pid,
  }),
  z.strictObject({
    kind: z.literal('knowledge.intention'),
    politicianId: pid,
    divisionId: DivisionIdSchema,
    value: VoteSchema,
    source: z.string(),
  }),
  z.strictObject({
    kind: z.literal('knowledge.intel'),
    text: z.string(),
    politicianId: pid.nullable(),
  }),
  z.strictObject({ kind: z.literal('endorsement.add'), endorserId: pid, endorseeId: pid }),
  z.strictObject({ kind: z.literal('career.request_promotion'), politicianId: pid }),
  z.strictObject({ kind: z.literal('career.call_reshuffle'), politicianId: pid }),
  z.strictObject({
    kind: z.literal('career.record'),
    politicianId: pid,
    entryKind: z.enum(CAREER_ENTRY_KINDS),
    officeKey: OfficeKeySchema.nullable(),
    text: z.string(),
  }),
  z.strictObject({
    kind: z.literal('rebellion.record'),
    politicianId: pid,
    divisionId: DivisionIdSchema,
    vote: VoteSchema,
    whipLine: z.enum(['three_line', 'two_line']),
  }),
  z.strictObject({
    kind: z.literal('promise.check'),
    promiserId: pid,
    promiseeId: pid,
    divisionId: DivisionIdSchema,
    vote: VoteSchema,
  }),
  z.strictObject({ kind: z.literal('government.stability'), delta: z.number(), reason }),
  z.strictObject({
    kind: z.literal('bill.amend'),
    billId: BillIdSchema,
    issueKey: IssueKeySchema,
    stance: StanceSchema,
    reason,
  }),
  z.strictObject({
    kind: z.literal('faction.cohesion'),
    factionId: FactionIdSchema,
    delta: z.number(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('diary.adjust_slots'),
    politicianId: pid,
    delta: z.number().int(),
    reason,
  }),
  z.strictObject({
    kind: z.literal('office.appoint'),
    officeKey: OfficeKeySchema,
    politicianId: pid,
    reason,
  }),
  z.strictObject({
    kind: z.literal('office.vacate'),
    officeKey: OfficeKeySchema,
    reason: z.enum(['resigned', 'sacked', 'moved']),
    note: z.string(),
  }),
  z.strictObject({
    kind: z.literal('event.raise'),
    definitionKey: EventKeySchema,
    addresseeId: pid,
    subjects: EventSubjectsSchema,
  }),
  z.strictObject({
    kind: z.literal('event.resolve'),
    eventId: EventInstanceIdSchema,
    optionKey: z.string(),
    expired: z.boolean(),
  }),
]);

/** Optional guard on a scheduled effect: if it no longer holds at due time, the effect is dropped. */
export type EffectCondition =
  | { kind: 'politician_sitting'; politicianId: PoliticianId }
  | { kind: 'division_held'; divisionId: DivisionId };
export const EffectConditionSchema: z.ZodType<EffectCondition> = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('politician_sitting'), politicianId: pid }),
  z.strictObject({ kind: z.literal('division_held'), divisionId: DivisionIdSchema }),
]);

export interface EffectSource {
  kind: 'action' | 'event' | 'engine';
  id: string;
}

/** Delayed effect (doc 03 §5). Queue order: (dueTurn, id). */
export interface ScheduledEffect {
  id: ScheduledEffectId;
  dueTurn: TurnNumber;
  effect: Effect;
  source: EffectSource;
  conditions: EffectCondition[];
}
export const ScheduledEffectSchema: z.ZodType<ScheduledEffect> = z.strictObject({
  id: ScheduledEffectIdSchema,
  dueTurn: z.number().int().min(0),
  effect: EffectSchema,
  source: z.strictObject({ kind: z.enum(['action', 'event', 'engine']), id: z.string() }),
  conditions: z.array(EffectConditionSchema),
});
