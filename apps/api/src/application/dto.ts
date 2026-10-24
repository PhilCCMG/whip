import type {
  ActionCatalogueResponseSchema,
  ActionRequestSchema,
  CancelActionResponseSchema,
  DiarySchema,
  HistoryPageSchema,
  HistoryQuerySchema,
  HistoryTypeSchema,
  MeResponseSchema,
  PlanActionResponseSchema,
  PoliticianListQuerySchema,
  PoliticianListResponseSchema,
} from '@whip/contracts';
import type { z } from 'zod';

/** Type aliases for contracts schemas that don't export an inferred type. */
export type ActionRequest = z.infer<typeof ActionRequestSchema>;
export type ActionCatalogueResponse = z.infer<typeof ActionCatalogueResponseSchema>;
export type Diary = z.infer<typeof DiarySchema>;
export type PlanActionResponse = z.infer<typeof PlanActionResponseSchema>;
export type CancelActionResponse = z.infer<typeof CancelActionResponseSchema>;
export type PoliticianListQuery = z.infer<typeof PoliticianListQuerySchema>;
export type PoliticianListResponse = z.infer<typeof PoliticianListResponseSchema>;
export type HistoryType = z.infer<typeof HistoryTypeSchema>;
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;
export type HistoryPage = z.infer<typeof HistoryPageSchema>;
export type MeResponse = z.infer<typeof MeResponseSchema>;
