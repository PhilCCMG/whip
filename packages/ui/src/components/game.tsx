/**
 * WHIP in-game primitives (docs/architecture/09-game-ui.md). Flat fills, hard edges, the logo
 * slash as the recurring angle. Nothing here uses gradients, glows, blur or drop shadows.
 */
import * as React from 'react';
import { cn } from '../lib/utils';

/* ----------------------------------------------------------------------------
 * Slash: the red stroke from the wordmark (cursor, bullets, section marks)
 * ------------------------------------------------------------------------- */

export function Slash({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 64"
      aria-hidden="true"
      focusable="false"
      className={cn('fill-whip', className)}
    >
      <polygon points="15,0 24,0 9,64 0,64" />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
 * Plate: a header block whose right edge leans at the slash angle (~13°)
 * ------------------------------------------------------------------------- */

const plateTone = {
  ink: 'bg-ink text-paper-bright',
  paper: 'bg-paper-bright text-ink',
  whip: 'bg-whip text-white',
} as const;

export interface PlateProps extends React.ComponentProps<'div'> {
  tone?: keyof typeof plateTone;
  /** Lean the right edge (default) or both edges (a parallelogram tab). */
  edge?: 'right' | 'both' | 'none';
  /** A thin red stripe riding the angled edge, as on the menu's ink panel. */
  stripe?: boolean;
}

/**
 * A flat block with an angled edge, the in-game equivalent of the menu's ink panel. The lean is
 * a fixed 0.55em run, so it scales with the plate's text.
 */
export function Plate({
  tone = 'ink',
  edge = 'right',
  stripe = false,
  className,
  children,
  ...props
}: PlateProps) {
  const clip =
    edge === 'right'
      ? '[clip-path:polygon(0_0,100%_0,calc(100%-0.55em)_100%,0_100%)] pr-[1.1em]'
      : edge === 'both'
        ? '[clip-path:polygon(0.55em_0,100%_0,calc(100%-0.55em)_100%,0_100%)] px-[1.1em]'
        : '';
  return (
    <div className={cn('relative', plateTone[tone], clip, className)} {...props}>
      {children}
      {stripe && edge !== 'none' && (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 right-0 w-[0.85em] bg-whip [clip-path:polygon(calc(100%-0.25em)_0,100%_0,calc(100%-0.55em)_100%,calc(100%-0.8em)_100%)]"
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * Kicker: the small uppercase line above a title (HUD-style label)
 * ------------------------------------------------------------------------- */

export function Kicker({ className, ...props }: React.ComponentProps<'p'>) {
  return (
    <p
      className={cn(
        'text-[11px] leading-none font-bold tracking-[0.08em] uppercase tabular-nums',
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Display title: big condensed uppercase Archivo, with the slash
 * ------------------------------------------------------------------------- */

export interface DisplayTitleProps extends React.ComponentProps<'h1'> {
  as?: 'h1' | 'h2' | 'h3';
  size?: 'xl' | 'lg' | 'md' | 'sm';
  slash?: boolean;
}

const titleSize = {
  xl: 'text-[clamp(2.75rem,5.5vw,5rem)] leading-[0.86]',
  lg: 'text-[clamp(2rem,3.6vw,3rem)] leading-[0.88]',
  md: 'text-[1.6rem] leading-[0.9]',
  sm: 'text-[1.15rem] leading-[0.95]',
} as const;

export function DisplayTitle({
  as: Tag = 'h2',
  size = 'lg',
  slash = false,
  className,
  children,
  ...props
}: DisplayTitleProps) {
  return (
    <Tag
      className={cn(
        'font-display font-black tracking-[-0.005em] uppercase [font-stretch:68%]',
        titleSize[size],
        slash && 'flex items-start gap-[0.2em]',
        className,
      )}
      {...props}
    >
      {slash && <Slash className="mt-[0.05em] h-[0.82em] w-auto shrink-0" />}
      {slash ? <span className="min-w-0">{children}</span> : children}
    </Tag>
  );
}

/* ----------------------------------------------------------------------------
 * Paper sheet: a document lying on the desk (diary page, newspaper, letter)
 * ------------------------------------------------------------------------- */

export interface SheetPaperProps extends React.HTMLAttributes<HTMLElement> {
  /** A slight rotation, as if put down by hand. Use on at most one or two sheets per screen. */
  tilt?: 'left' | 'right' | 'none';
  tone?: 'paper' | 'bright' | 'deep';
  as?: 'section' | 'article' | 'div';
}

const paperTone = {
  paper: 'bg-paper',
  bright: 'bg-paper-bright',
  deep: 'bg-paper-deep',
} as const;

export function PaperSheet({
  tilt = 'none',
  tone = 'paper',
  as: Tag = 'section',
  className,
  ...props
}: SheetPaperProps) {
  return (
    <Tag
      className={cn(
        'relative text-ink',
        paperTone[tone],
        tilt === 'left' && 'md:-rotate-[0.6deg]',
        tilt === 'right' && 'md:rotate-[0.6deg]',
        className,
      )}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Stamp: a rubber-stamped verdict (SUCCESS / PARTIAL / FAILED, PASSED / DEFEATED)
 * ------------------------------------------------------------------------- */

const stampTone = {
  good: 'text-good-strong border-good-strong',
  warning: 'text-warning-strong border-warning-strong',
  bad: 'text-whip border-whip',
  ink: 'text-ink border-ink',
  paper: 'text-paper-bright border-paper-bright',
} as const;

export interface StampProps extends React.ComponentProps<'span'> {
  tone?: keyof typeof stampTone;
  size?: 'sm' | 'md' | 'lg';
  /** Rotation in degrees (stamps are never quite straight). */
  angle?: number;
}

export function Stamp({
  tone = 'ink',
  size = 'md',
  angle = -4,
  className,
  style,
  ...props
}: StampProps) {
  return (
    <span
      className={cn(
        'inline-block border-[3px] font-display leading-none font-black tracking-[0.04em] whitespace-nowrap uppercase [font-stretch:75%]',
        size === 'sm' && 'border-2 px-1.5 py-0.5 text-[13px]',
        size === 'md' && 'px-2 py-1 text-xl',
        size === 'lg' && 'border-4 px-3 py-1.5 text-4xl',
        stampTone[tone],
        className,
      )}
      style={{ rotate: `${angle}deg`, ...style }}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------------------
 * Resource counter: a big tabular number with its unit and weekly change
 * ------------------------------------------------------------------------- */

export interface ResourceCounterProps extends React.ComponentProps<'div'> {
  label: string;
  value: React.ReactNode;
  /** e.g. "+1/wk"; tinted by sign when `deltaTone` is given. */
  delta?: React.ReactNode;
  deltaTone?: 'good' | 'bad' | 'neutral';
  icon?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function ResourceCounter({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  icon,
  size = 'md',
  className,
  ...props
}: ResourceCounterProps) {
  return (
    <div className={cn('flex items-center gap-2', className)} {...props}>
      {icon && (
        <span aria-hidden="true" className="shrink-0">
          {icon}
        </span>
      )}
      <span
        data-numeric
        className={cn(
          'font-display leading-none font-black tabular-nums [font-stretch:75%]',
          size === 'sm' && 'text-xl',
          size === 'md' && 'text-[1.75rem]',
          size === 'lg' && 'text-5xl',
        )}
      >
        {value}
      </span>
      <span className="flex flex-col gap-0.5 text-[10px] leading-none font-bold tracking-[0.08em] uppercase">
        <span className="opacity-75">{label}</span>
        {delta !== undefined && (
          <span
            className={cn(
              'tabular-nums',
              deltaTone === 'good' && 'text-good',
              deltaTone === 'bad' && 'text-whip',
              deltaTone === 'neutral' && 'opacity-75',
            )}
          >
            {delta}
          </span>
        )}
      </span>
    </div>
  );
}

/** Political capital's mark: a flat diamond (a "chip" of capital). */
export function CapitalIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className={cn('size-[1em]', className)}
    >
      <polygon points="8,0 16,8 8,16 0,8" fill="currentColor" />
      <polygon points="8,4 12,8 8,12 4,8" fill="var(--color-ink)" opacity="0.35" />
    </svg>
  );
}

/* ----------------------------------------------------------------------------
 * Cost chips: diary-slot pips and capital
 * ------------------------------------------------------------------------- */

export interface CostChipProps extends React.ComponentProps<'span'> {
  kind: 'slots' | 'capital';
  value: number;
  /** Over budget: red. */
  short?: boolean;
  tone?: 'ink' | 'paper';
}

/** Slots render as pips (▮▮), capital as ◆ n. The accessible text spells it out. */
export function CostChip({
  kind,
  value,
  short = false,
  tone = 'ink',
  className,
  ...props
}: CostChipProps) {
  const text =
    kind === 'slots'
      ? value === 0
        ? 'No diary slot'
        : `${value} diary ${value === 1 ? 'slot' : 'slots'}`
      : `${value} political capital`;
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 px-1.5 text-[12px] leading-none font-bold tabular-nums',
        tone === 'ink' ? 'bg-ink text-paper-bright' : 'bg-paper-bright text-ink',
        short && 'bg-whip text-white',
        className,
      )}
      {...props}
    >
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="flex items-center gap-1.5">
        {kind === 'slots' ? (
          value === 0 ? (
            <span className="text-[10px] tracking-[0.08em] uppercase">No slot</span>
          ) : (
            <>
              <span className="flex gap-[2px]">
                {Array.from({ length: Math.min(value, 5) }, (_, i) => (
                  <span key={i} className="h-3 w-[5px] bg-current" />
                ))}
              </span>
              <span className="text-[10px] tracking-[0.08em] uppercase">
                {value === 1 ? 'Slot' : 'Slots'}
              </span>
            </>
          )
        ) : (
          <>
            <CapitalIcon className="text-[11px]" />
            {value}
          </>
        )}
      </span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Pip meter: a stat as discrete segments (character sheet, reputation)
 * ------------------------------------------------------------------------- */

export interface PipMeterProps extends React.ComponentProps<'div'> {
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** Number of segments. */
  pips?: number;
  /** Show the signed/unsigned value at the end. */
  display?: React.ReactNode;
  tone?: 'ink' | 'paper';
}

/**
 * A labelled stat drawn as N flat segments. Signed scales (min < 0) fill from the centre: red
 * segments to the left for negative, ink/paper to the right for positive.
 */
export function PipMeter({
  label,
  value,
  min = 0,
  max = 20,
  pips = 10,
  display,
  tone = 'ink',
  className,
  ...props
}: PipMeterProps) {
  const signedScale = min < 0;
  const on = tone === 'ink' ? 'bg-ink' : 'bg-paper-bright';
  const off = tone === 'ink' ? 'bg-ink/12' : 'bg-paper/15';
  let cells: string[];
  if (signedScale) {
    const half = Math.floor(pips / 2);
    const n = Math.round((Math.min(Math.abs(value), max) / max) * half);
    cells = Array.from({ length: half * 2 }, (_, i) => {
      if (value < 0 && i < half && i >= half - n) return 'bg-whip';
      if (value > 0 && i >= half && i < half + n) return on;
      return off;
    });
  } else {
    const n = Math.round(((Math.min(Math.max(value, min), max) - min) / (max - min)) * pips);
    cells = Array.from({ length: pips }, (_, i) => (i < n ? on : off));
  }
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1', className)}
      {...props}
    >
      <span className="truncate text-[12px] font-semibold">{label}</span>
      <span className="text-right font-display text-[15px] leading-none font-black tabular-nums [font-stretch:75%]">
        {display ?? Math.round(value)}
      </span>
      <span aria-hidden="true" className="col-span-2 flex gap-[2px]">
        {cells.map((c, i) => (
          <span
            key={i}
            className={cn('h-2 flex-1', c, signedScale && i === cells.length / 2 && 'ml-[3px]')}
          />
        ))}
      </span>
    </div>
  );
}
