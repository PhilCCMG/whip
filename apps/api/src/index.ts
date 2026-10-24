import type { Env } from './env';
import { createApp } from './http/app';
import { campaignMaintenance } from './http/services';
import { assertSafeEnvironment } from './infrastructure/env-guard';
import { logger } from './infrastructure/logging/logger';

export { CampaignDO } from './do/campaign-do';

const app = createApp();

/**
 * Cron (wrangler.jsonc `triggers.crons`, hourly): sweeps orphaned `initialising` campaigns and
 * retries unconfirmed DO wipes of deleted campaigns. Awaited (not waitUntil) so a failure is
 * reported as a failed cron invocation.
 */
async function runScheduled(
  controller: Pick<ScheduledController, 'cron' | 'scheduledTime'>,
  env: Env,
): Promise<void> {
  assertSafeEnvironment(env);
  const report = await campaignMaintenance(env).sweep();
  logger.info('campaign_sweep', {
    cron: controller.cron,
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
    ...report,
  });
}

export default {
  fetch: app.fetch,
  scheduled: (controller, env) => runScheduled(controller, env),
} satisfies ExportedHandler<Cloudflare.Env>;
