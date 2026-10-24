import { ScrollArea as ScrollAreaPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export interface ScrollAreaProps extends React.ComponentProps<typeof ScrollAreaPrimitive.Root> {
  viewportClassName?: string;
}

export function ScrollArea({ className, children, viewportClassName, ...props }: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root className={cn('relative overflow-hidden', className)} {...props}>
      <ScrollAreaPrimitive.Viewport
        className={cn(
          'size-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          viewportClassName,
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollAreaPrimitive.Scrollbar
        orientation="vertical"
        className="flex w-2 touch-none p-px select-none"
      >
        <ScrollAreaPrimitive.Thumb className="relative flex-1 bg-current/25" />
      </ScrollAreaPrimitive.Scrollbar>
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}
