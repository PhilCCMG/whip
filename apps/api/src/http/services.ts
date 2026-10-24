import type { Context } from 'hono';
import { CampaignUseCases } from '../application/campaigns';
import { CampaignMaintenance } from '../application/maintenance';
import { engineVersion } from '../composition';
import type { AppEnv, Env } from '../env';
import { createDb } from '../infrastructure/db/client';
import { D1CampaignIndex } from '../infrastructure/db/d1-campaign-index';
import { durableObjectCampaignGateway } from '../infrastructure/do/campaign-do-gateway';
import { logger } from '../infrastructure/logging/logger';
import { randomIds, sha256Hex, systemClock } from '../infrastructure/platform';

/** Per-request composition of the Worker-side application services. */
export function campaignUseCases(c: Context<AppEnv>): CampaignUseCases {
  return new CampaignUseCases({
    index: new D1CampaignIndex(createDb(c.env.DB)),
    campaigns: durableObjectCampaignGateway(c.env.CAMPAIGN),
    clock: systemClock,
    ids: randomIds,
    sha256: sha256Hex,
    engineVersion: engineVersion(c.env),
    log: {
      warn: (msg, fields) => logger.warn(msg, { requestId: c.get('requestId'), ...fields }),
      error: (msg, fields) => logger.error(msg, { requestId: c.get('requestId'), ...fields }),
    },
  });
}

/** Composition for the scheduled (cron) maintenance sweep. */
export function campaignMaintenance(env: Pick<Env, 'DB' | 'CAMPAIGN'>): CampaignMaintenance {
  return new CampaignMaintenance({
    index: new D1CampaignIndex(createDb(env.DB)),
    campaigns: durableObjectCampaignGateway(env.CAMPAIGN),
    clock: systemClock,
    log: { warn: (msg, fields) => logger.warn(msg, { source: 'cron', ...fields }) },
  });
}
