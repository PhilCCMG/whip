import { createBrowserRouter, type RouteObject } from 'react-router';
import { RouteError } from './components/route-error';

/** Data router with lazy route modules. Each module exports `Component`. */
export const routes: RouteObject[] = [
  {
    path: '/',
    errorElement: <RouteError />,
    children: [
      { index: true, lazy: () => import('./routes/campaign-select') },
      {
        path: 'c/:campaignId',
        lazy: () => import('./routes/campaign-layout'),
        errorElement: <RouteError />,
        children: [
          // handle.gameScreen: the screen draws its own header band and desk (see campaign-layout).
          { index: true, lazy: () => import('./routes/overview'), handle: { gameScreen: true } },
          {
            path: 'parliament',
            lazy: () => import('./routes/parliament'),
            handle: { gameScreen: true },
          },
          {
            path: 'politicians',
            lazy: () => import('./routes/politicians'),
            handle: { gameScreen: true },
          },
          {
            path: 'politicians/:politicianId',
            lazy: () => import('./routes/politician-profile'),
            handle: { gameScreen: true },
          },
          { path: 'party', lazy: () => import('./routes/party'), handle: { gameScreen: true } },
          { path: 'history', lazy: () => import('./routes/history'), handle: { gameScreen: true } },
        ],
      },
      { path: '*', element: <RouteError notFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
