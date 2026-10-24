import type { CampaignDoClient, CampaignDoGateway } from '../../application/ports';

/**
 * Worker-side client for the Campaign DO: `idFromName(campaignId)` → RPC stub. The stub's RPC
 * method signatures match `CampaignDoClient` (CampaignDO implements it); the cast only drops
 * workers-types' `Rpc.Provider` wrapper types.
 */
export function durableObjectCampaignGateway(namespace: DurableObjectNamespace): CampaignDoGateway {
  return {
    get: (campaignId) =>
      namespace.get(namespace.idFromName(campaignId)) as unknown as CampaignDoClient,
  };
}
