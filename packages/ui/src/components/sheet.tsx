import { X } from 'lucide-react';
import { Dialog as SheetPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;
export const SheetClose = SheetPrimitive.Close;
export const SheetTitle = SheetPrimitive.Title;
export const SheetDescription = SheetPrimitive.Description;

export interface SheetContentProps extends React.ComponentProps<typeof SheetPrimitive.Content> {
  side?: 'right' | 'bottom' | 'left';
}

const sideClass = {
  right: 'inset-y-0 right-0 h-full w-[min(92vw,400px)] border-l motion-safe:animate-in-left',
  left: 'inset-y-0 left-0 h-full w-[min(92vw,400px)] border-r motion-safe:animate-in-right',
  bottom: 'inset-x-0 bottom-0 max-h-[85dvh] border-t-4 border-t-whip motion-safe:animate-in-rise',
} as const;

export function SheetContent({ side = 'right', className, children, ...props }: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-ink/60 motion-safe:animate-in-fade" />
      <SheetPrimitive.Content
        className={cn(
          'fixed z-50 flex flex-col border-border bg-background text-foreground focus:outline-none',
          sideClass[side],
          className,
        )}
        {...props}
      >
        {children}
        <SheetPrimitive.Close
          className="absolute top-3 right-3 inline-flex size-8 cursor-pointer items-center justify-center text-current/70 hover:bg-current/10 hover:text-current focus-visible:outline-2 focus-visible:outline-ring"
          aria-label="Close"
        >
          <X className="size-4" />
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
