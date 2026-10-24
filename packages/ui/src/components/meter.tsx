import { Progress as ProgressPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

export interface MeterProps extends Omit<
  React.ComponentProps<typeof ProgressPrimitive.Root>,
  'value' | 'max'
> {
  value: number;
  min?: number;
  max?: number;
  /** CSS colour for the fill; defaults to the current text colour. */
  colour?: string | undefined;
  /** Bipolar scale (e.g. -100..100): fill from zero and draw a centre tick. */
  centred?: boolean;
}

/** A thin, hard-edged meter. */
export function Meter({
  value,
  min = 0,
  max = 100,
  colour,
  centred = false,
  className,
  ...props
}: MeterProps) {
  const span = max - min || 1;
  const clamped = Math.min(max, Math.max(min, value));
  const pct = ((clamped - min) / span) * 100;
  const zero = centred ? ((0 - min) / span) * 100 : 0;
  const left = Math.min(pct, zero);
  const width = Math.abs(pct - zero);
  return (
    <ProgressPrimitive.Root
      value={Math.round(pct)}
      max={100}
      className={cn('relative h-1.5 w-full overflow-hidden bg-current/12', className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className="absolute inset-y-0 bg-current"
        style={{ left: `${left}%`, width: `${width}%`, backgroundColor: colour }}
      />
      {centred && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 w-px bg-current/60"
          style={{ left: `${zero}%` }}
        />
      )}
    </ProgressPrimitive.Root>
  );
}
