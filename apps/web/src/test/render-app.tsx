import { render } from '@testing-library/react';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { setApiFetch } from '../api/runtime';
import { Providers } from '../app';
import { createQueryClient } from '../lib/query-client';
import { createMockBackend } from '../mocks/backend';
import { routes as appRoutes } from '../router';

/** Render the real routes against a fresh in-memory mock backend. */
export function renderApp(path: string, routes: RouteObject[] = appRoutes) {
  const backend = createMockBackend({ latencyMs: 0 });
  setApiFetch(backend.fetch);
  const client = createQueryClient();
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const utils = render(
    <Providers client={client}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...utils, backend, client, router };
}
