import * as React from 'react';
import { cn } from '../lib/utils';

export const fieldClass = cn(
  'h-10 w-full min-w-0 border border-input bg-background px-3 text-sm text-foreground',
  'placeholder:text-muted-foreground disabled:opacity-50',
  'focus-visible:border-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring',
  'aria-invalid:border-whip',
);

export function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} className={cn(fieldClass, className)} {...props} />;
}

export function Label({ className, ...props }: React.ComponentProps<'label'>) {
  return (
    <label className={cn('text-xs font-semibold text-muted-foreground', className)} {...props} />
  );
}
