import type { CampaignSummary, CreateCampaignRequest, TurnReport } from '@whip/contracts';
import type {
  ActionRequest,
  CancelActionResponse,
  HistoryPage,
  HistoryQuery,
  PlanActionResponse,
} from './dto';
import { canonicalStringify } from './canonical-json';
import { AppError } from './errors';
import { wipeCampaignStorage } from './maintenance';
import {
  type CampaignDoClient,
  type CampaignDoGateway,
  type CampaignIndex,
  type CampaignIndexRecord,
  type CampaignProjection,
  type Clock,
  type CreateKeyMatch,
  type DoResult,
  type IdGenerator,
  InvalidCursorError,
  type MutationEnvelope,
  type MutationValue,
  type RestoreValue,
  type Sha256Hex,
  type ViewRequest,
} from './ports';

export interface Logger {
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
}

export interface CampaignUseCaseDeps {
  index: CampaignIndex;
  campaigns: CampaignDoGateway;
  clock: Clock;
  ids: IdGenerator;
  sha256: Sha256Hex;
  /** Rules version of the selected engine, recorded on new index rows. */
  engineVersion: number;
  log: Logger;
}

/** Conditional-GET aware read result. `revision` drives the `ETag`. */
export type ReadResult<T> =
  { notModified: true; revision: number } | { notModified: false; revision: number; data: T };

export const MAX_CAMPAIGN_PAGE = 50;

/**
 * Campaign use cases (docs/architecture/05 §1, 04 §3–4). Every campaign-scoped call first checks
 * ownership against the D1 index; campaigns the caller doesn't own are NOT_FOUND.
 */
export class CampaignUseCases {
  constructor(private readonly deps: CampaignUseCaseDeps) {}

  async list(
    userId: string,
    page: { cursor?: string | undefined; limit: number },
  ): Promise<{ items: CampaignSummary[]; nextCursor: string | null }> {
    try {
      const result = await this.deps.index.listForOwner(userId, {
        limit: Math.min(page.limit, MAX_CAMPAIGN_PAGE),
        ...(page.cursor !== undefined && { cursor: page.cursor }),
      });
      return { items: result.items.map(toSummary), nextCursor: result.nextCursor };
    } catch (err) {
      if (err instanceof InvalidCursorError) {
        throw new AppError('VALIDATION_FAILED', 'Invalid cursor.');
      }
      throw err;
    }
  }

  /**
   * Create flow (04 §4): D1 `initialising` row → DO initialise (revision 1) → D1 `active`.
   *
   * With an `Idempotency-Key`, a retry (same owner + key + body) resumes the same campaign: the
   * D1 row is found by key, the DO `initialise` is idempotent for the same input (same id,
   * createdAt and a key-derived seed), then the row is activated. Same key with a different body ⇒
   * IDEMPOTENCY_KEY_REUSED. Without a key a failed create is cleaned up best-effort. Anything left
   * `initialising` is swept by the cron (CampaignMaintenance).
   */
  async create(
    userId: string,
    req: CreateCampaignRequest,
    opts: { idempotencyKey?: string | undefined } = {},
  ): Promise<CampaignSummary> {
    const { index, ids, clock } = this.deps;
    const key = opts.idempotencyKey;
    const id = ids.campaignId();
    const createdAt = clock.nowIso();
    const row = {
      id,
      ownerId: userId,
      name: req.name,
      scenarioKey: req.scenarioKey,
      simulationVersion: this.deps.engineVersion,
      createdAt,
    };
    if (key === undefined) {
      await index.insertInitialising(row);
      try {
        return await this.initialiseAndActivate(id, userId, req, createdAt, req.seed ?? ids.seed());
      } catch (err) {
        await this.discardFailedCreate(id);
        throw err;
      }
    }

    const requestHash = await this.deps.sha256(canonicalStringify({ op: 'create', body: req }));
    const seed = req.seed ?? (await this.keyedSeed(userId, key));
    const inserted = await index.insertInitialising({
      ...row,
      createKey: key,
      createRequestHash: requestHash,
    });
    if (inserted === 'inserted') {
      return this.initialiseAndActivate(id, userId, req, createdAt, seed);
    }
    const existing = await index.findByCreateKey(userId, key);
    if (!existing) throw new AppError('INTERNAL', 'Create retry lost its index row; try again.');
    return this.resumeCreate(userId, req, requestHash, seed, existing);
  }

  async get(userId: string, id: string): Promise<CampaignSummary> {
    return toSummary(await this.owned(userId, id));
  }

  /**
   * Soft delete in D1 first (so it vanishes immediately), then wipe the DO and record
   * `wipe_confirmed_at`. A failed wipe is logged, not surfaced: the campaign is already gone for
   * the player, and the cron sweep retries unconfirmed wipes.
   */
  async delete(userId: string, id: string): Promise<void> {
    await this.owned(userId, id);
    await this.deps.index.softDelete(id, this.deps.clock.nowIso());
    await wipeCampaignStorage(this.deps, id);
  }

  async view(
    userId: string,
    id: string,
    req: ViewRequest,
    ifRevision?: number,
  ): Promise<ReadResult<unknown>> {
    const stub = await this.stub(userId, id);
    return unwrap(await stub.getView(req, ifRevision));
  }

