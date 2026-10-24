import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 px-1.5 py-[3px] text-[11px] leading-none font-semibold whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'bg-secondary text-secondary-foreground',
        ink: 'bg-foreground text-background',
        whip: 'bg-whip text-white',
        good: 'bg-good/18 text-good-strong',
        warning: 'bg-warning/22 text-warning-strong',
        critical: 'bg-whip/15 text-whip',
        outline: 'border border-current/40 text-current',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps
  extends React.ComponentProps<'span'>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
