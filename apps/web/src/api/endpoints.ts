import {
  ActionCatalogueResponseSchema,
  CampaignListResponseSchema,
  CampaignSummarySchema,
  CancelActionResponseSchema,
  CareerOverviewSchema,
  HealthResponseSchema,
  HistoryPageSchema,
  MeResponseSchema,
  ParliamentViewSchema,
  PartyViewSchema,
  PlanActionResponseSchema,
  PoliticianListResponseSchema,
  PoliticianProfileSchema,
  TurnReportSchema,
  TutorialStateSchema,
  type CreateCampaignRequest,
  type TutorialUpdate,
} from '@whip/contracts';
import type { ApiClient } from './client';
import type { ActionRequest, HistoryFilters, PoliticianFilters } from './types';

const c = (id: string) => `/campaigns/${encodeURIComponent(id)}`;

/** One function per endpoint in docs/architecture/05 §1. */
export function endpoints(api: ApiClient) {
  return {
    health: (signal?: AbortSignal) => api.get('/health', HealthResponseSchema, { signal }),
    me: (signal?: AbortSignal) => api.get('/me', MeResponseSchema, { signal }),

    listCampaigns: (signal?: AbortSignal) =>
      api.get('/campaigns', CampaignListResponseSchema, { query: { limit: 50 }, signal }),
    createCampaign: (body: CreateCampaignRequest) =>
      api.mutate('POST', '/campaigns', CampaignSummarySchema, { body }),
    getCampaign: (id: string, signal?: AbortSignal) =>
      api.get(c(id), CampaignSummarySchema, { signal }),
    deleteCampaign: (id: string) => api.mutate('DELETE', c(id), null),

    getState: (id: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/state`, CareerOverviewSchema, { signal }),
    getCatalogue: (id: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/actions/catalogue`, ActionCatalogueResponseSchema, { signal }),
    planAction: (id: string, expectedRevision: number, action: ActionRequest) =>
      api.mutate('POST', `${c(id)}/actions`, PlanActionResponseSchema, {
        body: { expectedRevision, action },
      }),
    cancelAction: (id: string, expectedRevision: number, plannedId: string) =>
      api.mutate(
        'DELETE',
        `${c(id)}/actions/${encodeURIComponent(plannedId)}`,
        CancelActionResponseSchema,
        { query: { expectedRevision } },
      ),
    advance: (id: string, expectedRevision: number) =>
      api.mutate('POST', `${c(id)}/advance`, TurnReportSchema, { body: { expectedRevision } }),
    /** The report from the most recent advance; 404 NOT_FOUND before the first one. */
    latestTurnReport: (id: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/turn-report/latest`, TurnReportSchema, { signal }),

    history: (id: string, filters: HistoryFilters, cursor?: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/history`, HistoryPageSchema, {
        query: { ...filters, cursor, limit: 25 },
        signal,
      }),
    politicians: (
      id: string,
      filters: PoliticianFilters,
      cursor?: string,
      signal?: AbortSignal,
      limit = 50,
    ) =>
      api.get(`${c(id)}/politicians`, PoliticianListResponseSchema, {
        query: { ...filters, cursor, limit },
        signal,
      }),
    politician: (id: string, pid: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/politicians/${encodeURIComponent(pid)}`, PoliticianProfileSchema, {
        signal,
      }),
    parliament: (id: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/parliament`, ParliamentViewSchema, { signal }),
    party: (id: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/party`, PartyViewSchema, { signal }),

    /** Members' induction progress (UI metadata; docs/architecture/11-tutorial.md). */
    tutorial: (id: string, signal?: AbortSignal) =>
      api.get(`${c(id)}/tutorial`, TutorialStateSchema, { signal }),
    /** Idempotent merge (set union), so plain retries are safe. */
    updateTutorial: (id: string, body: TutorialUpdate) =>
      api.mutate('PUT', `${c(id)}/tutorial`, TutorialStateSchema, { body }),
  };
}

export type Endpoints = ReturnType<typeof endpoints>;
