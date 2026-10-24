import {
  queryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import type { CreateCampaignRequest } from '@whip/contracts';
import { useUiStore } from '../stores/ui-store';
import { sendSignInCode, signInWithCode, signOut } from './auth';
import { endpoints } from './endpoints';
import { isApiError } from './errors';
import { api } from './runtime';
import type {
  ActionRequest,
  CampaignSummary,
  CareerOverview,
  HistoryFilters,
  PoliticianFilters,
  TurnReport,
} from './types';

export const ep = endpoints(api);

/** Query keys. Everything scoped to a campaign starts with ['campaign', id]. */
export const keys = {
  me: ['me'] as const,
  campaigns: ['campaigns'] as const,
  campaign: (id: string) => ['campaign', id] as const,
  summary: (id: string) => ['campaign', id, 'summary'] as const,
  state: (id: string) => ['campaign', id, 'state'] as const,
  catalogue: (id: string) => ['campaign', id, 'catalogue'] as const,
  politicians: (id: string, f: PoliticianFilters) => ['campaign', id, 'politicians', f] as const,
  politician: (id: string, pid: string) => ['campaign', id, 'politician', pid] as const,
  parliament: (id: string) => ['campaign', id, 'parliament'] as const,
  party: (id: string) => ['campaign', id, 'party'] as const,
  history: (id: string, f: HistoryFilters) => ['campaign', id, 'history', f] as const,
  /** Outside the campaign prefix so invalidation after advance does not touch it. */
  turnReport: (id: string) => ['turn-report', id] as const,
};

export const campaignsQuery = () =>
  queryOptions({ queryKey: keys.campaigns, queryFn: ({ signal }) => ep.listCampaigns(signal) });

export const summaryQuery = (id: string) =>
  queryOptions({ queryKey: keys.summary(id), queryFn: ({ signal }) => ep.getCampaign(id, signal) });

export const stateQuery = (id: string) =>
  queryOptions({ queryKey: keys.state(id), queryFn: ({ signal }) => ep.getState(id, signal) });

export const useCampaigns = () => useQuery(campaignsQuery());

/** The signed-in player. A 401 (UNAUTHENTICATED) means there is no session. */
export const useMe = () =>
  useQuery({ queryKey: keys.me, queryFn: ({ signal }) => ep.me(signal), staleTime: 5 * 60_000 });

export const isSignedOutError = (e: unknown) =>
  isApiError(e, 'UNAUTHENTICATED') || (isApiError(e) && e.status === 401);

export const useSendSignInCode = () =>
  useMutation({
    mutationFn: (email: string) => sendSignInCode(email),
    meta: { inlineErrors: true },
  });

export function useSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ email, otp }: { email: string; otp: string }) => signInWithCode(email, otp),
    meta: { inlineErrors: true },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: keys.me }),
        qc.invalidateQueries({ queryKey: keys.campaigns }),
      ]),
  });
}

export function useSignOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => signOut(),
    onSuccess: () => {
      qc.removeQueries({ queryKey: ['campaign'] });
      qc.removeQueries({ queryKey: keys.campaigns });
      return qc.invalidateQueries({ queryKey: keys.me });
    },
  });
}
export const useCampaignState = (id: string) => useQuery(stateQuery(id));

export const useCatalogue = (id: string, enabled = true) =>
  useQuery({
    queryKey: keys.catalogue(id),
    queryFn: ({ signal }) => ep.getCatalogue(id, signal),
    enabled,
  });

