import { cn, CostChip, Keycap, Kicker, Portrait, Slash } from '@whip/ui';
import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useCancelAction } from '../../api/hooks';
import type { CareerOverview, PlannedAction } from '../../api/types';
import { DeskHeading } from '../../game-ui/game-screen';
import { isEditable, modalOpen } from '../../game-ui/keys';
import { addDays, formatShortDate, parseSimDate, plural, weekdayName } from '../../lib/format';
import { toast } from '../../stores/toast-store';
import { useUiStore } from '../../stores/ui-store';
import { uiSound } from '../audio/use-ui-sound';
import { KIND_LABEL, layoutDiary, targetOf } from './model';

const DAY_FULL: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

function PlannedCard({ action, campaignId }: { action: PlannedAction; campaignId: string }) {
  const cancel = useCancelAction(campaignId);
  const target = targetOf(action);
  return (
    <div className="relative flex flex-1 animate-deal flex-col gap-3 bg-ink p-3 text-paper-bright">
      <div className="flex items-start gap-2.5 pr-7">
        {target && <Portrait seed={target} size="md" className="size-11" />}
        <div className="min-w-0">
          <Kicker className="text-lamp">{KIND_LABEL[action.kind]}</Kicker>
          <p className="mt-1 font-display text-[1.2rem] leading-[0.95] font-black uppercase [font-stretch:72%]">
            {action.label}
          </p>
        </div>
      </div>
      <p className="mt-auto flex flex-wrap gap-1">
        <CostChip kind="slots" value={action.slots} tone="paper" />
        {action.capitalCost > 0 && (
          <CostChip kind="capital" value={action.capitalCost} tone="paper" />
        )}
      </p>
      <button
        type="button"
        className="absolute top-2 right-2 grid size-7 cursor-pointer place-items-center text-paper/70 hover:bg-whip hover:text-white focus-visible:outline-2 focus-visible:outline-paper-bright disabled:opacity-40"
        aria-label={`Remove “${action.label}” from diary`}
        disabled={cancel.isPending}
        onClick={() =>
          cancel.mutate(action.id, {
            onSuccess: () => toast({ title: 'Removed from diary', description: action.label }),
          })
        }
      >
        <X aria-hidden="true" className="size-4" />
      </button>
    </div>
  );
}

