/**
 * @whip/simulation — the pure, deterministic rules engine (docs/architecture/03-simulation-engine.md,
 * 07-vertical-slice.md §5).
 *
 * Rules enforced by ESLint: no Math.random / Date / performance / crypto / fetch / process / timers,
 * no React / Hono / cloudflare:* / drizzle-orm imports, and no @whip/content import outside tests
 * (content arrives via SimulationContext injection).
 */
export {
  SIMULATION_VERSION,
  STATE_SCHEMA_VERSION,
  PHASE_KEYS,
  SimulationVersionError,
  type PhaseKey,
  type SimulationContext,
  type SimulationResult,
  type DivisionReport,
} from './context';
export { createCampaignState, type CreateCampaignInput } from './world/create';
export {
  planAction,
  cancelPlannedAction,
  diaryCapacity,
  type PlanActionResult,
} from './actions/plan';
export { advanceSimulation } from './turn/advance';
export {
  serializeState,
  deserializeState,
  hashState,
  StateLoadError,
  type StateLoadErrorCode,
} from './state/serialize';
export { canonicalStringify } from './state/canonical';
export { checkInvariants, InvariantError, type InvariantViolation } from './invariants/check';
export {
  selectors,
  type ActionCatalogueItem,
  type CatalogueParam,
  type InfluenceView,
  type PendingEventView,
  type TargetOption,
} from './selectors';
export type {
  DivisionForecastView,
  KnownIntentionDetail,
  PartyForecast,
} from './selectors/divisions';

// Lower-level building blocks (tests, tools, future planners).
export { Rng, hashString, hashUnit } from './rng';
export { ACTIONS, parseAction } from './actions/catalogue';
export type { ActionDefinition, ParamDescriptor } from './actions/types';
export {
  voteUtility,
  decideVote,
  type VoteBreakdown,
  type VoteDecision,
  type VoteTerm,
} from './parliament/vote-utility';
export { VOTE, LOBBY } from './parliament/tuning';
export { UtilityMind, type PoliticianMind, type AiPlan, type MindEnv } from './ai/utility-mind';
export { forecastDivision, type DivisionForecast } from './ai/forecast';
export { capitalIncome, CAPITAL_CAP } from './careers/capital';
