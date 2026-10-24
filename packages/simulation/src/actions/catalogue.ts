import {
  ACTION_KINDS,
  ACTION_PARAM_SCHEMAS,
  type ActionKind,
  type ActionParamsByKind,
  type GameState,
  type IneligibilityReason,
  type Politician,
  type ValidatedAction,
} from '@whip/domain';
import type { SimulationContext } from '../context';
import { callReshuffle, requestPromotion, respondToEvent } from './career-actions';
import { opposeLegislation, rebelAgainstParty, supportLegislation } from './legislation-actions';
import {
  buildRelationship,
  makePoliticalPromise,
  meetPolitician,
  seekEndorsement,
} from './relationship-actions';
import type { ActionCatalogue, ActionDefinition, ActionResolution, ResolveEnv } from './types';

/** The action catalogue (07 §4.1). The same definitions serve the player and NPCs. */
export const ACTIONS: ActionCatalogue = {
  meet_politician: meetPolitician,
  build_relationship: buildRelationship,
  seek_endorsement: seekEndorsement,
  make_political_promise: makePoliticalPromise,
  support_legislation: supportLegislation,
  oppose_legislation: opposeLegislation,
  rebel_against_party: rebelAgainstParty,
  request_promotion: requestPromotion,
  respond_to_event: respondToEvent,
  call_reshuffle: callReshuffle,
};

export function isActionKind(kind: unknown): kind is ActionKind {
  return typeof kind === 'string' && (ACTION_KINDS as readonly string[]).includes(kind);
}

export function getDefinition<K extends ActionKind>(kind: K): ActionDefinition<K> {
  return ACTIONS[kind];
}

export type ParseResult =
  { ok: true; action: ValidatedAction } | { ok: false; reasons: IneligibilityReason[] };

/** Validate untrusted params with the kind's Zod schema. */
export function parseAction(kind: unknown, params: unknown): ParseResult {
  if (!isActionKind(kind))
    return {
      ok: false,
      reasons: [{ code: 'invalid_params', message: `Unknown action "${String(kind)}".` }],
    };
  const parsed = ACTION_PARAM_SCHEMAS[kind].safeParse(params ?? {});
  if (!parsed.success) {
    return {
      ok: false,
      reasons: parsed.error.issues.map((i) => ({
        code: 'invalid_params' as const,
        message: i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message,
      })),
    };
  }
  return { ok: true, action: { kind, params: parsed.data } as ValidatedAction };
}

/*
 * Correlated-union helpers: `kind` and `params` stay linked through the generic K, so each call
 * is checked against the right definition without casts.
 */
type Typed<K extends ActionKind> = { kind: K; params: ActionParamsByKind[K] };

export function eligibilityOf<K extends ActionKind>(
  state: GameState,
  actor: Politician,
  a: Typed<K>,
  ctx: SimulationContext,
): IneligibilityReason[] {
  const def: ActionDefinition<K> = ACTIONS[a.kind];
  return [
    ...def.positionEligibility(state, actor, ctx),
    ...def.paramEligibility(state, actor, a.params, ctx),
  ];
}

export function capitalCostOf<K extends ActionKind>(
  state: GameState,
  actor: Politician,
  a: Typed<K>,
  ctx: SimulationContext,
): number {
  const def: ActionDefinition<K> = ACTIONS[a.kind];
  return def.capitalCost(state, actor, a.params, ctx);
}

export function describeAction<K extends ActionKind>(
  state: GameState,
  a: Typed<K>,
  ctx: SimulationContext,
): string {
  const def: ActionDefinition<K> = ACTIONS[a.kind];
  return def.describe(state, a.params, ctx);
}

export function resolveAction<K extends ActionKind>(
  state: GameState,
  actor: Politician,
  a: Typed<K>,
  env: ResolveEnv,
): ActionResolution {
  const def: ActionDefinition<K> = ACTIONS[a.kind];
  return def.resolve(state, actor, a.params, env);
}

/** Identity used to stop the same action being planned twice in one week. */
export function actionDedupKey(a: ValidatedAction): string {
  switch (a.kind) {
    case 'meet_politician':
    case 'build_relationship':
    case 'seek_endorsement':
      return `${a.kind}:${a.params.targetId}`;
    case 'make_political_promise':
      return `${a.kind}:${a.params.targetId}:${a.params.divisionId}`;
    case 'support_legislation':
    case 'oppose_legislation':
      return `legislation:${a.params.billId}`;
    case 'rebel_against_party':
      return `${a.kind}:${a.params.divisionId}`;
    case 'respond_to_event':
      return `${a.kind}:${a.params.eventId}`;
    case 'request_promotion':
    case 'call_reshuffle':
      return a.kind;
  }
}

/** Target politician of an action, if it has one (for intel and AI memory). */
export function actionTarget(a: ValidatedAction): Politician['id'] | null {
  switch (a.kind) {
    case 'meet_politician':
    case 'build_relationship':
    case 'seek_endorsement':
    case 'make_political_promise':
      return a.params.targetId;
    default:
      return null;
  }
}
