import { DurableObject } from 'cloudflare:workers';
import type { TurnReport, TutorialState, TutorialUpdate } from '@whip/contracts';
import type { CampaignServiceApi } from '../application/campaign-service';
import type {
  ActionRequest,
  CancelActionResponse,
  HistoryQuery,
  PlanActionResponse,
} from '../application/dto';
import type {
  CampaignDoClient,
  DoResult,
  HistoryValue,
  InitialisedCampaign,
  InitialiseInput,
  MutationEnvelope,
  MutationValue,
  RestoreValue,
  ViewRequest,
  ViewValue,
} from '../application/ports';
import { createCampaignServiceForEnv, selectEngine } from '../composition';
import type { Env } from '../env';
import { logger } from '../infrastructure/logging/logger';
import { sha256Hex, systemClock } from '../infrastructure/platform';
import { createGzipChunkCodec } from '../infrastructure/snapshot/gzip-chunk-codec';
import { runDoSchemaMigrations } from './schema-migrations';
import { SqliteCampaignStore } from './sqlite-campaign-store';

/**
 * One SQLite-backed Durable Object per campaign, addressed by `idFromName(campaignId)`.
 * Thin adapter: RPC methods delegate to the storage-agnostic CampaignService (commit protocol,
 * idempotency, hot state) over SqliteCampaignStore. Returns typed `DoResult`s, never HTTP.
 *
 * Never reachable from outside: only the Worker calls it via RPC after an ownership check.
 */
export class CampaignDO extends DurableObject<Env> implements CampaignDoClient {
  /** Exposed for integration tests (runInDurableObject) and diagnostics. */
  readonly service: CampaignServiceApi;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // SQL storage is synchronous and the constructor completes before any request is delivered,
    // so migrations need no blockConcurrencyWhile.
    runDoSchemaMigrations(ctx.storage.sql);
    this.service = createCampaignServiceForEnv(env, {
      store: new SqliteCampaignStore(ctx.storage),
      codec: createGzipChunkCodec(),
      clock: systemClock,
      sha256: sha256Hex,
      onError: (msg, err) =>
        logger.error(msg, {
          durableObjectId: ctx.id.toString(),
          error: err instanceof Error ? { name: err.name, message: err.message } : String(err),
        }),
      // Note: on deployed Workers the clock only advances across I/O, so pure-CPU spans
      // (simulate/serialize) read ~0 there; locally (workerd/wrangler dev) they are real.
      timer: () => performance.now(),
      onTimings: (t) =>
        logger.info('campaign_do_timing', {
          durableObjectId: ctx.id.toString(),
          op: t.op,
          revision: t.revision,
          coldLoad: t.coldLoad,
          ...Object.fromEntries(
            Object.entries(t.ms).map(([k, v]) => [`${k}Ms`, Math.round(v * 10) / 10]),
          ),
          ...(t.bytes !== undefined && { snapshotBytes: t.bytes }),
        }),
    });
  }

  /** Liveness RPC used by tests and diagnostics. */
  ping(): { ok: true; engine: string; schemaVersion: number } {
    const row = this.ctx.storage.sql
      .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
      .toArray()[0];
    return { ok: true, engine: selectEngine(this.env), schemaVersion: Number(row?.value ?? 0) };
  }

  initialise(input: InitialiseInput): Promise<DoResult<InitialisedCampaign>> {
    return this.service.initialise(input);
  }

  getView(req: ViewRequest, ifRevision?: number): Promise<DoResult<ViewValue>> {
    return this.service.getView(req, ifRevision);
  }

  planAction(
    input: MutationEnvelope & { action: ActionRequest },
  ): Promise<DoResult<MutationValue<PlanActionResponse>>> {
    return this.service.planAction(input);
  }

  cancelAction(
    input: MutationEnvelope & { plannedActionId: string },
  ): Promise<DoResult<MutationValue<CancelActionResponse>>> {
    return this.service.cancelAction(input);
  }

  advance(input: MutationEnvelope): Promise<DoResult<MutationValue<TurnReport>>> {
    return this.service.advance(input);
  }

  history(
    query: HistoryQuery,
    ifRevision?: number,
  ): Promise<DoResult<HistoryValue | { notModified: true; revision: number }>> {
    return this.service.history(query, ifRevision);
  }

  restore(input: { revision: number; expectedRevision: number }): Promise<DoResult<RestoreValue>> {
    return this.service.restore(input);
  }

  getTutorial(): Promise<DoResult<TutorialState>> {
    return this.service.getTutorial();
  }

  updateTutorial(update: TutorialUpdate): Promise<DoResult<TutorialState>> {
    return this.service.updateTutorial(update);
  }

  destroy(): Promise<void> {
    return this.service.destroy();
  }
}
