import * as React from 'react';
import { cn } from '../lib/utils';
import { SectionLabel } from './section-label';

/** A hard-edged sheet with a heavy top rule. The WHIP equivalent of shadcn's Card. */
export function Panel({ className, ...props }: React.ComponentProps<'section'>) {
  return (
    <section
      className={cn('border-t-[3px] border-foreground bg-card text-card-foreground', className)}
      {...props}
    />
  );
}

export interface PanelHeaderProps extends Omit<React.ComponentProps<'header'>, 'title'> {
  number?: number | string | undefined;
  title: React.ReactNode;
  /** Id for the heading so the parent section can be `aria-labelledby` it. */
  titleId?: string | undefined;
  actions?: React.ReactNode;
}

export function PanelHeader({
  number,
  title,
  titleId,
  actions,
  className,
  children,
  ...props
}: PanelHeaderProps) {
  return (
    <header
      className={cn(
        'flex items-start justify-between gap-3 border-b border-border px-4 py-2.5',
        className,
      )}
      {...props}
    >
      <div className="min-w-0">
        <SectionLabel number={number} id={titleId}>
          {title}
        </SectionLabel>
        {children}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('px-4 py-3', className)} {...props} />;
}
