import { cn, WhipIcon } from '@whip/ui';
import { formatNumber } from '../../lib/format';
import { GENDERS, labelOf, PRESETS, SEAT, STRENGTHS, type Player } from './copy';

/** Live preview of the Member being created: a flat paper Commons pass. */
export function CandidateCard({
  player,
  saveName,
  className,
}: {
  player: Player;
  saveName: string;
  className?: string;
}) {
  const first = player.firstName.trim();
  const last = player.lastName.trim();
  const named = !!(first || last);
  const rows: [string, string][] = [
    ['Majority', formatNumber(SEAT.majority)],
    ['Strength', labelOf(STRENGTHS, player.strength)],
    ['Leaning', labelOf(PRESETS, player.ideologyPreset)],
    ['Gender', labelOf(GENDERS, player.gender)],
  ];
  return (
    <figure
      aria-label="Your candidate"
      className={cn('w-[min(100%,24rem)] bg-paper-bright text-ink', className)}
    >
      <div className="flex items-center gap-3 bg-ink-brand px-4 py-3 text-paper-bright">
        <WhipIcon className="size-9 shrink-0" />
        <div className="leading-tight">
          <p className="font-display text-[15px] font-black uppercase [font-stretch:75%]">
            House of Commons
          </p>
          <p className="text-[11px] font-semibold text-paper/75">Member’s pass · 2029–</p>
        </div>
        <span className="ml-auto h-9 w-2 bg-whip" aria-hidden="true" />
      </div>
      <div className="px-5 pt-5 pb-4">
        <p className="text-[11px] font-semibold text-ink/65">Member of Parliament</p>
        <p
          className={cn(
            'mt-1 font-display text-[clamp(2rem,3.4vw,2.9rem)] leading-[0.9] font-black uppercase [font-stretch:66%] break-words',
            !named && 'text-ink/30',
          )}
        >
          {named ? `${first} ${last}`.trim() : 'Your name'}
        </p>
        <p className="mt-2 text-sm font-semibold">
          Member for <span className="font-bold">{SEAT.name}</span>
        </p>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 border-t-2 border-ink pt-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink/65">{k}</dt>
              <dd className="text-right font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
      <figcaption className="flex items-center justify-between border-t border-ink/15 px-5 py-2.5 text-[11px] font-semibold text-ink/65">
        <span className="truncate">Save: {saveName.trim() || 'Untitled career'}</span>
        <span className="tabular-nums">Week 1</span>
      </figcaption>
    </figure>
  );
}