/** The week's diary: Mon–Fri as paper pages, planned actions dealt into them. */
export function Diary({ overview }: { overview: CareerOverview }) {
  const id = overview.campaign.id;
  const openPlanner = useUiStore((s) => s.openPlanner);
  const { diary } = overview;
  const cells = layoutDiary(diary.slotsTotal, diary.planned);
  const decided = diary.planned.filter((a) => a.slots <= 0);
  const free = diary.slotsTotal - diary.slotsUsed;
  const monday = overview.campaign.simDate;
  const dayFor = (slot: number) => addDays(monday, slot % 5);
  const friday = addDays(monday, 4);
  const fixturesOn = (date: string) => overview.upcoming.filter((u) => u.date === date);
  const later = overview.upcoming.filter((u) => u.date > addDays(monday, 6)).slice(0, 4);

  // P opens the planner from the office (not while typing or over another modal).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'p' && e.key !== 'P')) return;
      if (isEditable(e.target) || modalOpen() || free <= 0) return;
      e.preventDefault();
      uiSound.click();
      openPlanner();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [free, openPlanner]);

  return (
    <section aria-labelledby="diary-title">
      <DeskHeading
        id="diary-title"
        title="Diary"
        meta={`w/c ${weekdayName(monday)} ${formatShortDate(monday)} · ${plural(free, 'slot')} free of ${diary.slotsTotal} · ${overview.standing.politicalCapital} capital to spend`}
        actions={
          <button
            type="button"
            onClick={() => openPlanner()}
            disabled={free <= 0}
            aria-label="Plan action"
            aria-keyshortcuts="P"
            className="flex h-11 cursor-pointer items-center gap-2.5 bg-paper-bright px-4 font-display text-xl font-black text-ink uppercase [font-stretch:70%] hover:bg-white focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-whip disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Slash className="h-5 w-auto" />
            Plan action
            <Keycap
              aria-hidden="true"
              tone="light"
              className="h-5 min-w-5 text-[10px] max-md:hidden"
            >
              P
            </Keycap>
          </button>
        }
      />

      <ol
        aria-label="Diary, Monday to Friday"
        className="mt-4 grid gap-2 max-md:grid-cols-1!"
        style={{ gridTemplateColumns: `repeat(${diary.slotsTotal}, minmax(0, 1fr))` }}
      >
        {cells.map((cell) => {
          const days = Array.from({ length: cell.span }, (_, i) => dayFor(cell.start + i));
          const first = days[0] ?? monday;
          const last = days.at(-1) ?? first;
          const dayLabel =
            cell.span > 1 ? `${weekdayName(first)}–${weekdayName(last)}` : weekdayName(first);
          const fixtures = days.flatMap(fixturesOn);
          return (
            <li
              key={cell.start}
              className="flex min-h-[15rem] flex-col bg-paper-bright text-ink max-md:col-span-full! max-md:min-h-0"
              style={{ gridColumn: `span ${cell.span} / span ${cell.span}` }}
            >
              {/* Page head: weekday and a big date numeral, like a desk diary. */}
              <div className="flex items-end justify-between gap-2 border-b-2 border-ink px-3 pt-2 pb-1.5">
                <span className="font-display text-[1.6rem] leading-none font-black uppercase [font-stretch:68%]">
                  <span className="sr-only">{DAY_FULL[weekdayName(first)] ?? dayLabel}</span>
                  <span aria-hidden="true">{dayLabel}</span>
                </span>
                <span className="font-display text-[1.6rem] leading-none font-black text-ink/35 tabular-nums [font-stretch:68%]">
                  {parseSimDate(first).getUTCDate()}
                </span>
              </div>
              {fixtures.length > 0 && (
                <ul
                  className="grid gap-0.5 border-b border-ink/15 px-3 py-1.5"
                  aria-label="In the diary already"
                >
                  {fixtures.map((f) => (
                    <li
                      key={f.label}
                      className="flex items-baseline gap-1.5 text-[11px] leading-tight font-bold text-whip uppercase"
                    >
                      <span
                        aria-hidden="true"
                        className="size-1.5 shrink-0 translate-y-[-1px] bg-whip"
                      />
                      {f.label}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-1 flex-col p-2">
                {cell.action ? (
                  <PlannedCard action={cell.action} campaignId={id} />
                ) : (
                  <button
                    type="button"
                    onClick={() => openPlanner()}
                    aria-label={`Plan an action for ${DAY_FULL[dayLabel] ?? dayLabel}`}
                    className="group flex flex-1 cursor-pointer flex-col justify-end gap-2 p-2 text-left text-ink/45 hover:bg-ink hover:text-paper-bright focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-whip max-md:min-h-10 max-md:py-1.5"
                  >
                    {/* Ruled lines: an unwritten page. */}
                    <span aria-hidden="true" className="grid gap-[0.85rem] max-md:hidden">
                      {[0, 1, 2, 3].map((i) => (
                        <span key={i} className="h-px bg-ink/15 group-hover:bg-paper/20" />
                      ))}
                    </span>
                    <span className="flex items-center gap-2 font-display text-[1.3rem] leading-none font-black uppercase [font-stretch:70%]">
                      <Slash className="h-5 w-auto fill-current group-hover:fill-whip" />
                      Plan
                    </span>
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(decided.length > 0 || later.length > 0) && (
        <div className="mt-3 flex flex-wrap items-start gap-x-8 gap-y-3 text-[12px]">
          {decided.length > 0 && (
            <div>
              <Kicker className="text-paper/70">Also decided this week</Kicker>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {decided.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 bg-ink px-2 py-1 font-semibold text-paper-bright"
                  >
                    {a.label}
                    {a.capitalCost !== 0 && (
                      <CostChip kind="capital" value={a.capitalCost} tone="paper" className="h-5" />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {later.length > 0 && (
            <div className="min-w-0">
              <Kicker className="text-paper/70">
                After {weekdayName(friday)} {formatShortDate(friday)}
              </Kicker>
              <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                {later.map((u) => (
                  <li
                    key={`${u.date}-${u.label}`}
                    className={cn(
                      'font-semibold text-paper',
                      u.kind === 'division' && 'text-paper-bright',
                    )}
                  >
                    <span className="mr-1.5 text-paper/60 tabular-nums">
                      {formatShortDate(u.date)}
                    </span>
                    {u.label}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
