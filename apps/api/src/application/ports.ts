import type {
  CampaignSummary,
  ErrorCode,
  TurnReport,
  TutorialState,
  TutorialUpdate,
} from '@whip/contracts';
import type {
  ActionRequest,
  CancelActionResponse,
  HistoryPage,
  HistoryQuery,
  HistoryType,
  PlanActionResponse,
  PoliticianListQuery,
} from './dto';
import type { HistoryRowInput, PlayerSetup, ScenarioKey } from './engine';

/* ----------------------------------------------------------------------------
 * Platform services
 * ------------------------------------------------------------------------- */

export interface Clock {
  /** ISO-8601 UTC timestamp. */
  nowIso(): string;
}

export interface IdGenerator {
  campaignId(): string;
  /** uint32 seed for new campaigns. */
  seed(): number;
}

export type Sha256Hex = (input: string) => Promise<string>;

/* ----------------------------------------------------------------------------
 * Typed results across the DO RPC boundary (errors are data: classes don't survive RPC)
 * ------------------------------------------------------------------------- */

export interface DoError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type DoResult<T> = { ok: true; value: T } | { ok: false; error: DoError };

export const ok = <T>(value: T): DoResult<T> => ({ ok: true, value });
export const fail = <T = never>(
  code: ErrorCode,
  message: string,
  details?: unknown,
): DoResult<T> => ({
  ok: false,
  error: details === undefined ? { code, message } : { code, message, details },
});

/** What the Worker writes into the D1 campaign index after a DO commit. */
export interface CampaignProjection {
  revision: number;
  turn: number;
  simDate: string;
  updatedAt: string;
}

export interface MutationValue<T> {
  response: T;
  projection: CampaignProjection;
  /** true when served from the idempotency table (no new revision). */
  replayed: boolean;
}

/** initialise() result: the summary plus the player's politician id (for the D1 index). */
export type InitialisedCampaign = CampaignSummary & { playerPoliticianId: string };

export interface InitialiseInput {
  campaignId: string;
  ownerId: string;
  name: string;
  scenarioKey: ScenarioKey;
  seed: number;
  player: PlayerSetup;
  createdAt: string;
  /**
   * Initial tutorial `enabled` (CreateCampaignRequest.tutorial, default true), written in the
   * revision-1 commit. Not part of the initialise hash: the create Idempotency-Key hash covers it.
   */
  tutorial?: boolean;
}

export interface MutationEnvelope {
  idempotencyKey: string;
  expectedRevision: number;
}

export type ViewRequest =
  | { kind: 'state' }
  | { kind: 'catalogue' }
  | { kind: 'parliament' }
  | { kind: 'party' }
  | { kind: 'politicians'; query: PoliticianListQuery }
  | { kind: 'politician'; politicianId: string }
  /** The TurnReport stored by the latest advance (NOT_FOUND before the first). */
  | { kind: 'turn_report' };

export type ViewValue =
  { notModified: true; revision: number } | { notModified: false; revision: number; data: unknown };

export interface HistoryValue {
  revision: number;
  page: HistoryPage;
}

export interface RestoreValue {
  revision: number;
  restoredFrom: number;
  projection: CampaignProjection;
}

/** RPC surface of the Campaign DO, as seen by the Worker's application services. */
export interface CampaignDoClient {
  initialise(input: InitialiseInput): Promise<DoResult<InitialisedCampaign>>;
  getView(req: ViewRequest, ifRevision?: number): Promise<DoResult<ViewValue>>;
  planAction(
    input: MutationEnvelope & { action: ActionRequest },
  ): Promise<DoResult<MutationValue<PlanActionResponse>>>;
  cancelAction(
    input: MutationEnvelope & { plannedActionId: string },
  ): Promise<DoResult<MutationValue<CancelActionResponse>>>;
  advance(input: MutationEnvelope): Promise<DoResult<MutationValue<TurnReport>>>;
  history(
    query: HistoryQuery,
    ifRevision?: number,
  ): Promise<DoResult<HistoryValue | { notModified: true; revision: number }>>;
  restore(input: { revision: number; expectedRevision: number }): Promise<DoResult<RestoreValue>>;
  /** Tutorial progress (meta table, outside revisions). NOT_FOUND when the campaign doesn't exist. */
  getTutorial(): Promise<DoResult<TutorialState>>;
  /** Merges an update (serialised with mutations); never bumps the revision. */
  updateTutorial(update: TutorialUpdate): Promise<DoResult<TutorialState>>;
  destroy(): Promise<void>;
}

