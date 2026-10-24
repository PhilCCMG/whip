import { z } from 'zod';
import {
  BillIdSchema,
  DivisionIdSchema,
  EventInstanceIdSchema,
  PlannedActionIdSchema,
  PoliticianIdSchema,
  type BillId,
  type DivisionId,
  type EventInstanceId,
  type PlannedActionId,
  type PoliticianId,
  type TurnNumber,
} from './ids';
import { VoteSchema, type Vote } from './keys';

/** Diary action kinds. Values match @whip/contracts ActionKindSchema. */
export const ACTION_KINDS = [
  'meet_politician',
  'build_relationship',
  'seek_endorsement',
  'make_political_promise',
  'support_legislation',
  'oppose_legislation',
  'rebel_against_party',
  'request_promotion',
  'respond_to_event',
  'call_reshuffle',
] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];
export const ActionKindSchema = z.enum(ACTION_KINDS);

/* ----------------------------------------------------------------------------
 * Parameter schemas (one per kind). The engine validates untrusted params with these.
 * ------------------------------------------------------------------------- */

export interface TargetParams {
  targetId: PoliticianId;
}
export const TargetParamsSchema: z.ZodType<TargetParams> = z.object({
  targetId: PoliticianIdSchema,
});

export interface PromiseParams {
  targetId: PoliticianId;
  divisionId: DivisionId;
  vote: Vote;
}
export const PromiseParamsSchema: z.ZodType<PromiseParams> = z.object({
  targetId: PoliticianIdSchema,
  divisionId: DivisionIdSchema,
  vote: VoteSchema,
});

export const MAX_LOBBY_TARGETS = 3;
export interface LegislationParams {
  billId: BillId;
  lobbyTargetIds: PoliticianId[];
}
export const LegislationParamsSchema: z.ZodType<LegislationParams> = z.object({
  billId: BillIdSchema,
  lobbyTargetIds: z
    .array(PoliticianIdSchema)
    .max(MAX_LOBBY_TARGETS, `At most ${MAX_LOBBY_TARGETS} lobbying targets`)
    .default([]),
});

export interface RebelParams {
  divisionId: DivisionId;
  vote: 'no' | 'abstain';
}
export const RebelParamsSchema: z.ZodType<RebelParams> = z.object({
  divisionId: DivisionIdSchema,
  vote: z.enum(['no', 'abstain']),
});

export type EmptyParams = Record<string, never>;
export const EmptyParamsSchema: z.ZodType<EmptyParams> = z.object({});

export interface RespondToEventParams {
  eventId: EventInstanceId;
  optionKey: string;
}
export const RespondToEventParamsSchema: z.ZodType<RespondToEventParams> = z.object({
  eventId: EventInstanceIdSchema,
  optionKey: z.string().min(1),
});

/** Map from kind to its validated params type. */
export interface ActionParamsByKind {
  meet_politician: TargetParams;
  build_relationship: TargetParams;
  seek_endorsement: TargetParams;
  make_political_promise: PromiseParams;
  support_legislation: LegislationParams;
  oppose_legislation: LegislationParams;
  rebel_against_party: RebelParams;
  request_promotion: EmptyParams;
  respond_to_event: RespondToEventParams;
  call_reshuffle: EmptyParams;
}

export const ACTION_PARAM_SCHEMAS: { [K in ActionKind]: z.ZodType<ActionParamsByKind[K]> } = {
  meet_politician: TargetParamsSchema,
  build_relationship: TargetParamsSchema,
  seek_endorsement: TargetParamsSchema,
  make_political_promise: PromiseParamsSchema,
  support_legislation: LegislationParamsSchema,
  oppose_legislation: LegislationParamsSchema,
  rebel_against_party: RebelParamsSchema,
  request_promotion: EmptyParamsSchema,
  respond_to_event: RespondToEventParamsSchema,
  call_reshuffle: EmptyParamsSchema,
};

/** Untrusted request (actor = the player when it comes through the API). */
export interface ActionRequest {
  kind: ActionKind;
  params: unknown;
}

/** A request whose params have been validated, as a discriminated union on `kind`. */
export type ValidatedAction = {
  [K in ActionKind]: { kind: K; params: ActionParamsByKind[K] };
}[ActionKind];

export interface PlannedActionBase {
  id: PlannedActionId;
  actorId: PoliticianId;
  turn: TurnNumber;
  /** Human-readable, e.g. "Meet Bernadette Walsh". */
  label: string;
  slots: number;
  /** Capital reserved when planned (player) or to be spent on resolution (NPC). */
  capitalCost: number;
  source: 'player' | 'ai';
  /** Top reasons from the utility AI (empty for the player). */
  reasons: string[];
}

export type PlannedAction = PlannedActionBase & ValidatedAction;

const baseShape = {
  id: PlannedActionIdSchema,
  actorId: PoliticianIdSchema,
  turn: z.number().int().min(0),
  label: z.string(),
  slots: z.number().int().min(0),
  capitalCost: z.number().int().min(0),
  source: z.enum(['player', 'ai']),
  reasons: z.array(z.string()),
};

export const PlannedActionSchema: z.ZodType<PlannedAction> = z.discriminatedUnion('kind', [
  z.strictObject({ ...baseShape, kind: z.literal('meet_politician'), params: TargetParamsSchema }),
  z.strictObject({
    ...baseShape,
    kind: z.literal('build_relationship'),
    params: TargetParamsSchema,
  }),
  z.strictObject({ ...baseShape, kind: z.literal('seek_endorsement'), params: TargetParamsSchema }),
  z.strictObject({
    ...baseShape,
    kind: z.literal('make_political_promise'),
    params: PromiseParamsSchema,
  }),
  z.strictObject({
    ...baseShape,
    kind: z.literal('support_legislation'),
    params: LegislationParamsSchema,
  }),
  z.strictObject({
    ...baseShape,
    kind: z.literal('oppose_legislation'),
    params: LegislationParamsSchema,
  }),
  z.strictObject({
    ...baseShape,
    kind: z.literal('rebel_against_party'),
    params: RebelParamsSchema,
  }),
  z.strictObject({ ...baseShape, kind: z.literal('request_promotion'), params: EmptyParamsSchema }),
  z.strictObject({
    ...baseShape,
    kind: z.literal('respond_to_event'),
    params: RespondToEventParamsSchema,
  }),
  z.strictObject({ ...baseShape, kind: z.literal('call_reshuffle'), params: EmptyParamsSchema }),
]);

/** Why an action can't be taken. `message` is shown to the player verbatim. */
export interface IneligibilityReason {
  code:
    | 'invalid_params'
    | 'not_sitting_mp'
    | 'invalid_target'
    | 'self_target'
    | 'not_eligible_position'
    | 'insufficient_capital'
    | 'insufficient_slots'
    | 'cooldown'
    | 'division_not_scheduled'
    | 'bill_not_before_house'
    | 'not_whipped'
    | 'event_not_pending'
    | 'duplicate'
    | 'not_player_turn';
  message: string;
}

export const ACTION_OUTCOME_STATUSES = ['succeeded', 'partial', 'failed', 'rejected'] as const;
export type ActionOutcomeStatus = (typeof ACTION_OUTCOME_STATUSES)[number];

/** Result of one submitted action, matches contracts' ActionOutcome. */
export interface ActionOutcome {
  plannedActionId: PlannedActionId | null;
  actorId: PoliticianId;
  kind: ActionKind;
  label: string;
  status: ActionOutcomeStatus;
  summary: string;
  /** Human-readable effect lines, e.g. "Bernadette Walsh: trust +6". */
  effects: string[];
}
