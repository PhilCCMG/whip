import type { CampaignDoGateway, CampaignIndex, Clock } from './ports';

export interface MaintenanceLogger {
  warn(msg: string, fields?: Record<string, unknown>): void;
}

export interface CampaignMaintenanceDeps {
  index: CampaignIndex;
  campaigns: CampaignDoGateway;
  clock: Clock;
  log: MaintenanceLogger;
}

/** docs/architecture/04-persistence.md §4: `initialising` rows older than this are orphans. */
export const STALE_INITIALISING_MS = 10 * 60 * 1000;
/** Per-run cap for each sweep, so one cron invocation stays well inside its limits. */
export const SWEEP_BATCH = 50;

export interface SweepReport {
  staleRemoved: number;
  wipesConfirmed: number;
  failures: number;
}

/**
 * Wipes a soft-deleted campaign's Durable Object, then records `wipe_confirmed_at`. Returns false
 * (after logging) on failure instead of throwing: the cron sweep retries unconfirmed wipes.
 */
export async function wipeCampaignStorage(
  deps: CampaignMaintenanceDeps,
  id: string,
): Promise<boolean> {
  try {
    await deps.campaigns.get(id).destroy();
    await deps.index.confirmWipe(id, deps.clock.nowIso());
    return true;
  } catch (err) {
    deps.log.warn('campaign_wipe_failed', {
      campaignId: id,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Scheduled maintenance (the Worker's `scheduled` handler, hourly cron):
 *  1. `initialising` rows older than 10 minutes (a create that died between the D1 insert and
 *     activation) get their DO wiped and their D1 row deleted.
 *  2. Soft-deleted rows whose DO wipe was never confirmed are wiped again.
 * Every step is idempotent, so overlapping runs or a racing request are harmless.
 */
export class CampaignMaintenance {
  constructor(private readonly deps: CampaignMaintenanceDeps) {}

  async sweep(opts: { staleAfterMs?: number; batch?: number } = {}): Promise<SweepReport> {
    const { index, campaigns, clock, log } = this.deps;
    const batch = opts.batch ?? SWEEP_BATCH;
    const cutoff = new Date(
      Date.parse(clock.nowIso()) - (opts.staleAfterMs ?? STALE_INITIALISING_MS),
    ).toISOString();
    const report: SweepReport = { staleRemoved: 0, wipesConfirmed: 0, failures: 0 };

    for (const id of await index.listStaleInitialising(cutoff, batch)) {
      try {
        await campaigns.get(id).destroy();
        await index.hardDelete(id);
        report.staleRemoved += 1;
      } catch (err) {
        report.failures += 1;
        log.warn('campaign_sweep_stale_failed', {
          campaignId: id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    for (const id of await index.listUnconfirmedWipes(batch)) {
      if (await wipeCampaignStorage(this.deps, id)) report.wipesConfirmed += 1;
      else report.failures += 1;
    }
    return report;
  }
}