export interface CampaignDoGateway {
  get(campaignId: string): CampaignDoClient;
}

/* ----------------------------------------------------------------------------
 * CampaignStore — the DO's persistence (SQLite in prod, in-memory in unit tests)
 * ------------------------------------------------------------------------- */

export interface CampaignMetaRecord {
  campaignId: string;
  ownerId: string;
  name: string;
  scenarioKey: string;
  playerName: string;
  playerPoliticianId: string;
  createdAt: string;
  updatedAt: string;
  /** SHA-256 of the canonical InitialiseInput (retried creates must match). Absent on old saves. */
  initialiseHash?: string;
}

export interface RevisionRecord {
  revision: number;
  turn: number;
  simDate: string;
  reason: string;
  stateHash: string;
  byteSize: number;
  chunkCount: number;
  simulationVersion: number;
  createdAt: string;
}

export interface StoredIdempotency {
  requestHash: string;
  response: string;
  revision: number;
}

export interface CommitRequest {
  /** null ⇒ the campaign must not exist yet (initialise). */
  expectedRevision: number | null;
  revision: RevisionRecord;
  /** Encoded snapshot chunks, or reuse the chunks of an existing revision (restore). */
  snapshot: { chunks: Uint8Array[] } | { copyFromRevision: number };
  history: HistoryRowInput[];
  /** Restore: delete history rows and turn reports with revision > this, in the same transaction. */
  deleteHistoryAfterRevision?: number;
  idempotency?: { key: string; requestHash: string; response: string };
  /** TurnReport produced by this revision (advance); becomes the latest turn report. */
  turnReport?: StoredTurnReportBody;
  meta: CampaignMetaRecord;
  /** Initialise only: initial tutorial state, written to `meta.tutorial` in the same transaction. */
  tutorial?: TutorialState;
  /** Keep this many most recent revisions; older ones (and their chunks) are pruned. */
  retainRevisions: number;
  /** Idempotency rows created before this ISO timestamp are pruned. */
  pruneIdempotencyBefore?: string;
}

export type CommitResult =
  | { status: 'committed' }
  | { status: 'conflict'; currentRevision: number | null }
  | { status: 'replay'; stored: StoredIdempotency };

/**
 * A stored TurnReport: plain JSON, or — when larger than a single SQLite row allows — gzip chunks
 * (same codec as snapshots) with the SHA-256 of the JSON.
 */
export type StoredTurnReportBody = { json: string } | { chunks: Uint8Array[]; hash: string };

export type StoredTurnReport = StoredTurnReportBody & { revision: number };

export interface HistoryRow {
  seq: number;
  revision: number;
  turn: number;
  simDate: string;
  type: HistoryType;
  importance: number;
  actorIds: string[];
  subjectIds: string[];
  title: string;
  summary: string;
}

export interface StoreHistoryQuery {
  /** Exclusive upper bound on seq (newest first). */
  beforeSeq?: number;
  limit: number;
  type?: HistoryType;
  politicianId?: string;
  minImportance?: number;
  fromTurn?: number;
}

