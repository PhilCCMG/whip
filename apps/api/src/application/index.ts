/**
 * Application layer: use-case services (CreateCampaign, PlanAction, AdvanceWeek, …) and ownership
 * checks. Depends on interfaces (CampaignIndex, CampaignStore, Clock, IdGenerator), never on
 * Cloudflare APIs directly. See docs/architecture/04-persistence.md §7.
 *
 * Placeholder: owned by the API agent.
 */
export { AppError } from './errors';
