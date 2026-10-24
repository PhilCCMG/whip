import * as React from 'react';
import { cn } from '../lib/utils';

type SegmentKey = 'aye' | 'abstain' | 'unknown' | 'no';

export interface VoteBarProps extends React.ComponentProps<'div'> {
  ayes: number;
  noes: number;
  abstain?: number;
  unknown?: number;
  /** Votes needed to win, drawn as a tick on the bar. */
  threshold?: number | undefined;
  showLegend?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const segClass: Record<SegmentKey, string> = {
  aye: 'bg-aye',
  no: 'bg-no',
  abstain: 'bg-abstain',
  unknown:
    'bg-unknown bg-[repeating-linear-gradient(135deg,transparent_0_3px,rgb(0_0_0/0.16)_3px_5px)]',
};

const labels: Record<SegmentKey, string> = {
  aye: 'Ayes',
  no: 'Noes',
  abstain: 'Abstain',
  unknown: 'Unknown',
};

/** Ayes, abstentions, unknowns and noes as one horizontal bar. */
export function VoteBar({
  ayes,
  noes,
  abstain = 0,
  unknown = 0,
  threshold,
  showLegend = true,
  size = 'md',
  className,
  ...props
}: VoteBarProps) {
  const segments: { key: SegmentKey; value: number }[] = [
    { key: 'aye', value: ayes },
    { key: 'abstain', value: abstain },
    { key: 'unknown', value: unknown },
    { key: 'no', value: noes },
  ];
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const summary = segments
    .filter((s) => s.value > 0)
    .map((s) => `${labels[s.key]} ${s.value}`)
    .join(', ');
  return (
    <div className={cn('grid gap-1.5', className)} {...props}>
      <div
        role="img"
        aria-label={summary}
        className={cn(
          'relative flex w-full gap-px overflow-hidden',
          size === 'sm' ? 'h-2' : size === 'md' ? 'h-3.5' : 'h-7',
        )}
      >
        {segments.map((s) =>
          s.value > 0 ? (
            <span
              key={s.key}
              className={cn('h-full', segClass[s.key])}
              style={{ width: `${(s.value / total) * 100}%` }}
            />
          ) : null,
        )}
        {threshold !== undefined && (
          <span
            aria-hidden="true"
            className="absolute inset-y-0 w-0.5 bg-current"
            style={{ left: `${(threshold / total) * 100}%` }}
          />
        )}
      </div>
      {showLegend && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {segments.map((s) =>
            s.value > 0 || s.key === 'aye' || s.key === 'no' ? (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className={cn('size-2.5', segClass[s.key])} />
                <span className="opacity-70">{labels[s.key]}</span>
                <span className="font-semibold tabular">{s.value}</span>
              </span>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
