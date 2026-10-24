import { Button } from '@whip/ui';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { isApiError } from '../api/errors';

export function RouteError({ notFound = false }: { notFound?: boolean }) {
  const error = useRouteError();
  const missing =
    notFound ||
    (isRouteErrorResponse(error) && error.status === 404) ||
    isApiError(error, 'NOT_FOUND');
  return (
    <main className="grid min-h-dvh place-items-center bg-ink px-4 text-paper">
      <div className="max-w-md border-t-4 border-whip pt-4">
        <h1 className="font-display text-5xl leading-[0.9] font-black font-stretch-condensed">
          {missing ? 'No such page' : 'Something broke'}
        </h1>
        <p className="mt-3 text-sm text-paper/75">
          {missing
            ? 'That page or career doesn’t exist, or it has been deleted.'
            : error instanceof Error
              ? error.message
              : 'An unexpected error stopped this screen from loading.'}
        </p>
        <Button asChild variant="whip" className="mt-5">
          <Link to="/">Back to your careers</Link>
        </Button>
      </div>
    </main>
  );
}
