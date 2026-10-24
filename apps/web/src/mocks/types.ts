import type {
  ActionCatalogueItemSchema,
  ActionCatalogueResponseSchema,
  ActionOutcomeSchema,
  BillSchema,
  CampaignSummarySchema,
  CareerOverviewSchema,
  DivisionForecastSchema,
  DivisionResultSchema,
  HeadlineSchema,
  HistoryItemSchema,
  NotificationSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PendingEventSchema,
  PlannedActionSchema,
  PoliticianProfileSchema,
  PoliticianSummarySchema,
  RelationshipSummarySchema,
  ReputationSchema,
  TurnReportSchema,
  VoteSchema,
  KnownVoteSchema,
  CreateCampaignRequestSchema,
} from '@whip/contracts';
import type { z } from 'zod';

export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;
export type CareerOverview = z.infer<typeof CareerOverviewSchema>;
export type PoliticianProfile = z.infer<typeof PoliticianProfileSchema>;
export type PoliticianSummary = z.infer<typeof PoliticianSummarySchema>;
export type RelationshipSummary = z.infer<typeof RelationshipSummarySchema>;
export type Reputation = z.infer<typeof ReputationSchema>;
export type ParliamentView = z.infer<typeof ParliamentViewSchema>;
export type PartyView = z.infer<typeof PartyViewSchema>;
export type Bill = z.infer<typeof BillSchema>;
export type DivisionForecast = z.infer<typeof DivisionForecastSchema>;
export type DivisionResult = z.infer<typeof DivisionResultSchema>;
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type Headline = z.infer<typeof HeadlineSchema>;
export type PendingEvent = z.infer<typeof PendingEventSchema>;
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
export type TurnReport = z.infer<typeof TurnReportSchema>;
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;
export type ActionCatalogueItem = z.infer<typeof ActionCatalogueItemSchema>;
export type ActionCatalogueResponse = z.infer<typeof ActionCatalogueResponseSchema>;
export type Vote = z.infer<typeof VoteSchema>;
export type KnownVote = z.infer<typeof KnownVoteSchema>;
export type PlayerSetup = z.infer<typeof CreateCampaignRequestSchema>['player'];

/** Everything the mock server holds for one campaign. Plain data so `structuredClone` works. */
export interface MockWorld {
  summary: CampaignSummary;
  overview: Omit<CareerOverview, 'campaign'>;
  politicians: PoliticianProfile[];
  /** Ground truth for the next whipped division (fog of war: only some are known to the player). */
  hiddenIntentions: Record<string, Vote>;
  parliament: ParliamentView;
  party: PartyView;
  /** Ascending by seq. */
  history: HistoryItem[];
  meta: {
    nextSeq: number;
    nextPlannedId: number;
    nextNotificationId: number;
    lastPromotionRequestTurn: number | null;
    /** Pending events removed from the inbox when a response was planned (restored on cancel). */
    plannedEvents: Record<string, PendingEvent>;
  };
}
