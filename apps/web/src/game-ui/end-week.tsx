import { cn, Keycap, Plate } from '@whip/ui';
import { useEffect, useRef } from 'react';
import { plural } from '../lib/format';
import { END_WEEK_KEY } from './keys';
import type { EndWeekBlockers } from './use-end-week';

/** The dominant bottom-right action, like a strategy game's "next turn". */
export function EndWeekButton({
  turn,
  blockers,
  pending,
  onPress,
  className,
}: {
  turn: number;
  blockers: EndWeekBlockers;
  pending: boolean;
  onPress: () => void;
  className?: string;
}) {
  const warn = [
    blockers.freeSlots > 0 ? plural(blockers.freeSlots, 'slot') + ' free' : null,
    blockers.pendingEvents > 0
      ? plural(blockers.pendingEvents, 'dispatch', 'dispatches') + ' open'
      : null,
  ].filter(Boolean);
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={pending}
      data-sfx="off"
      aria-label="End week"
      aria-describedby="end-week-status"
      aria-keyshortcuts={END_WEEK_KEY}
      className={cn(
        'group relative flex cursor-pointer items-stretch text-left disabled:cursor-wait',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-paper-bright',
        className,
      )}
    >
      <Plate
        tone="whip"
        edge="none"
        className="flex flex-1 items-center gap-4 py-2 pr-5 pl-7 [clip-path:polygon(1.1rem_0,100%_0,100%_100%,0_100%)] group-hover:bg-whip-dark"
      >
        <span className="flex min-w-0 flex-col">
          <span className="font-display text-[2rem] leading-[0.85] font-black uppercase [font-stretch:68%] max-md:text-[1.6rem]">
            {pending ? 'Resolving…' : 'End week'}
          </span>
          <span
            id="end-week-status"
            className="mt-1 truncate text-[11px] leading-none font-bold tracking-[0.06em] uppercase"
          >
            {warn.length ? warn.join(' · ') : `On to week ${turn + 1}`}
          </span>
        </span>
        <Keycap
          aria-hidden="true"
          className="h-8 min-w-8 border-white/80 bg-transparent text-sm text-white max-md:hidden"
        >
          {END_WEEK_KEY}
        </Keycap>
      </Plate>
    </button>
  );
}

/**
 * In-HUD confirm: anchored above END WEEK, never a browser confirm. "Keep planning" holds focus
 * so a stray Enter doesn't end the week; pressing E again (or the red button) confirms.
 */
export function EndWeekConfirm({
  blockers,
  onCancel,
  onConfirm,
}: {
  blockers: EndWeekBlockers;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => keepRef.current?.focus({ preventScroll: true }), []);
  return (
    <div
      role="alertdialog"
      aria-labelledby="end-week-confirm-title"
      aria-describedby="end-week-confirm-body"
      className="w-[min(27rem,calc(100vw-1.5rem))] animate-in-rise bg-ink text-paper outline-2 outline-paper-bright"
    >
      <div className="h-1.5 bg-whip" aria-hidden="true" />
      <div className="px-5 pt-4 pb-5">
        <p
          id="end-week-confirm-title"
          className="font-display text-[1.75rem] leading-none font-black text-paper-bright uppercase [font-stretch:68%]"
        >
          End the week?
        </p>
        <ul id="end-week-confirm-body" className="mt-3 grid gap-1.5 text-[14px] font-semibold">
          {blockers.freeSlots > 0 && (
            <li className="flex items-center gap-2.5">
              <span aria-hidden="true" className="flex gap-[2px]">
                {Array.from({ length: Math.min(blockers.freeSlots, 5) }, (_, i) => (
                  <span key={i} className="h-3.5 w-[6px] border border-paper/70" />
                ))}
              </span>
              {plural(blockers.freeSlots, 'diary slot')} unfilled
            </li>
          )}
          {blockers.pendingEvents > 0 && (
            <li className="flex items-center gap-2.5">
              <span aria-hidden="true" className="h-3.5 w-3.5 bg-whip" />
              {plural(blockers.pendingEvents, 'dispatch', 'dispatches')} unanswered
            </li>
          )}
        </ul>
        <p className="mt-2 text-[13px] text-paper/75">
          Unused slots are lost. The whips notice idle hands.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            ref={keepRef}
            type="button"
            onClick={onCancel}
            className="flex h-11 cursor-pointer items-center gap-2 border-2 border-paper-bright px-4 text-[13px] font-bold tracking-[0.04em] uppercase hover:bg-paper-bright hover:text-ink focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-whip"
          >
            Keep planning
            <Keycap aria-hidden="true" className="h-5 min-w-5 text-[10px]">
              Esc
            </Keycap>
          </button>
          <button
            type="button"
            onClick={onConfirm}
            data-sfx="off"
            className="flex h-11 cursor-pointer items-center gap-2 bg-whip px-4 text-[13px] font-bold tracking-[0.04em] text-white uppercase hover:bg-whip-dark focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-paper-bright"
          >
            End week anyway
            <Keycap
              aria-hidden="true"
              className="h-5 min-w-5 border-white/80 bg-transparent text-[10px] text-white"
            >
              {END_WEEK_KEY}
            </Keycap>
          </button>
        </div>
      </div>
    </div>
  );
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

/**
 * The change of week: a red slash wipes across the screen, the week number holds while the five
 * days tick past. Reduced motion: a still card.
 */
export function WeekTransition({ turn }: { turn: number }) {
  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed inset-0 z-[70] grid place-items-center overflow-hidden bg-ink text-paper-bright"
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 -left-[10%] w-[130%] animate-wipe bg-whip [clip-path:polygon(38%_0,62%_0,52%_100%,28%_100%)]"
      />
      <div className="relative flex flex-col items-center gap-5 px-4 text-center">
        <p className="text-[12px] font-bold tracking-[0.2em] text-paper uppercase">
          Votes counted, grudges noted
        </p>
        <p className="font-display text-[clamp(4.5rem,12vw,10rem)] leading-[0.8] font-black uppercase tabular-nums [font-stretch:66%]">
          Week {turn}
        </p>
        <ol aria-hidden="true" className="flex gap-1.5">
          {WEEKDAYS.map((d, i) => (
            <li
              key={d}
              className="w-14 animate-deal border-2 border-paper-bright bg-paper-bright py-1 text-center text-[11px] font-black tracking-[0.1em] text-ink uppercase"
              style={{ animationDelay: `${150 + i * 170}ms` }}
            >
              {d}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
