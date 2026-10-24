import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { Toaster, TooltipProvider } from '@whip/ui';
import type { ReactNode } from 'react';
import { RouterProvider } from 'react-router/dom';
import { queryClient as defaultClient } from './lib/query-client';
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

export function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}
