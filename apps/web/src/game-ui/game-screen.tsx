import { cn, DisplayTitle, Kicker } from '@whip/ui';
import type { ReactNode } from 'react';
import menuBg from '../assets/menu-bg.jpg';

/**
 * A screen's header band: the place name, big, over a crop of the menu painting under a flat ink
 * veil (one solid layer at high opacity, never a gradient), closed by a red rule. Each place crops
 * the painting differently via `crop` (CSS object-position).
 */
export function GameScreenHeader({
  title,
  kicker,
  aside,
  crop = '62% 40%',
  titleId,
  className,
}: {
  title: ReactNode;
  kicker?: ReactNode | undefined;
  /** Right-hand readout (counts, a key action). */
  aside?: ReactNode;
  crop?: string | undefined;
  titleId?: string;
  className?: string;
}) {
  return (
    <header className={cn('relative isolate overflow-hidden bg-ink text-paper-bright', className)}>
      <img
        src={menuBg}
        alt=""
        aria-hidden="true"
        decoding="async"
        className="absolute inset-0 -z-10 size-full object-cover"
        style={{ objectPosition: crop }}
      />
      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-ink/[0.86]" />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 pt-6 pb-4 md:px-8 md:pt-8">
        <div className="min-w-0">
          {kicker && <Kicker className="mb-2 text-paper/75">{kicker}</Kicker>}
          <DisplayTitle as="h1" size="xl" slash id={titleId}>
            {title}
          </DisplayTitle>
        </div>
        {aside && <div className="flex items-end gap-4">{aside}</div>}
      </div>
      <div aria-hidden="true" className="h-[3px] bg-whip" />
    </header>
  );
}

/**
 * Section heading inside a screen: slash + condensed uppercase title on the desk, with an
 * optional right-hand slot. Use for the big regions of a screen (Diary, On your desk).
 */
export function DeskHeading({
  id,
  title,
  meta,
  actions,
  tone = 'desk',
  className,
}: {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  tone?: 'desk' | 'paper';
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <DisplayTitle
          as="h2"
          size="md"
          slash
          id={id}
          className={tone === 'desk' ? 'text-paper-bright' : 'text-ink'}
        >
          {title}
        </DisplayTitle>
        {meta && (
          <p
            className={cn(
              'mt-1.5 text-[12px] font-semibold tabular-nums',
              tone === 'desk' ? 'text-paper/75' : 'text-ink/70',
            )}
          >
            {meta}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
