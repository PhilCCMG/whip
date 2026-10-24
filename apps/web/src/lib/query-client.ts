import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from '../api/errors';
import { toast } from '../stores/toast-store';

export const REVISION_CONFLICT_MESSAGE = 'Your career advanced on another device';

/** Errors shown inline by the screen that triggered them, not as toasts. */
const INLINE_CODES = new Set(['ACTION_INELIGIBLE', 'VALIDATION_FAILED']);

export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
      // The API client retries mutations itself, reusing the idempotency key.
      mutations: { retry: false },
    },
    mutationCache: new MutationCache({
      onError: (error, _vars, _ctx, mutation) => {
        // Mutations that render their own errors (sign-in) opt out of toasts.
        if (mutation.meta?.inlineErrors) return;
        if (error instanceof ApiError && error.code === 'REVISION_CONFLICT') {
          toast({
            id: 'revision-conflict',
            title: REVISION_CONFLICT_MESSAGE,
            description: 'Your diary has been refreshed. Check it before planning again.',
            tone: 'warning',
          });
          void client.invalidateQueries({ queryKey: ['campaign'] });
          void client.invalidateQueries({ queryKey: ['campaigns'] });
          // Another device may have played a week, so the latest report may be new too.
          void client.invalidateQueries({ queryKey: ['turn-report'] });
          return;
        }
        if (error instanceof ApiError && INLINE_CODES.has(error.code)) return;
        toast({ title: error.message, tone: 'critical' });
      },
    }),
  });
  return client;
}

export const queryClient = createQueryClient();