export const usePoliticians = (id: string, filters: PoliticianFilters) =>
  useInfiniteQuery({
    queryKey: keys.politicians(id, filters),
    queryFn: ({ pageParam, signal }) => ep.politicians(id, filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/** Small search used by the action planner's politician picker. */
export const usePoliticianSearch = (id: string, search: string) =>
  useQuery({
    queryKey: keys.politicians(id, { search, sort: 'influence' }),
    queryFn: ({ signal }) =>
      ep.politicians(id, { search: search || undefined, sort: 'influence' }, undefined, signal, 12),
    placeholderData: (prev) => prev,
  });

export const usePolitician = (id: string, pid: string) =>
  useQuery({
    queryKey: keys.politician(id, pid),
    queryFn: ({ signal }) => ep.politician(id, pid, signal),
  });

export const useParliament = (id: string) =>
  useQuery({ queryKey: keys.parliament(id), queryFn: ({ signal }) => ep.parliament(id, signal) });

export const useParty = (id: string) =>
  useQuery({ queryKey: keys.party(id), queryFn: ({ signal }) => ep.party(id, signal) });

export const useHistory = (id: string, filters: HistoryFilters) =>
  useInfiniteQuery({
    queryKey: keys.history(id, filters),
    queryFn: ({ pageParam, signal }) => ep.history(id, filters, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/** The latest week's report, or null before the first advance. */
export const turnReportQuery = (id: string) =>
  queryOptions<TurnReport | null>({
    queryKey: keys.turnReport(id),
    queryFn: async ({ signal }) => {
      try {
        return await ep.latestTurnReport(id, signal);
      } catch (e) {
        if (isApiError(e, 'NOT_FOUND')) return null;
        throw e;
      }
    },
    // Only an advance changes it, and useAdvance writes the fresh report into the cache.
    staleTime: Infinity,
  });

export const useTurnReport = (id: string) => useQuery(turnReportQuery(id));

/* ----------------------------------------------------------------------------
 * Revision tracking for mutations (expectedRevision)
 * ------------------------------------------------------------------------- */

/** The revision the client last saw: the cached overview, else the summary (fetched if needed). */
export async function knownRevision(qc: QueryClient, id: string): Promise<number> {
  const state = qc.getQueryData<CareerOverview>(keys.state(id));
  if (state) return state.campaign.revision;
  const summary = await qc.fetchQuery(summaryQuery(id));
  return summary.revision;
}

/** Record a revision returned by a mutation, so a quick follow-up mutation sends it. */
function noteRevision(qc: QueryClient, id: string, revision: number) {
  qc.setQueryData<CareerOverview>(keys.state(id), (old) =>
    old ? { ...old, campaign: { ...old.campaign, revision } } : old,
  );
  qc.setQueryData<CampaignSummary>(keys.summary(id), (old) => (old ? { ...old, revision } : old));
}

async function invalidateCampaign(qc: QueryClient, id: string) {
  await Promise.all([
    qc.invalidateQueries({ queryKey: keys.campaign(id) }),
    qc.invalidateQueries({ queryKey: keys.campaigns }),
  ]);
}

/* ----------------------------------------------------------------------------
 * Mutations. The API client creates one Idempotency-Key per mutationFn call and reuses
 * it for its own retries; TanStack-level mutation retries are disabled.
 * ------------------------------------------------------------------------- */

export function useCreateCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCampaignRequest) => ep.createCampaign(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.campaigns }),
  });
}

export function useDeleteCampaign() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => ep.deleteCampaign(id),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: keys.campaign(id) });
      return qc.invalidateQueries({ queryKey: keys.campaigns });
    },
  });
}

export function usePlanAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: ActionRequest) =>
      ep.planAction(id, await knownRevision(qc, id), action),
    onSuccess: (res) => {
      qc.setQueryData<CareerOverview>(keys.state(id), (old) =>
        old
          ? {
              ...old,
              campaign: { ...old.campaign, revision: res.revision },
              diary: res.diary,
              standing: { ...old.standing, politicalCapital: res.politicalCapital },
            }
          : old,
      );
      noteRevision(qc, id, res.revision);
      return invalidateCampaign(qc, id);
    },
  });
}

export function useCancelAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (plannedId: string) =>
      ep.cancelAction(id, await knownRevision(qc, id), plannedId),
    onSuccess: (res) => {
      qc.setQueryData<CareerOverview>(keys.state(id), (old) =>
        old
          ? {
              ...old,
              diary: res.diary,
              standing: { ...old.standing, politicalCapital: res.politicalCapital },
            }
          : old,
      );
      noteRevision(qc, id, res.revision);
      return invalidateCampaign(qc, id);
    },
  });
}

export function useAdvance(id: string) {
  const qc = useQueryClient();
  const setTurnReportOpen = useUiStore((s) => s.setTurnReportOpen);
  return useMutation({
    mutationFn: async () => ep.advance(id, await knownRevision(qc, id)),
    onSuccess: async (report) => {
      // Drop any in-flight fetch of the previous report so it can't overwrite this one.
      await qc.cancelQueries({ queryKey: keys.turnReport(id) });
      qc.setQueryData(keys.turnReport(id), report);
      noteRevision(qc, id, report.revision);
      setTurnReportOpen(true);
      return invalidateCampaign(qc, id);
    },
  });
}
