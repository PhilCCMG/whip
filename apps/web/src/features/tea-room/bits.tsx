import { cn } from '@whip/ui';
import type { KnownVote, RelationshipSummary } from '../../api/types';
import { signed } from '../../lib/format';

/* ----------------------------------------------------------------------------
 * Vote intention as a stamped chip. Unknown is a "?" (fog of war).
 * Filled blocks, so the same stamp reads on ink and on paper.
 * ------------------------------------------------------------------------- */

const VOTE_STYLE = {
  aye: 'bg-good-strong text-paper-bright',
  no: 'bg-whip-dark text-white',
  abstain: 'bg-paper-deep text-ink',
  unknown: 'bg-transparent text-current outline-2 -outline-offset-2 outline-current/60',
} as const;
const VOTE_TEXT = { aye: 'Aye', no: 'No', abstain: 'Abstain', unknown: '?' } as const;
const VOTE_SR = {
  aye: 'Intends to vote aye',
  no: 'Intends to vote no',
  abstain: 'Intends to abstain',
  unknown: 'Voting intention unknown',
} as const;

export function IntentionStamp({
  vote,
  size = 'sm',
  angle,
  className,
}: {
  vote: KnownVote | null;
  size?: 'sm' | 'lg';
  angle?: number;
  className?: string;
}) {
  if (!vote) {
    return (
      <span className={cn('text-[11px] font-semibold opacity-60', className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No division scheduled</span>
      </span>
    );
  }
  return (
    <span
      data-vote={vote}
      className={cn(
        'inline-flex items-center justify-center font-display font-black tracking-[0.05em] uppercase [font-stretch:72%]',
        size === 'sm' ? 'h-6 min-w-6 px-1.5 text-[13px]' : 'h-11 min-w-11 px-3 text-[1.6rem]',
        'leading-none',
        VOTE_STYLE[vote],
        className,
      )}
      style={{ rotate: `${angle ?? (vote === 'unknown' ? 0 : -3)}deg` }}
    >
      <span aria-hidden="true">{VOTE_TEXT[vote]}</span>
      <span className="sr-only">{VOTE_SR[vote]}</span>
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Compact signed pips (trust / respect / affinity), filling out from the centre.
 * ------------------------------------------------------------------------- */

export function MiniPips({
  label,
  value,
  tone = 'ink',
  half = 3,
}: {
  label: string;
  value: number;
  tone?: 'ink' | 'paper';
  half?: number;
}) {
  const mag = Math.min(Math.abs(value), 100);
  // Any non-zero opinion shows at least one pip.
  const n = mag === 0 ? 0 : Math.max(1, Math.round((mag / 100) * half));
  const on = tone === 'ink' ? 'bg-ink' : 'bg-paper-bright';
  const off = tone === 'ink' ? 'bg-ink/12' : 'bg-paper/15';
  return (
    <span
      role="img"
      aria-label={`${label} ${signed(Math.round(value))}`}
      className="inline-grid gap-[3px]"
    >
      <span aria-hidden="true" className="flex items-baseline justify-between gap-1.5 leading-none">
        <span className="text-[9px] font-bold tracking-[0.08em] uppercase opacity-70">
          {label.slice(0, 3)}
        </span>
        <span
          className={cn(
            'font-display text-[13px] font-black tabular-nums [font-stretch:75%]',
            value < 0 && (tone === 'ink' ? 'text-whip' : 'text-lamp'),
          )}
        >
          {signed(Math.round(value))}
        </span>
      </span>
      <span aria-hidden="true" className="flex gap-px">
        {Array.from({ length: half * 2 }, (_, i) => {
          const neg = value < 0 && i < half && i >= half - n;
          const pos = value > 0 && i >= half && i < half + n;
          return (
            <span
              key={i}
              className={cn(
                'h-1.5 w-[6px]',
                neg ? 'bg-whip' : pos ? on : off,
                i === half && 'ml-[2px]',
              )}
            />
          );
        })}
      </span>
    </span>
  );
}

/** Rivalry 0..3 as crossed red slashes. */
export function RivalryMarks({ level, className }: { level: number; className?: string }) {
  if (level <= 0) return null;
  return (
    <span
      role="img"
      aria-label={`Rivalry ${level} of 3`}
      className={cn('inline-flex items-center gap-0.5', className)}
    >
      {Array.from({ length: level }, (_, i) => (
        <svg key={i} viewBox="0 0 16 16" aria-hidden="true" className="size-3.5 fill-whip">
          <polygon points="10,0 14,0 6,16 2,16" />
          <polygon points="2,0 6,0 14,16 10,16" />
        </svg>
      ))}
    </span>
  );
}

/** Their view of the player: T/R/A pips plus rivalry. */
export function RelationPips({
  rel,
  tone = 'ink',
  className,
}: {
  rel: RelationshipSummary | null;
  tone?: 'ink' | 'paper';
  className?: string;
}) {
  if (!rel)
    return (
      <span className={cn('text-[11px] font-semibold opacity-70', className)}>Not acquainted</span>
    );
  return (
    <span
      role="group"
      aria-label="Their view of you"
      className={cn('inline-flex flex-wrap items-center gap-x-2.5 gap-y-1', className)}
    >
      <MiniPips label="Trust" value={rel.trust} tone={tone} />
      <MiniPips label="Respect" value={rel.respect} tone={tone} />
      <MiniPips label="Affinity" value={rel.affinity} tone={tone} />
      <RivalryMarks level={rel.rivalry} />
    </span>
  );
}

/* ----------------------------------------------------------------------------
 * Ideology compass: a flat, hard-edged two-axis plot.
 * ------------------------------------------------------------------------- */

export interface CompassPoint {
  id: string;
  label: string;
  economic: number;
  social: number;
  /** `them`: filled red diamond; `you`: outlined square; `mark`: small filled square in a colour. */
  kind: 'them' | 'you' | 'mark';
  colour?: string | undefined;
  /** Draw the mark without its printed label (it stays in the accessible description). */
  quiet?: boolean;
}

export function Compass({
  points,
  tone = 'ink',
  className,
  labelPoints = false,
  domain = 100,
}: {
  points: CompassPoint[];
  tone?: 'ink' | 'paper';
  className?: string;
  /** Print short labels next to marks (Party HQ). */
  labelPoints?: boolean;
  /** Half-width of the plotted range (100 = the whole scale); zoom in for clustered marks. */
  domain?: number;
}) {
  const clamp = (v: number) => Math.max(-domain, Math.min(domain, v));
  const x = (v: number) => 50 + (clamp(v) / domain) * 44;
  const y = (v: number) => 50 - (clamp(v) / domain) * 44;
  const fg = tone === 'ink' ? 'var(--color-ink)' : 'var(--color-paper-bright)';
  const you = points.find((p) => p.kind === 'you');
  const them = points.find((p) => p.kind === 'them');
  const desc = points
    .map(
      (p) =>
        `${p.label}: economic ${signed(Math.round(p.economic))}, social ${signed(Math.round(p.social))}`,
    )
    .join('. ');
  return (
    <svg viewBox="0 0 100 100" role="img" aria-label={`Ideology. ${desc}`} className={className}>
      {/* Quadrant fills: alternate flat tints, no gradients. */}
      <rect x={6} y={6} width={44} height={44} fill={fg} fillOpacity={0.05} />
      <rect x={50} y={50} width={44} height={44} fill={fg} fillOpacity={0.05} />
      <rect
        x={6}
        y={6}
        width={88}
        height={88}
        fill="none"
        stroke={fg}
        strokeOpacity={0.35}
        strokeWidth={0.6}
      />
      {[-domain / 2, domain / 2].map((v) => (
        <g key={v} stroke={fg} strokeOpacity={0.12} strokeWidth={0.4}>
          <line x1={x(v)} y1={6} x2={x(v)} y2={94} />
          <line x1={6} y1={y(v)} x2={94} y2={y(v)} />
        </g>
      ))}
      <line x1={50} y1={6} x2={50} y2={94} stroke={fg} strokeOpacity={0.5} strokeWidth={0.6} />
      <line x1={6} y1={50} x2={94} y2={50} stroke={fg} strokeOpacity={0.5} strokeWidth={0.6} />
      <g
        fill={fg}
        fillOpacity={0.7}
        fontSize={3.4}
        fontWeight={700}
        letterSpacing={0.3}
        style={{ textTransform: 'uppercase' }}
      >
        <text x={7.5} y={48}>
          Left
        </text>
        <text x={92.5} y={48} textAnchor="end">
          Right
        </text>
        <text x={51.5} y={10}>
          Traditional
        </text>
        <text x={51.5} y={92.5}>
          Liberal
        </text>
      </g>
      {you && them && (
        <line
          x1={x(you.economic)}
          y1={y(you.social)}
          x2={x(them.economic)}
          y2={y(them.social)}
          stroke={fg}
          strokeOpacity={0.45}
          strokeWidth={0.5}
          strokeDasharray="1.2 1"
        />
      )}
      {points.map((p) => {
        const cx = x(p.economic);
        const cy = y(p.social);
        if (p.kind === 'them')
          return (
            <polygon
              key={p.id}
              points={`${cx},${cy - 3.6} ${cx + 3.6},${cy} ${cx},${cy + 3.6} ${cx - 3.6},${cy}`}
              fill="var(--color-whip)"
            />
          );
        if (p.kind === 'you')
          return (
            <rect
              key={p.id}
              x={cx - 2.4}
              y={cy - 2.4}
              width={4.8}
              height={4.8}
              fill="none"
              stroke={fg}
              strokeWidth={1}
            />
          );
        return (
          <g key={p.id}>
            <rect x={cx - 2} y={cy - 2} width={4} height={4} fill={p.colour ?? fg} />
            {labelPoints && !p.quiet && (
              <text
                x={cx + 3.2}
                y={cy + 1.2}
                fontSize={3.2}
                fontWeight={700}
                fill={fg}
                style={{ textTransform: 'uppercase' }}
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
