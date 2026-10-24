import * as React from 'react';
import { cn } from '../lib/utils';
import { Meter } from './meter';

export interface StatMeterProps extends React.ComponentProps<'div'> {
  label: React.ReactNode;
  value: number;
  min?: number;
  max?: number;
  /** Text shown in place of the number (e.g. "+12"). */
  display?: React.ReactNode;
  colour?: string | undefined;
  centred?: boolean;
  /** FM-style: colour the fill and value by band (low red, high green). */
  banded?: boolean;
}

export function bandColour(fraction: number): string {
  if (fraction >= 0.75) return 'var(--color-good)';
  if (fraction >= 0.5) return 'var(--color-moss-400)';
  if (fraction >= 0.3) return 'var(--color-warning)';
  return 'var(--color-whip)';
}

/** Label and value on one line, with a meter underneath. */
export function StatMeter({
  label,
  value,
  min = 0,
  max = 100,
  display,
  colour,
  centred = false,
  banded = false,
  className,
  ...props
}: StatMeterProps) {
  const fraction = (value - min) / (max - min || 1);
  const fill = colour ?? (banded ? bandColour(fraction) : undefined);
  return (
    <div className={cn('grid gap-1', className)} {...props}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate opacity-75">{label}</span>
        <span className="font-semibold tabular">{display ?? Math.round(value)}</span>
      </div>
      <Meter
        value={value}
        min={min}
        max={max}
        colour={fill}
        centred={centred}
        aria-label={typeof label === 'string' ? label : undefined}
      />
    </div>
  );
}
