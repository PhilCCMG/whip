import { ChevronDown } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/utils';
import { fieldClass } from './input';

export interface SelectProps extends React.ComponentProps<'select'> {
  wrapperClassName?: string;
}

/** A styled native select: fully accessible, keyboard- and mobile-friendly. */
export function Select({ className, wrapperClassName, children, ...props }: SelectProps) {
  return (
    <div className={cn('relative', wrapperClassName)}>
      <select
        className={cn(fieldClass, 'cursor-pointer appearance-none pr-9', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}
