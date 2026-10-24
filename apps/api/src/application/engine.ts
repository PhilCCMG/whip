import type {
  CampaignSummary,
  CareerOverview,
  CreateCampaignRequest,
  ParliamentView,
  PartyView,
  PoliticianProfile,
  ScenarioKeySchema,
  TurnReport,
} from '@whip/contracts';
import type { z } from 'zod';
import type {
  ActionCatalogueResponse,
  ActionRequest,
  Diary,
  HistoryType,
  PoliticianListQuery,
  PoliticianListResponse,
} from './dto';

/**
 * Ports onto the pure engine (`@whip/simulation`, docs/architecture/07-vertical-slice.md §5) and the
 * GameState → DTO projections. The API never inspects game state itself: `S` (GameState), `R` (the
 * engine's SimulationResult) and `H` (HistoryRecord) are opaque type parameters at this layer.
 *
 * Implementations are selected in `src/composition.ts` (real engine vs. the test-only FakeEngine).
 */

export type ScenarioKey = z.infer<typeof ScenarioKeySchema>;
export type PlayerSetup = CreateCampaignRequest['player'];

export interface EngineCreateInput {
  scenarioKey: ScenarioKey;
  /** uint32 seed; the API picks one when the client doesn't. */
  seed: number;
  player: PlayerSetup;
}

/** The few facts the persistence layer needs about any state (revision rows, D1 projection). */
export interface EngineStateMeta {
  turn: number;
  /** ISO YYYY-MM-DD in-game date. */
  simDate: string;
  playerPoliticianId: string;
  playerName: string;
}

export type EnginePlanResult<S> =
  { ok: true; state: S; plannedActionId: string } | { ok: false; reasons: string[] };

export interface EngineAdvanceOutput<S, R, H> {
  state: S;
  /** Append-only records to persist in the DO `history` table. */
  history: readonly H[];
  /** The engine's full SimulationResult (outcomes, notifications, events…), fed to `turnReport`. */
  result: R;
}

export interface EngineCreateOutput<S, H> {
  state: S;
  history: readonly H[];
}

export interface Engine<S, R = unknown, H = unknown> {
  /** SIMULATION_VERSION (rules version) recorded on every revision. */
  readonly version: number;
  /** createCampaignState — resolve the scenario + build SimulationContext internally. */
  create(input: EngineCreateInput): EngineCreateOutput<S, H>;
  meta(state: S): EngineStateMeta;
  planAction(state: S, request: ActionRequest): EnginePlanResult<S>;
  /** null when no planned action has that id. */
  cancelPlannedAction(state: S, plannedActionId: string): S | null;
  /** advanceSimulation(state, [], ctx) — resolves the planned diary. */
  advance(state: S): EngineAdvanceOutput<S, R, H>;
  /** Canonical JSON (sorted keys) — hashed for integrity. */
  serialize(state: S): string;
  /** parse → migrate → validate; throws on an invalid save. */
  deserialize(json: string): S;
}

/** A history record as persisted (one `history` row + `history_subjects` rows). */
export interface HistoryRowInput {
  turn: number;
  simDate: string;
  type: HistoryType;
  importance: number; // 1..5
  actorIds: string[];
  subjectIds: string[];
  title: string;
  summary: string;
  /** Extra structured data kept for later features; never returned by the v1 API. */
  data?: unknown;
}

export interface Projections<S, R = unknown, H = unknown> {
  careerOverview(state: S, campaign: CampaignSummary): CareerOverview;
  actionCatalogue(state: S): ActionCatalogueResponse;
  parliament(state: S): ParliamentView;
  party(state: S): PartyView;
  politicianList(state: S, query: PoliticianListQuery): PoliticianListResponse;
  /** null ⇒ 404. */
  politicianProfile(state: S, politicianId: string): PoliticianProfile | null;
  /** Diary + capital, used by the plan/cancel action responses. */
  diary(state: S): { diary: Diary; politicalCapital: number };
  turnReport(input: {
    before: S;
    output: EngineAdvanceOutput<S, R, H>;
    revision: number;
  }): TurnReport;
  historyRecordsToRows(records: readonly H[]): HistoryRowInput[];
}

/** An engine + matching projections, bound to the same opaque types. */
export interface EngineRuntime<S, R = unknown, H = unknown> {
  engine: Engine<S, R, H>;
  projections: Projections<S, R, H>;
}
