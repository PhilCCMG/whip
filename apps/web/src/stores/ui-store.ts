import type { ActionKind } from '@whip/contracts';
import { create } from 'zustand';
import type { HistoryFilters, PoliticianFilters } from '../api/types';

/**
 * UI-only state (drawers, planner prefill, filters).
 * Game state is NEVER stored here — server DTOs via TanStack Query are the source of truth.
 */
export interface PlannerPrefill {
  kind?: ActionKind;
  params?: Record<string, unknown>;
  /** Display names for prefilled ids (e.g. the politician whose profile opened the planner). */
  labels?: Record<string, string>;
}

interface UiState {
  plannerOpen: boolean;
  plannerPrefill: PlannerPrefill | null;
  openPlanner: (prefill?: PlannerPrefill) => void;
  closePlanner: () => void;

  contextSheetOpen: boolean;
  setContextSheetOpen: (open: boolean) => void;

  /** The turn report modal shows the latest report held in the query cache. */
  turnReportOpen: boolean;
  setTurnReportOpen: (open: boolean) => void;

  politicianFilters: PoliticianFilters;
  setPoliticianFilters: (patch: Partial<PoliticianFilters>) => void;
  historyFilters: HistoryFilters;
  setHistoryFilters: (patch: Partial<HistoryFilters>) => void;
  /** Tea Room roster layout: portrait cards or dense rows. */
  rosterView: 'grid' | 'list';
  setRosterView: (view: 'grid' | 'list') => void;
}

export const useUiStore = create<UiState>()((set) => ({
  plannerOpen: false,
  plannerPrefill: null,
  openPlanner: (prefill) => set({ plannerOpen: true, plannerPrefill: prefill ?? null }),
  closePlanner: () => set({ plannerOpen: false, plannerPrefill: null }),

  contextSheetOpen: false,
  setContextSheetOpen: (open) => set({ contextSheetOpen: open }),

  turnReportOpen: false,
  setTurnReportOpen: (open) => set({ turnReportOpen: open }),

  politicianFilters: { sort: 'influence' },
  setPoliticianFilters: (patch) =>
    set((s) => ({ politicianFilters: { ...s.politicianFilters, ...patch } })),
  historyFilters: {},
  setHistoryFilters: (patch) => set((s) => ({ historyFilters: { ...s.historyFilters, ...patch } })),
  rosterView: 'grid',
  setRosterView: (rosterView) => set({ rosterView }),
}));
