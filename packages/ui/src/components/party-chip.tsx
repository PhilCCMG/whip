import * as React from 'react';
import { cn } from '../lib/utils';

export interface PartyChipProps extends React.ComponentProps<'span'> {
  colour: string | null | undefined;
  label: React.ReactNode;
  size?: 'sm' | 'md';
}

/** A party marker: a colour bar and short name. The colour comes from data. */
export function PartyChip({ colour, label, size = 'sm', className, ...props }: PartyChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-semibold whitespace-nowrap',
        size === 'sm' ? 'text-[11px]' : 'text-sm',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('shrink-0', size === 'sm' ? 'h-3 w-1.5' : 'h-4 w-2')}
        style={{ backgroundColor: colour ?? 'var(--color-moss-400)' }}
      />
      {label}
    </span>
  );
}
