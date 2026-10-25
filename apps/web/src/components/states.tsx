import { Button, cn } from '@whip/ui';
import { LoaderCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { isApiError } from '../api/errors';

export function Loading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      className={cn('flex items-center gap-2 px-4 py-8 text-sm opacity-70', className)}
    >
      <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      {label}…
    </div>
  );
}

export function ErrorState({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const message = isApiError(error)
    ? error.code === 'NOT_FOUND'
      ? 'This could not be found. It may have been deleted.'
      : error.message
    : error instanceof Error
      ? error.message
      : 'Something went wrong.';
  return (
    <div role="alert" className={cn('border-l-4 border-whip px-4 py-3 text-sm', className)}>
      <p className="font-semibold">Something has gone wrong. A review has been ordered.</p>
      <p className="mt-0.5 opacity-75">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('px-4 py-6 text-sm opacity-65', className)}>{children}</p>;
}
