import type { CampaignSummary, HistoryItem, TurnReport } from '@whip/contracts';
import { canonicalStringify } from './canonical-json';
import type { ActionRequest, CancelActionResponse, HistoryQuery, PlanActionResponse } from './dto';
import type { EngineRuntime, HistoryRowInput } from './engine';
import {
  ROW_LIMITS,
  type RowLimits,
  type StoredResponseRef,
  boundHistoryRow,
  isStoredResponseRef,
  utf8Bytes,
} from './row-limits';
import {
  type CampaignMetaRecord,
  type CampaignProjection,
  type CampaignStore,
  type Clock,
  type DoResult,
  type HistoryValue,
  type InitialisedCampaign,
  type InitialiseInput,
  type MutationEnvelope,
  type MutationValue,
  type RestoreValue,
  type RevisionRecord,
  type Sha256Hex,
  type SnapshotCodec,
  SnapshotIntegrityError,
  type StoredIdempotency,
  type StoredTurnReport,
  type StoredTurnReportBody,
  type ViewRequest,
  type ViewValue,
  fail,
  ok,
} from './ports';

/** docs/architecture/04-persistence.md §2: keep the last 10 revisions in the DO. */
export const RETAINED_REVISIONS = 10;
/** Idempotency rows older than this are pruned during later commits. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

export interface CampaignServiceDeps<S, R, H> {
  runtime: EngineRuntime<S, R, H>;
  store: CampaignStore;
  codec: SnapshotCodec;
  clock: Clock;
  sha256: Sha256Hex;
  /** Diagnostics hook (the DO passes the structured logger). */
  onError?: (msg: string, err: unknown) => void;
  /** Monotonic ms clock for request timings (performance.now in the DO). */
  timer?: () => number;
  /** Per-request timing breakdown (ms), logged by the DO. Never carries PII. */
  onTimings?: (fields: RequestTimings) => void;
  /** Row size caps (tests shrink them). Defaults to ROW_LIMITS. */
  limits?: RowLimits;
}

export interface RequestTimings {
  op: string;
  revision: number | null;
  /** true when the state had to be decoded from storage (hot cache miss). */
  coldLoad: boolean;
  ms: Partial<
    Record<'load' | 'simulate' | 'serialize' | 'compress' | 'commit' | 'project' | 'total', number>
  >;
  bytes?: number;
}

/** Non-generic surface used by the Durable Object (and unit tests). */
export interface CampaignServiceApi {
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
  destroy(): Promise<void>;
  /** Drops the hot in-memory state; the next read reloads (and re-verifies) from storage. */
  evictCache(): void;
}

export function createCampaignService<S, R, H>(
  deps: CampaignServiceDeps<S, R, H>,
): CampaignServiceApi {
  return new CampaignService(deps);
}

interface Loaded<S> {
  revision: number;
  /** true when decoded from storage rather than served from the hot cache. */
  cold: boolean;
  record: RevisionRecord;
  meta: CampaignMetaRecord;
  state: S;
}

type MutationStep<S, T> = DoResult<{
  state: S;
  history: HistoryRowInput[];
  response: T;
  reason: string;
  /** Persist the response as the campaign's latest turn report (same transaction). */
  isTurnReport?: boolean;
}>;

/**
 * The per-campaign commit protocol (docs/architecture/04-persistence.md §3). Runs inside the
 * Campaign DO; storage-agnostic so it can be unit tested with InMemoryCampaignStore.
 *
 * Mutations are serialised through an in-memory queue: the DO's input gate only holds requests
 * during storage calls, not across our `await`s on compression/hashing, so without the queue two
 * advances could interleave. The store also re-checks revision + idempotency inside its transaction.
 */
