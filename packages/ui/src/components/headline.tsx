import * as React from 'react';
import { cn } from '../lib/utils';

export interface HeadlineProps extends Omit<React.ComponentProps<'article'>, 'title'> {
  text: React.ReactNode;
  standfirst?: React.ReactNode | undefined;
  /** 1–5. Importance 5 is a front-page splash. */
  importance: number;
  as?: 'h2' | 'h3' | 'h4';
}

const sizeByImportance: Record<number, string> = {
  5: 'text-[2.5rem] sm:text-[3.25rem] leading-[0.9] font-black',
  4: 'text-2xl sm:text-[1.75rem] leading-[0.95] font-extrabold',
  3: 'text-xl leading-none font-extrabold',
  2: 'text-lg leading-tight font-bold',
  1: 'text-base leading-tight font-bold',
};

/** Newspaper-style headline. Size follows editorial importance. */
export function Headline({
  text,
  standfirst,
  importance,
  as: Tag = 'h3',
  className,
  ...props
}: HeadlineProps) {
  return (
    <article className={cn('min-w-0', className)} {...props}>
      <Tag
        className={cn(
          'font-display text-balance font-stretch-condensed',
          sizeByImportance[importance] ?? sizeByImportance[2],
        )}
      >
        {text}
      </Tag>
      {standfirst && (
        <p
          className={cn(
            'mt-2 max-w-[62ch] text-pretty opacity-75',
            importance >= 4 ? 'text-[15px] leading-snug' : 'text-[13px] leading-snug',
          )}
        >
          {standfirst}
        </p>
      )}
    </article>
  );
}
