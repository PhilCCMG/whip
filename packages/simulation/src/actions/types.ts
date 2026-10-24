import type {
  ActionKind,
  ActionOutcomeStatus,
  ActionParamsByKind,
  Effect,
  EffectCondition,
  GameState,
  HistoryTemplateKey,
  IneligibilityReason,
  Politician,
} from '@whip/domain';
import type { z } from 'zod';
import type { TemplateVars } from '../chronicle/templates';
import type { SimulationContext } from '../context';
import type { Rng } from '../rng';
import type { TurnContext } from '../turn/context';

/** Describes one parameter so the UI can render a picker without knowing the rules. */
export interface ParamDescriptor {
  name: string;
  label: string;
  type: 'politician' | 'politicians' | 'bill' | 'division' | 'vote' | 'event_option';
  max?: number;
}

export interface ResolveEnv {
  ctx: SimulationContext;
  tc: TurnContext;
  rng: Rng;
}

export interface ScheduledSpec {
  effect: Effect;
  dueTurn: number;
  conditions: EffectCondition[];
}

/** What an action's `resolve` returns: effects as data, never mutation (ADR-0009). */
export interface ActionResolution {
  status: Exclude<ActionOutcomeStatus, 'rejected'>;
  /** Player-perspective sentence for the turn report. */
  summary: string;
  effects: Effect[];
  scheduled: ScheduledSpec[];
  history: {
    template: HistoryTemplateKey;
    vars: TemplateVars;
    importance: number;
    subjectIds: string[];
  } | null;
}

/** doc 03 §9 ActionDefinition. One definition serves both the player and NPCs. */
export interface ActionDefinition<K extends ActionKind> {
  kind: K;
  label: string;
  description: string;
  params: z.ZodType<ActionParamsByKind[K]>;
  paramDescriptors: ParamDescriptor[];
  /** Diary slots (time cost). */
  slots: number;
  /** Lower resolves first within a week. */
  priority: number;
  capitalCost(
    state: GameState,
    actor: Politician,
    p: ActionParamsByKind[K],
    ctx: SimulationContext,
  ): number;
  /** Capital cost shown in the catalogue before params are chosen. */
  baseCapitalCost: number;
  /** Position-based checks (office, status, party role) independent of params. */
  positionEligibility(
    state: GameState,
    actor: Politician,
    ctx: SimulationContext,
  ): IneligibilityReason[];
  /** Param-dependent checks (target validity, scheduled divisions, pending events…). */
  paramEligibility(
    state: GameState,
    actor: Politician,
    p: ActionParamsByKind[K],
    ctx: SimulationContext,
  ): IneligibilityReason[];
  /** "Meet Bernadette Walsh". */
  describe(state: GameState, p: ActionParamsByKind[K], ctx: SimulationContext): string;
  resolve(
    state: GameState,
    actor: Politician,
    p: ActionParamsByKind[K],
    env: ResolveEnv,
  ): ActionResolution;
}

export type ActionCatalogue = { [K in ActionKind]: ActionDefinition<K> };