class CampaignService<S, R, H> implements CampaignServiceApi {
  private hot: { revision: number; state: S } | null = null;
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly deps: CampaignServiceDeps<S, R, H>) {}

  evictCache(): void {
    this.hot = null;
  }

  /* -------------------------------------------------------------------- reads */

  async getView(req: ViewRequest, ifRevision?: number): Promise<DoResult<ViewValue>> {
    const current = this.deps.store.currentRevision();
    if (current === null) return notFound();
    if (ifRevision !== undefined && ifRevision === current) {
      return ok({ notModified: true, revision: current });
    }
    if (req.kind === 'turn_report') {
      // Stored by the last advance's commit: no state decode needed.
      const stored = this.deps.store.latestTurnReport();
      if (stored === null) return fail('NOT_FOUND', 'No week has been played yet.');
      const json = await this.readTurnReport(stored);
      if (!json.ok) return json;
      return ok({ notModified: false, revision: current, data: JSON.parse(json.value) as unknown });
    }
    const started = this.now();
    const loaded = await this.load();
    if (!loaded.ok) return loaded;
    const { state, revision, meta, record } = loaded.value;
    const p = this.deps.runtime.projections;
    const projectStart = this.now();
    let data: unknown;
    switch (req.kind) {
      case 'state':
        data = p.careerOverview(state, this.summary(meta, record));
        break;
      case 'catalogue':
        data = p.actionCatalogue(state);
        break;
      case 'parliament':
        data = p.parliament(state);
        break;
      case 'party':
        data = p.party(state);
        break;
      case 'politicians':
        data = p.politicianList(state, req.query);
        break;
      case 'politician': {
        const profile = p.politicianProfile(state, req.politicianId);
        if (!profile) return fail('NOT_FOUND', 'Politician not found.');
        data = profile;
        break;
      }
    }
    const end = this.now();
    this.deps.onTimings?.({
      op: `view:${req.kind}`,
      revision,
      coldLoad: loaded.value.cold,
      ms: { load: projectStart - started, project: end - projectStart, total: end - started },
    });
    return ok({ notModified: false, revision, data });
  }

  history(
    query: HistoryQuery,
    ifRevision?: number,
  ): Promise<DoResult<HistoryValue | { notModified: true; revision: number }>> {
    const { store } = this.deps;
    const current = store.currentRevision();
    if (current === null) return Promise.resolve(notFound());
    if (ifRevision !== undefined && ifRevision === current) {
      return Promise.resolve(ok({ notModified: true as const, revision: current }));
    }
    let beforeSeq: number | undefined;
    if (query.cursor !== undefined) {
      if (!/^\d{1,15}$/.test(query.cursor)) {
        return Promise.resolve(fail('VALIDATION_FAILED', 'Invalid cursor.'));
      }
      beforeSeq = Number(query.cursor);
    }
    const rows = store.history({
      limit: query.limit + 1,
      ...(beforeSeq !== undefined && { beforeSeq }),
      ...(query.type !== undefined && { type: query.type }),
      ...(query.politicianId !== undefined && { politicianId: query.politicianId }),
      ...(query.minImportance !== undefined && { minImportance: query.minImportance }),
      ...(query.fromTurn !== undefined && { fromTurn: query.fromTurn }),
    });
    const page = rows.slice(0, query.limit);
    const items: HistoryItem[] = page.map((r) => ({
      seq: r.seq,
      turn: r.turn,
      simDate: r.simDate,
      type: r.type,
      importance: r.importance,
      title: r.title,
      summary: r.summary,
      actorIds: r.actorIds,
      subjectIds: r.subjectIds,
    }));
    const last = page.at(-1);
    const nextCursor = rows.length > query.limit && last ? String(last.seq) : null;
    return Promise.resolve(ok({ revision: current, page: { items, nextCursor } }));
  }

  /* ---------------------------------------------------------------- lifecycle */

  initialise(input: InitialiseInput): Promise<DoResult<InitialisedCampaign>> {
    return this.exclusive(async () => {
      const { store, runtime, codec, sha256 } = this.deps;
      const initialiseHash = await sha256(canonicalStringify(input));
      const existing = store.getMeta();
      if (existing) {
        // Retried create (doc 04 §4): the DO already committed revision 1. Same input ⇒ same result.
        if (existing.campaignId !== input.campaignId) {
          return fail('INTERNAL', 'Durable Object already holds a different campaign.');
        }
        if (existing.initialiseHash !== undefined && existing.initialiseHash !== initialiseHash) {
          return fail(
            'IDEMPOTENCY_KEY_REUSED',
            'This campaign was already created from a different request.',
          );
        }
        const rev = store.currentRevision();
        const record = rev === null ? null : store.getRevision(rev);
        if (!record) return fail('INTERNAL', 'Campaign has metadata but no revision.');
        return ok({
          ...this.summary(existing, record),
          playerPoliticianId: existing.playerPoliticianId,
        });
      }
      const t0 = this.now();
      let created: ReturnType<typeof runtime.engine.create>;
      let engineMeta: ReturnType<typeof runtime.engine.meta>;
      let json: string;
      let t1: number;
      try {
        created = runtime.engine.create({
          scenarioKey: input.scenarioKey,
          seed: input.seed,
          player: input.player,
        });
        t1 = this.now();
        engineMeta = runtime.engine.meta(created.state);
        json = runtime.engine.serialize(created.state);
      } catch (err) {
        this.deps.onError?.('engine_create_failed', err);
        return fail('INTERNAL', 'The simulation failed to create this campaign.');
      }
      const t2 = this.now();
      const encoded = await codec.encode(json);
      const t3 = this.now();
      const meta: CampaignMetaRecord = {
        campaignId: input.campaignId,
        ownerId: input.ownerId,
        name: input.name,
        scenarioKey: input.scenarioKey,
        playerName: engineMeta.playerName,
        playerPoliticianId: engineMeta.playerPoliticianId,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
        initialiseHash,
      };
      const record: RevisionRecord = {
        revision: 1,
        turn: engineMeta.turn,
        simDate: engineMeta.simDate,
        reason: 'create',
        stateHash: encoded.stateHash,
        byteSize: encoded.byteSize,
        chunkCount: encoded.chunks.length,
        simulationVersion: runtime.engine.version,
        createdAt: input.createdAt,
      };
      const result = store.commit({
        expectedRevision: null,
        revision: record,
        snapshot: { chunks: encoded.chunks },
        history: runtime.projections
          .historyRecordsToRows(created.history)
          .map((h) => boundHistoryRow(h, this.limits)),
        meta,
        retainRevisions: RETAINED_REVISIONS,
      });
      if (result.status !== 'committed') {
        return fail('INTERNAL', 'Campaign was initialised concurrently.');
      }
      const t4 = this.now();
      this.deps.onTimings?.({
        op: 'initialise',
        revision: 1,
        coldLoad: false,
        ms: {
          simulate: t1 - t0,
          serialize: t2 - t1,
          compress: t3 - t2,
          commit: t4 - t3,
          total: t4 - t0,
        },
        bytes: encoded.byteSize,
      });
      this.hot = { revision: 1, state: created.state };
      return ok({ ...this.summary(meta, record), playerPoliticianId: meta.playerPoliticianId });
    });
  }

  destroy(): Promise<void> {
    return this.exclusive(async () => {
      this.hot = null;
      await this.deps.store.destroy();
    });
  }

  /* ---------------------------------------------------------------- mutations */

  planAction(
    input: MutationEnvelope & { action: ActionRequest },
  ): Promise<DoResult<MutationValue<PlanActionResponse>>> {
    const { engine, projections } = this.deps.runtime;
    return this.mutate('plan_action', input, { action: input.action }, (state, revision) => {
      const planned = engine.planAction(state, input.action);
      if (!planned.ok) {
        return fail('ACTION_INELIGIBLE', 'That action is not available.', {
          reasons: planned.reasons,
        });
      }
      const { diary, politicalCapital } = projections.diary(planned.state);
      const item = diary.planned.find((p) => p.id === planned.plannedActionId);
      if (!item) return fail('INTERNAL', 'Planned action missing from diary.');
      return ok({
        state: planned.state,
        history: [],
        reason: 'plan_action',
        response: { revision, planned: item, diary, politicalCapital },
      });
    });
  }

  cancelAction(
    input: MutationEnvelope & { plannedActionId: string },
  ): Promise<DoResult<MutationValue<CancelActionResponse>>> {
    const { engine, projections } = this.deps.runtime;
    return this.mutate(
      'cancel_action',
      input,
      { plannedActionId: input.plannedActionId },
      (state, revision) => {
        const next = engine.cancelPlannedAction(state, input.plannedActionId);
        if (next === null) return fail('NOT_FOUND', 'Planned action not found.');
        const { diary, politicalCapital } = projections.diary(next);
        return ok({
          state: next,
          history: [],
          reason: 'cancel_action',
          response: { revision, diary, politicalCapital },
        });
      },
    );
  }

  advance(input: MutationEnvelope): Promise<DoResult<MutationValue<TurnReport>>> {
    const { engine, projections } = this.deps.runtime;
    return this.mutate('advance', input, {}, (state, revision) => {
      const output = engine.advance(state);
      return ok({
        state: output.state,
        history: projections.historyRecordsToRows(output.history),
        reason: 'advance',
        isTurnReport: true,
        response: projections.turnReport({ before: state, output, revision }),
      });
    });
  }

  restore(input: { revision: number; expectedRevision: number }): Promise<DoResult<RestoreValue>> {
    return this.exclusive(async () => {
      const { store, clock } = this.deps;
      const meta = store.getMeta();
      const current = store.currentRevision();
      if (!meta || current === null) return notFound();
      if (input.expectedRevision !== current) return conflict(current);
      if (input.revision >= current) {
        return fail('VALIDATION_FAILED', 'Can only restore an earlier revision.');
      }
      const target = store.getRevision(input.revision);
      if (!target) return fail('NOT_FOUND', 'That revision is no longer retained.');
      const state = await this.decodeState(target);
      if (!state.ok) return state;
      const now = clock.nowIso();
      const revision = current + 1;
      const record: RevisionRecord = {
        ...target,
        revision,
        reason: `restore:${target.revision}`,
        createdAt: now,
      };
      const nextMeta = { ...meta, updatedAt: now };
      const result = store.commit({
        expectedRevision: current,
        revision: record,
        snapshot: { copyFromRevision: target.revision },
        history: [],
        deleteHistoryAfterRevision: target.revision,
        meta: nextMeta,
        retainRevisions: RETAINED_REVISIONS,
      });
      if (result.status === 'conflict') return conflict(result.currentRevision);
      if (result.status === 'replay') return fail('INTERNAL', 'Unexpected idempotent replay.');
      this.hot = { revision, state: state.value };
      return ok({ revision, restoredFrom: target.revision, projection: projectionOf(record, now) });
    });
  }

  /* ------------------------------------------------------------------ helpers */

  private mutate<T>(
    op: string,
    envelope: MutationEnvelope,
    body: unknown,
    step: (state: S, nextRevision: number) => MutationStep<S, T>,
  ): Promise<DoResult<MutationValue<T>>> {
    return this.exclusive(async () => {
      const { store, codec, clock, runtime, sha256 } = this.deps;
      // 2. Idempotency: same key + same body ⇒ the stored response; different body ⇒ 409.
      const requestHash = await sha256(
        canonicalStringify({ op, expectedRevision: envelope.expectedRevision, body }),
      );
      const stored = store.findIdempotency(envelope.idempotencyKey);
      if (stored) return this.replay<T>(stored, requestHash);

      const t0 = this.now();
      const loaded = await this.load();
      if (!loaded.ok) return loaded;
      const t1 = this.now();
      // 3. Revision check — never silently overwrite another device's progress.
      if (envelope.expectedRevision !== loaded.value.revision) {
        return conflict(loaded.value.revision);
      }
      const nextRevision = loaded.value.revision + 1;

      // 4. Run the (pure) engine on the in-memory state.
      let outcome: MutationStep<S, T>;
      try {
        outcome = step(loaded.value.state, nextRevision);
      } catch (err) {
        this.deps.onError?.('engine_failed', err);
        return fail('INTERNAL', 'The simulation failed to process this request.');
      }
      if (!outcome.ok) return outcome;
      const { state, history, response, reason, isTurnReport } = outcome.value;
      const t2 = this.now();

      // 5. Serialize + compress outside the transaction.
      const engineMeta = runtime.engine.meta(state);
      const json = runtime.engine.serialize(state);
      const t3 = this.now();
      const encoded = await codec.encode(json);
      const t4 = this.now();
      const responseJson = JSON.stringify(response);
      // Row caps (row-limits.ts): one oversized output must never make this commit fail forever.
      const turnReport =
        isTurnReport === true ? await this.encodeTurnReport(responseJson) : undefined;
      const storedResponse =
        utf8Bytes(responseJson) <= this.limits.idempotencyResponseBytes
          ? responseJson
          : JSON.stringify({
              storedRef: isTurnReport === true ? 'turn_report' : 'omitted',
              revision: nextRevision,
            } satisfies StoredResponseRef);
      const now = clock.nowIso();
      const record: RevisionRecord = {
        revision: nextRevision,
        turn: engineMeta.turn,
        simDate: engineMeta.simDate,
        reason,
        stateHash: encoded.stateHash,
        byteSize: encoded.byteSize,
        chunkCount: encoded.chunks.length,
        simulationVersion: runtime.engine.version,
        createdAt: now,
      };

      // 6. One synchronous transaction: revision, chunks, history, idempotency, meta, pruning.
      const result = store.commit({
        expectedRevision: loaded.value.revision,
        revision: record,
        snapshot: { chunks: encoded.chunks },
        history: history.map((h) => boundHistoryRow(h, this.limits)),
        idempotency: { key: envelope.idempotencyKey, requestHash, response: storedResponse },
        ...(turnReport !== undefined && { turnReport }),
        meta: { ...loaded.value.meta, updatedAt: now },
        retainRevisions: RETAINED_REVISIONS,
        pruneIdempotencyBefore: new Date(Date.parse(now) - IDEMPOTENCY_TTL_MS).toISOString(),
      });
      if (result.status === 'conflict') return conflict(result.currentRevision);
      if (result.status === 'replay') return this.replay<T>(result.stored, requestHash);

      // 7. Swap memory only after the commit succeeded.
      this.hot = { revision: nextRevision, state };
      const t5 = this.now();
      this.deps.onTimings?.({
        op,
        revision: nextRevision,
        coldLoad: loaded.value.cold,
        ms: {
          load: t1 - t0,
          simulate: t2 - t1,
          serialize: t3 - t2,
          compress: t4 - t3,
          commit: t5 - t4,
          total: t5 - t0,
        },
        bytes: encoded.byteSize,
      });
      return ok({
        response: JSON.parse(responseJson) as T,
        projection: projectionOf(record, now),
        replayed: false,
      });
    });
  }

  private async replay<T>(
    stored: StoredIdempotency,
    requestHash: string,
  ): Promise<DoResult<MutationValue<T>>> {
    if (stored.requestHash !== requestHash) {
      return fail(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request.',
      );
    }
    const { store } = this.deps;
    const current = store.currentRevision();
    const record = current === null ? null : store.getRevision(current);
    const meta = store.getMeta();
    if (!record || !meta) return notFound();
    let response = JSON.parse(stored.response) as unknown;
    if (isStoredResponseRef(response)) {
      // Too large to store: rebuild from the turn report, which is only kept for the latest
      // advance. If it's superseded (or the response was never rebuildable), the mutation did
      // commit, so the client is told to re-sync.
      const report = store.latestTurnReport();
      if (response.storedRef !== 'turn_report' || report?.revision !== response.revision) {
        return conflict(current);
      }
      const json = await this.readTurnReport(report);
      if (!json.ok) return json;
      response = JSON.parse(json.value) as unknown;
    }
    return ok({
      response: response as T,
      projection: projectionOf(record, meta.updatedAt),
      replayed: true,
    });
  }

  private get limits(): RowLimits {
    return this.deps.limits ?? ROW_LIMITS;
  }

  /** Inline JSON when it fits one row comfortably; otherwise gzip chunks (the snapshot codec). */
  private async encodeTurnReport(json: string): Promise<StoredTurnReportBody> {
    if (utf8Bytes(json) <= this.limits.turnReportInlineBytes) return { json };
    const encoded = await this.deps.codec.encode(json);
    return { chunks: encoded.chunks, hash: encoded.stateHash };
  }

  private async readTurnReport(stored: StoredTurnReport): Promise<DoResult<string>> {
    if ('json' in stored) return ok(stored.json);
    try {
      return ok(await this.deps.codec.decode(stored.chunks, stored.hash));
    } catch (err) {
      this.deps.onError?.('turn_report_load_failed', err);
      return fail('INTERNAL', 'The turn report could not be loaded.', {
        reason: 'integrity',
        revision: stored.revision,
      });
    }
  }

  private async load(): Promise<DoResult<Loaded<S>>> {
    const { store } = this.deps;
    const meta = store.getMeta();
    const current = store.currentRevision();
    if (!meta || current === null) return notFound();
    const record = store.getRevision(current);
    if (!record) return fail('INTERNAL', 'Current revision row is missing.');
    if (this.hot?.revision === current) {
      return ok({ revision: current, record, meta, state: this.hot.state, cold: false });
    }
    const state = await this.decodeState(record);
    if (!state.ok) return state;
    // A mutation may have committed while we were decoding; never cache a stale state.
    if (store.currentRevision() === current && (this.hot?.revision ?? 0) < current) {
      this.hot = { revision: current, state: state.value };
    }
    return ok({ revision: current, record, meta, state: state.value, cold: true });
  }

  private async decodeState(record: RevisionRecord): Promise<DoResult<S>> {
    const { store, codec, runtime } = this.deps;
    try {
      const json = await codec.decode(store.readChunks(record.revision), record.stateHash);
      return ok(runtime.engine.deserialize(json));
    } catch (err) {
      this.deps.onError?.('snapshot_load_failed', err);
      return fail('INTERNAL', 'The campaign save could not be loaded.', {
        reason: err instanceof SnapshotIntegrityError ? 'integrity' : 'deserialize',
        revision: record.revision,
      });
    }
  }

  private summary(meta: CampaignMetaRecord, record: RevisionRecord): CampaignSummary {
    return {
      id: meta.campaignId,
      name: meta.name,
      scenarioKey: meta.scenarioKey,
      status: 'active',
      simDate: record.simDate,
      turn: record.turn,
      revision: record.revision,
      playerName: meta.playerName,
      simulationVersion: record.simulationVersion,
      createdAt: meta.createdAt,
      updatedAt: meta.updatedAt,
    };
  }

  private now(): number {
    return this.deps.timer?.() ?? 0;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }
}

function projectionOf(record: RevisionRecord, updatedAt: string): CampaignProjection {
  return { revision: record.revision, turn: record.turn, simDate: record.simDate, updatedAt };
}

function notFound<T>(): DoResult<T> {
  return fail('NOT_FOUND', 'Campaign not found.');
}

function conflict<T>(currentRevision: number | null): DoResult<T> {
  return fail('REVISION_CONFLICT', 'Campaign has advanced on another device.', {
    currentRevision,
  });
}
