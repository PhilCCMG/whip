import { z } from 'zod';
import { PlannedActionSchema, type PlannedAction } from './actions';
import {
  BriefingSchema,
  HistoryRecordSchema,
  KnowledgeSchema,
  NotificationSchema,
  type Briefing,
  type HistoryRecord,
  type Knowledge,
  type Notification,
} from './chronicle';
import { PlayerSetupSchema, type PlayerSetup } from './content';
import { ScheduledEffectSchema, type ScheduledEffect } from './effects';
import { EventInstanceSchema, type EventInstance } from './events';
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
  entityTableSchema,
  GovernmentSchema,
  ParliamentSchema,
  type EntityTable,
  type Government,
  type Parliament,
} from './parliament';
import {
  ConstituencySchema,
  FactionSchema,
  PartySchema,
  PoliticianSchema,
  type Constituency,
  type Faction,
  type Party,
  type Politician,
} from './politics';
import { RelationshipTableSchema, type RelationshipTable } from './relationship';
import { SimDateValueSchema, type SimDate } from './sim-date';

/** sfc32 state: four uint32 words. */
export type RngState = [number, number, number, number];
const uint32 = z.number().int().min(0).max(0xffffffff);
export const RngStateSchema: z.ZodType<RngState> = z.tuple([uint32, uint32, uint32, uint32]);

export interface GameMeta {
  /** Shape version of this object (save compatibility). */
  schemaVersion: number;
  /** Rules version that last advanced this state. */
  simulationVersion: number;
  contentVersion: number;
  scenarioKey: string;
  /** Root seed (uint32). */
  seed: number;
  /** The week currently being planned (turn 1 = first week). */
  turn: TurnNumber;
  /** Monday of the current week. */
  date: SimDate;
  /** Root RNG state; phase streams are forked from it by (turn, phaseKey). */
  rng: RngState;
  /** Deterministic id factory counters per prefix. */
  idCounters: Record<string, number>;
  /** Last allocated history sequence number. */
  historySeq: number;
}
export const GameMetaSchema: z.ZodType<GameMeta> = z.strictObject({
  schemaVersion: z.number().int().min(1),
  simulationVersion: z.number().int().min(1),
  contentVersion: z.number().int().min(1),
  scenarioKey: z.string().min(1),
  seed: uint32,
  turn: z.number().int().min(1),
  date: SimDateValueSchema,
  rng: RngStateSchema,
  idCounters: z.record(z.string(), z.number().int().min(0)),
  historySeq: z.number().int().min(0),
});

export interface PlayerState {
  politicianId: PoliticianId;
  /** Diary for the current week, resolved on advance. */
  plannedActions: PlannedAction[];
  /** Base diary slots per week (scheduled `diary.adjust_slots` effects modify a given week). */
  diarySlots: number;
  knowledge: Knowledge;
  setup: PlayerSetup;
}
export const PlayerStateSchema: z.ZodType<PlayerState> = z.strictObject({
  politicianId: PoliticianIdSchema,
  plannedActions: z.array(PlannedActionSchema),
  diarySlots: z.number().int().min(0),
  knowledge: KnowledgeSchema,
  setup: PlayerSetupSchema,
});

export interface PromotionRequest {
  politicianId: PoliticianId;
  turn: TurnNumber;
}

/** Careers bookkeeping (07 §4.3). */
export interface CareersState {
  /** Requests filed this turn, resolved in the Careers phase. */
  promotionRequests: PromotionRequest[];
  /** Cooldown tracking for request_promotion. */
  lastPromotionRequestTurn: Record<PoliticianId, TurnNumber>;
  /** Set by call_reshuffle; the Careers phase of that turn reshuffles. */
  reshuffleRequestedTurn: TurnNumber | null;
  lastReshuffleTurn: TurnNumber | null;
}
export const CareersStateSchema: z.ZodType<CareersState> = z.strictObject({
  promotionRequests: z.array(
    z.strictObject({ politicianId: PoliticianIdSchema, turn: z.number().int().min(0) }),
  ),
  lastPromotionRequestTurn: z.record(z.string(), z.number().int().min(0)),
  reshuffleRequestedTurn: z.number().int().nullable(),
  lastReshuffleTurn: z.number().int().nullable(),
});

export interface PublicOpinion {
  /** National vote intention 0..1 per party. */
  polls: Record<PartyId, number>;
  /** −100..100 */
  governmentApproval: number;
}
export const PublicOpinionSchema: z.ZodType<PublicOpinion> = z.strictObject({
  polls: z.record(z.string(), z.number().min(0).max(1)),
  governmentApproval: z.number().min(-100).max(100),
});

export interface EventsState {
  pending: EventInstance[];
  /** `eventKey` or `eventKey:addresseeId` → turn until which it may not fire again. */
  cooldowns: Record<string, TurnNumber>;
}
export const EventsStateSchema: z.ZodType<EventsState> = z.strictObject({
  pending: z.array(EventInstanceSchema),
  cooldowns: z.record(z.string(), z.number().int()),
});

/** The canonical simulation state, serialised as one snapshot (doc 02 §3). */
export interface GameState {
  meta: GameMeta;
  player: PlayerState;
  politicians: EntityTable<PoliticianId, Politician>;
  parties: EntityTable<PartyId, Party>;
  factions: EntityTable<FactionId, Faction>;
  constituencies: EntityTable<ConstituencyId, Constituency>;
  relationships: RelationshipTable;
  parliament: Parliament;
  government: Government;
  opinion: PublicOpinion;
  events: EventsState;
  /** Delayed effects queue, ordered by (dueTurn, id). */
  scheduled: ScheduledEffect[];
  careers: CareersState;
  /** Ring buffer (last ~12 weeks) for AI memory and the UI; full history is persisted outside. */
  recentHistory: HistoryRecord[];
  /** Player inbox (newest last; capped). */
  inbox: Notification[];
  /** The most recent weekly briefing. */
  briefing: Briefing;
}

export const GameStateSchema: z.ZodType<GameState> = z.strictObject({
  meta: GameMetaSchema,
  player: PlayerStateSchema,
  politicians: entityTableSchema(PoliticianIdSchema, PoliticianSchema),
  parties: entityTableSchema(PartyIdSchema, PartySchema),
  factions: entityTableSchema(FactionIdSchema, FactionSchema),
  constituencies: entityTableSchema(ConstituencyIdSchema, ConstituencySchema),
  relationships: RelationshipTableSchema,
  parliament: ParliamentSchema,
  government: GovernmentSchema,
  opinion: PublicOpinionSchema,
  events: EventsStateSchema,
  scheduled: z.array(ScheduledEffectSchema),
  careers: CareersStateSchema,
  recentHistory: z.array(HistoryRecordSchema),
  inbox: z.array(NotificationSchema),
  briefing: BriefingSchema,
});

export const RECENT_HISTORY_TURNS = 12;
export const MAX_RECENT_HISTORY = 400;