  async history(
    userId: string,
    id: string,
    query: HistoryQuery,
    ifRevision?: number,
  ): Promise<ReadResult<HistoryPage>> {
    const stub = await this.stub(userId, id);
    const value = unwrap(await stub.history(query, ifRevision));
    return 'page' in value
      ? { notModified: false, revision: value.revision, data: value.page }
      : { notModified: true, revision: value.revision };
  }

  async planAction(
    userId: string,
    id: string,
    input: MutationEnvelope & { action: ActionRequest },
  ): Promise<PlanActionResponse> {
    const stub = await this.stub(userId, id);
    return this.afterCommit(id, await stub.planAction(input));
  }

  async cancelAction(
    userId: string,
    id: string,
    input: MutationEnvelope & { plannedActionId: string },
  ): Promise<CancelActionResponse> {
    const stub = await this.stub(userId, id);
    return this.afterCommit(id, await stub.cancelAction(input));
  }

  async advance(userId: string, id: string, input: MutationEnvelope): Promise<TurnReport> {
    const stub = await this.stub(userId, id);
    return this.afterCommit(id, await stub.advance(input));
  }

  /** Player-facing "load autosave" (04 §4). Not routed in v1; available to the application. */
  async restore(
    userId: string,
    id: string,
    input: { revision: number; expectedRevision: number },
  ): Promise<RestoreValue> {
    const stub = await this.stub(userId, id);
    const value = unwrap(await stub.restore(input));
    await this.project(id, value.projection);
    return value;
  }

  /* ------------------------------------------------------------------ helpers */

  private async resumeCreate(
    userId: string,
    req: CreateCampaignRequest,
    requestHash: string,
    seed: number,
    existing: CreateKeyMatch,
  ): Promise<CampaignSummary> {
    if (existing.requestHash !== requestHash) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was already used for a different request.',
      );
    }
    if (existing.deleted) {
      throw new AppError(
        'IDEMPOTENCY_KEY_REUSED',
        'This Idempotency-Key was used for a campaign that has since been deleted.',
      );
    }
    const { record } = existing;
    if (record.status === 'active') return toSummary(record);
    return this.initialiseAndActivate(record.id, userId, req, record.createdAt, seed);
  }

  private async initialiseAndActivate(
    id: string,
    userId: string,
    req: CreateCampaignRequest,
    createdAt: string,
    seed: number,
  ): Promise<CampaignSummary> {
    const { playerPoliticianId, ...summary } = unwrap(
      await this.deps.campaigns.get(id).initialise({
        campaignId: id,
        ownerId: userId,
        name: req.name,
        scenarioKey: req.scenarioKey,
        seed,
        player: req.player,
        createdAt,
      }),
    );
    await this.deps.index.activate({ ...summary, playerPoliticianId });
    return summary;
  }

  /** uint32 seed derived from (owner, key), so a resumed create regenerates the same world. */
  private async keyedSeed(userId: string, key: string): Promise<number> {
    const hex = await this.deps.sha256(`create-seed:${userId}:${key}`);
    return Number.parseInt(hex.slice(0, 8), 16) >>> 0;
  }

  /** An un-keyed create failed: nobody can resume it, so wipe the DO and drop the row now. */
  private async discardFailedCreate(id: string): Promise<void> {
    try {
      await this.deps.campaigns.get(id).destroy();
      await this.deps.index.hardDelete(id);
    } catch (err) {
      this.deps.log.warn('campaign_create_cleanup_failed', {
        campaignId: id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async owned(userId: string, id: string): Promise<CampaignIndexRecord> {
    const record = await this.deps.index.get(id);
    if (!record || record.ownerId !== userId || record.status !== 'active') {
      throw new AppError('NOT_FOUND', 'Campaign not found.');
    }
    return record;
  }

  private async stub(userId: string, id: string): Promise<CampaignDoClient> {
    await this.owned(userId, id);
    return this.deps.campaigns.get(id);
  }

  private async afterCommit<T>(id: string, result: DoResult<MutationValue<T>>): Promise<T> {
    const value = unwrap(result);
    await this.project(id, value.projection);
    return value.response;
  }

  /** Step 8: D1 is a derived projection — a failure is logged, never fatal. */
  private async project(id: string, projection: CampaignProjection): Promise<void> {
    try {
      await this.deps.index.upsertProjection(id, projection);
    } catch (err) {
      this.deps.log.warn('campaign_index_projection_failed', {
        campaignId: id,
        revision: projection.revision,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export function unwrap<T>(result: DoResult<T>): T {
  if (result.ok) return result.value;
  throw new AppError(result.error.code, result.error.message, result.error.details);
}

function toSummary(r: CampaignIndexRecord): CampaignSummary {
  return {
    id: r.id,
    name: r.name,
    scenarioKey: r.scenarioKey,
    status: r.status,
    simDate: r.simDate ?? '0000-01-01',
    turn: r.turn,
    revision: r.revision,
    playerName: r.playerName ?? '',
    simulationVersion: r.simulationVersion,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