export interface CampaignStore {
  getMeta(): CampaignMetaRecord | null;
  currentRevision(): number | null;
  getRevision(revision: number): RevisionRecord | null;
  readChunks(revision: number): Uint8Array[];
  findIdempotency(key: string): StoredIdempotency | null;
  /** Synchronous and atomic: all of it or none of it. Re-checks revision + idempotency inside. */
  commit(request: CommitRequest): CommitResult;
  history(query: StoreHistoryQuery): HistoryRow[];
  /** The newest stored turn report, or null before the first advance. */
  latestTurnReport(): StoredTurnReport | null;
  /** Raw `meta.tutorial` JSON, or null when nothing is stored. */
  getTutorialJson(): string | null;
  /** Writes `meta.tutorial` only (no revision, no snapshot). */
  setTutorialJson(json: string): void;
  destroy(): Promise<void>;
}

export interface EncodedSnapshot {
  chunks: Uint8Array[];
  stateHash: string;
  /** Compressed size in bytes. */
  byteSize: number;
}

export interface SnapshotCodec {
  encode(json: string): Promise<EncodedSnapshot>;
  /** Throws SnapshotIntegrityError when decompression or the SHA-256 check fails. */
  decode(chunks: Uint8Array[], expectedHash: string): Promise<string>;
}

export class SnapshotIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotIntegrityError';
  }
}

/* ----------------------------------------------------------------------------
 * CampaignIndex — D1 projection + ownership
 * ------------------------------------------------------------------------- */

export interface CampaignIndexRecord {
  id: string;
  ownerId: string;
  name: string;
  scenarioKey: string;
  status: 'initialising' | 'active';
  revision: number;
  simDate: string | null;
  turn: number;
  playerName: string | null;
  playerPoliticianId: string | null;
  simulationVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignIndexPage {
  items: CampaignIndexRecord[];
  nextCursor: string | null;
}

export interface CampaignIndex {
  /** Active, non-deleted campaigns, newest `updatedAt` first, cursor over (updated_at, id). */
  listForOwner(
    ownerId: string,
    page: { cursor?: string; limit: number },
  ): Promise<CampaignIndexPage>;
  /** Non-deleted row (any status) or null. */
  get(id: string): Promise<CampaignIndexRecord | null>;
  /**
   * Inserts the `initialising` row. With `createKey`, returns `'duplicate_key'` (and inserts
   * nothing) when the owner already has a row — of any status, deleted or not — with that key.
   */
  insertInitialising(record: {
    id: string;
    ownerId: string;
    name: string;
    scenarioKey: string;
    simulationVersion: number;
    createdAt: string;
    createKey?: string;
    createRequestHash?: string;
  }): Promise<'inserted' | 'duplicate_key'>;
  /** Row (deleted or not) created by `ownerId` with this create Idempotency-Key. */
  findByCreateKey(ownerId: string, createKey: string): Promise<CreateKeyMatch | null>;
  activate(summary: CampaignSummary & { playerPoliticianId: string | null }): Promise<void>;
  /** Guarded: only applies when the stored revision is older (`WHERE revision < ?`). */
  upsertProjection(id: string, projection: CampaignProjection): Promise<void>;
  softDelete(id: string, at: string): Promise<void>;
  /** Records that the DO storage of a soft-deleted campaign has been wiped. */
  confirmWipe(id: string, at: string): Promise<void>;
  /** `initialising`, non-deleted rows created before `createdBefore` (oldest first). */
  listStaleInitialising(createdBefore: string, limit: number): Promise<string[]>;
  /** Soft-deleted rows whose DO wipe is not confirmed (oldest deletion first). */
  listUnconfirmedWipes(limit: number): Promise<string[]>;
  /** Removes the row entirely (orphaned `initialising` rows only). */
  hardDelete(id: string): Promise<void>;
}

export interface CreateKeyMatch {
  record: CampaignIndexRecord;
  requestHash: string | null;
  deleted: boolean;
}

export class InvalidCursorError extends Error {
  constructor() {
    super('Invalid cursor.');
    this.name = 'InvalidCursorError';
  }
}
