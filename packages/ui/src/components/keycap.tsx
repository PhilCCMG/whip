import * as React from 'react';
import { cn } from '../lib/utils';

export interface KeycapProps extends React.ComponentProps<'kbd'> {
  /** Draw on a light surface (ink outline) instead of a dark one. */
  tone?: 'dark' | 'light';
}

/** A keyboard key drawn as a flat outlined cap, for button-prompt bars and help text. */
export function Keycap({ tone = 'dark', className, ...props }: KeycapProps) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center border px-1.5 font-sans text-[11px] leading-none font-bold tabular-nums',
        tone === 'dark'
          ? 'border-paper/55 bg-ink text-paper-bright'
          : 'border-ink/60 bg-paper-bright text-ink',
        className,
      )}
      {...props}
    />
  );
}
