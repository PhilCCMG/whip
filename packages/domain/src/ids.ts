import { z } from 'zod';
import type { Brand } from './brand';

/*
 * Branded entity IDs. Scenario-authored entities use readable content-style keys
 * (`party.npp`, `faction.heartlands`, `con.ashby_and_wold`, `bill.housing_delivery`); generated
 * entities use `prefix_NNNN` from the deterministic id factory (`pol_0042`, `evt_0003`).
 * IDs are stable for the life of a campaign.
 */
export type PoliticianId = Brand<string, 'PoliticianId'>;
export type PartyId = Brand<string, 'PartyId'>;
export type FactionId = Brand<string, 'FactionId'>;
export type ConstituencyId = Brand<string, 'ConstituencyId'>;
export type BillId = Brand<string, 'BillId'>;
export type DivisionId = Brand<string, 'DivisionId'>;
export type EventInstanceId = Brand<string, 'EventInstanceId'>;
export type PlannedActionId = Brand<string, 'PlannedActionId'>;
export type ScheduledEffectId = Brand<string, 'ScheduledEffectId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type HistoryRecordId = Brand<string, 'HistoryRecordId'>;

/** Integer week index since campaign start (turn 1 = first week). */
export type TurnNumber = number;

const isId = (v: unknown): boolean => typeof v === 'string' && v.length > 0 && v.length <= 64;

/** Schema factory for a branded id (validation only, no transform, so input = output type). */
export function idSchema<T extends string>(name: string): z.ZodType<T> {
  return z.custom<T>(isId, `Expected ${name}`);
}

export const PoliticianIdSchema = idSchema<PoliticianId>('PoliticianId');
export const PartyIdSchema = idSchema<PartyId>('PartyId');
export const FactionIdSchema = idSchema<FactionId>('FactionId');
export const ConstituencyIdSchema = idSchema<ConstituencyId>('ConstituencyId');
export const BillIdSchema = idSchema<BillId>('BillId');
export const DivisionIdSchema = idSchema<DivisionId>('DivisionId');
export const EventInstanceIdSchema = idSchema<EventInstanceId>('EventInstanceId');
export const PlannedActionIdSchema = idSchema<PlannedActionId>('PlannedActionId');
export const ScheduledEffectIdSchema = idSchema<ScheduledEffectId>('ScheduledEffectId');
export const NotificationIdSchema = idSchema<NotificationId>('NotificationId');
export const HistoryRecordIdSchema = idSchema<HistoryRecordId>('HistoryRecordId');
export const TurnNumberSchema = z.number().int().min(0);

/** Prefixes used by the id factory for generated entities. */
export const ID_PREFIX = {
  politician: 'pol',
  constituency: 'con',
  event: 'evt',
  plannedAction: 'act',
  scheduled: 'sch',
  notification: 'ntf',
  history: 'his',
  division: 'div',
} as const;
export type IdPrefix = (typeof ID_PREFIX)[keyof typeof ID_PREFIX];
