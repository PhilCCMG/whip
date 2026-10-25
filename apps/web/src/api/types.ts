/** DTO type aliases inferred from @whip/contracts schemas (the API seam). */
import type {
  ActionCatalogueItemSchema,
  ActionCatalogueResponseSchema,
  ActionOutcomeSchema,
  CampaignListResponseSchema,
  CancelActionResponseSchema,
  DiarySchema,
  DivisionForecastSchema,
  HistoryPageSchema,
  HistoryTypeSchema,
  KnownVoteSchema,
  NotificationSchema,
  PendingEventSchema,
  PlanActionResponseSchema,
  PlannedActionSchema,
  PoliticianListResponseSchema,
  PoliticianSummarySchema,
  RelationshipSummarySchema,
  ReputationSchema,
  BillSchema,
  HeadlineSchema,
  MeResponseSchema,
} from '@whip/contracts';
import type { ActionKind } from '@whip/contracts';
import type { z } from 'zod';

export type {
  Article,
  Newspaper,
  NewspaperSectionKey,
  ActionKind,
  CampaignSummary,
  CareerOverview,
  CreateCampaignRequest,
  DivisionResult,
  HistoryItem,
  ParliamentView,
  PartyView,
  PoliticianProfile,
  TurnReport,
} from '@whip/contracts';

export type ActionCatalogueItem = z.infer<typeof ActionCatalogueItemSchema>;
export type ActionCatalogueResponse = z.infer<typeof ActionCatalogueResponseSchema>;
export type ActionParam = ActionCatalogueItem['params'][number];
export type ActionOutcome = z.infer<typeof ActionOutcomeSchema>;
export type CampaignList = z.infer<typeof CampaignListResponseSchema>;
export type CancelActionResponse = z.infer<typeof CancelActionResponseSchema>;
export type Diary = z.infer<typeof DiarySchema>;
export type DivisionForecast = z.infer<typeof DivisionForecastSchema>;
export type HistoryPage = z.infer<typeof HistoryPageSchema>;
export type HistoryType = z.infer<typeof HistoryTypeSchema>;
export type KnownVote = z.infer<typeof KnownVoteSchema>;
export type Notification = z.infer<typeof NotificationSchema>;
export type PendingEvent = z.infer<typeof PendingEventSchema>;
export type PlanActionResponse = z.infer<typeof PlanActionResponseSchema>;
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
export type PoliticianList = z.infer<typeof PoliticianListResponseSchema>;
export type PoliticianSummary = z.infer<typeof PoliticianSummarySchema>;
export type RelationshipSummary = z.infer<typeof RelationshipSummarySchema>;
export type Reputation = z.infer<typeof ReputationSchema>;
export type Bill = z.infer<typeof BillSchema>;
export type Headline = z.infer<typeof HeadlineSchema>;
export type Me = z.infer<typeof MeResponseSchema>;

export interface ActionRequest {
  kind: ActionKind;
  params: Record<string, unknown>;
}

export interface PoliticianFilters {
  partyId?: string | undefined;
  factionId?: string | undefined;
  search?: string | undefined;
  sort?: 'name' | 'influence' | 'relationship' | undefined;
}

export interface HistoryFilters {
  type?: HistoryType | undefined;
  minImportance?: number | undefined;
  politicianId?: string | undefined;
}
