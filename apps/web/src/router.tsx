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
          { index: true, lazy: () => import('./routes/overview') },
          { path: 'parliament', lazy: () => import('./routes/parliament') },
          { path: 'politicians', lazy: () => import('./routes/politicians') },
          { path: 'politicians/:politicianId', lazy: () => import('./routes/politician-profile') },
          { path: 'party', lazy: () => import('./routes/party') },
          { path: 'history', lazy: () => import('./routes/history') },
        ],
      },
      { path: '*', element: <RouteError notFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
