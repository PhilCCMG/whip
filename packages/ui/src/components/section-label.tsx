import * as React from 'react';
import { cn } from '../lib/utils';

export interface SectionLabelProps extends React.ComponentProps<'h2'> {
  number?: number | string | undefined;
  as?: 'h2' | 'h3' | 'h4';
}

/** Numbered section label: a square red numeral tab, then a condensed bold heading. */
export function SectionLabel({
  number,
  as: Tag = 'h2',
  className,
  children,
  ...props
}: SectionLabelProps) {
  return (
    <Tag
      className={cn(
        'flex items-center gap-2 font-display text-[15px] leading-none font-extrabold font-stretch-condensed',
        className,
      )}
      {...props}
    >
      {number !== undefined && (
        <span
          aria-hidden="true"
          className="inline-flex h-[18px] min-w-[18px] items-center justify-center bg-whip px-1 text-[11px] font-bold text-white tabular font-stretch-normal"
        >
          {typeof number === 'number' ? String(number).padStart(2, '0') : number}
        </span>
      )}
      <span className="truncate">{children}</span>
    </Tag>
  );
}
