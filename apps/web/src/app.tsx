import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Toaster, TooltipProvider } from '@whip/ui';
import { useEffect, type ReactNode } from 'react';
import { RouterProvider } from 'react-router/dom';
import { queryClient as defaultClient } from './lib/query-client';
import { BootGate } from './features/boot/boot-sequence';
import { SESSION_EXPIRED_EVENT } from './platform';
import { UpdatePrompt } from './platform/update-prompt';
import { router } from './router';
import { useToastStore } from './stores/toast-store';

function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return <Toaster toasts={toasts} onDismiss={dismiss} />;
}

export function Providers({
  children,
  client = defaultClient,
}: {
  children: ReactNode;
  client?: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider delayDuration={250}>
        {children}
        <Toasts />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

/**
 * Desktop: a rejected (stale or revoked) bearer token has been cleared by the API client. Drop
 * the player's cached data and go back to the SIGN IN screen.
 */
function SessionExpiredRedirect({ client }: { client: QueryClient }) {
  useEffect(() => {
    const onExpired = () => {
      client.removeQueries({ queryKey: ['campaign'] });
      client.removeQueries({ queryKey: ['campaigns'] });
      void client.invalidateQueries({ queryKey: ['me'] });
      void router.navigate({ pathname: '/', search: '?screen=signin' }, { replace: true });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [client]);
  return null;
}

export function App() {
  return (
    <Providers>
      <BootGate>
        <RouterProvider router={router} />
        {/* Desktop only (renders nothing on the web): update available / update required. */}
        <UpdatePrompt />
      </BootGate>
      <SessionExpiredRedirect client={defaultClient} />
    </Providers>
  );
}
