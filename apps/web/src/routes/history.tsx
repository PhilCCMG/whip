import { HistoryTypeSchema } from '@whip/contracts';
import { Badge, Button, cn, Select } from '@whip/ui';
import { useId } from 'react';
import { useHistory } from '../api/hooks';
import type { HistoryItem, HistoryType } from '../api/types';
import { Empty, ErrorState, Loading } from '../components/states';
import { addDays, formatShortDate, formatSimDate, humanise } from '../lib/format';
import { useCampaignId } from '../lib/params';
import { useSentinel } from '../lib/use-sentinel';
import { useUiStore } from '../stores/ui-store';

const TYPES = HistoryTypeSchema.options;

const IMPORTANCE = [
  { value: undefined, label: 'Everything' },
  { value: 3, label: 'Notable' },
  { value: 4, label: 'Major' },
  { value: 5, label: 'Front page' },
] as const;

function groupByTurn(items: HistoryItem[]) {
  const groups: { turn: number; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.turn === item.turn) last.items.push(item);
    else groups.push({ turn: item.turn, items: [item] });
  }
  return groups;
}

/** Monday of the item's week, assuming turn 1 starts on its earliest date. */
function weekStart(items: HistoryItem[]) {
  const dates = items.map((i) => i.simDate).sort();
  const first = dates[0] ?? '2029-09-03';
  const d = new Date(`${first}T00:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDays(first, -offset);
}

export function Component() {
  const id = useCampaignId();
  const filters = useUiStore((s) => s.historyFilters);
  const setFilters = useUiStore((s) => s.setHistoryFilters);
  const q = useHistory(id, filters);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupByTurn(items);
  const sentinel = useSentinel<HTMLDivElement>(
    () => void q.fetchNextPage(),
    q.hasNextPage && !q.isFetchingNextPage,
  );
  const typeId = useId();

  return (
    <div className="mx-auto grid max-w-[980px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-[3px] border-ink pb-2">
        <h1 className="font-display text-4xl leading-none font-black font-stretch-condensed">
          The record
        </h1>
        <p className="text-xs text-moss-600">Everything that has happened, week by week.</p>
      </header>

      <div className="flex flex-wrap items-center gap-3 bg-paper p-3">
        <label htmlFor={typeId} className="sr-only">
          Type
        </label>
        <Select
          id={typeId}
          wrapperClassName="w-full sm:w-56"
          value={filters.type ?? ''}
          onChange={(e) =>
            setFilters({ type: (e.target.value || undefined) as HistoryType | undefined })
          }
        >
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {humanise(t)}
            </option>
          ))}
        </Select>
        <div role="group" aria-label="Importance" className="flex flex-wrap gap-px bg-moss-200">
          {IMPORTANCE.map((o) => {
            const active = filters.minImportance === o.value;
            return (
              <button
                key={o.label}
                type="button"
                aria-pressed={active}
                onClick={() => setFilters({ minImportance: o.value })}
                className={cn(
                  'h-9 cursor-pointer px-3 text-xs font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  active ? 'bg-ink text-paper' : 'bg-paper hover:bg-paper-deep',
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      </div>

      {q.isPending ? (
        <Loading label="Loading the record" />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => void q.refetch()} />
      ) : groups.length === 0 ? (
        <Empty>Nothing recorded matches these filters.</Empty>
      ) : (
        <div className="grid gap-6">
          {groups.map((g) => (
            <section
              key={g.turn}
              aria-labelledby={`wk-${g.turn}`}
              className="grid gap-0 sm:grid-cols-[7.5rem_minmax(0,1fr)]"
            >
              <h2 id={`wk-${g.turn}`} className="top-[4.5rem] self-start pb-2 sm:sticky">
                <span className="block font-display text-3xl leading-none font-black font-stretch-condensed">
                  Week {g.turn}
                </span>
                <span className="block text-xs text-moss-600">
                  w/c {formatSimDate(weekStart(g.items), { year: false })}
                </span>
              </h2>
              <ol className="grid gap-px border-t-[3px] border-ink bg-moss-200">
                {g.items.map((item) => (
                  <li
                    key={item.seq}
                    className={cn(
                      'grid grid-cols-[auto_minmax(0,1fr)] gap-3 bg-paper px-3 py-2.5',
                      item.importance >= 4 && 'bg-white/60',
                    )}
                  >
                    <span
                      className="mt-1 flex w-4 flex-col gap-0.5"
                      role="img"
                      aria-label={`Importance ${item.importance} of 5`}
                    >
                      {Array.from({ length: 5 }, (_, i) => (
                        <span
                          key={i}
                          className={cn(
                            'h-1 w-full',
                            5 - i <= item.importance
                              ? item.importance >= 4
                                ? 'bg-whip'
                                : 'bg-ink'
                              : 'bg-moss-200',
                          )}
                        />
                      ))}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <h3
                          className={cn(
                            'leading-tight',
                            item.importance >= 4
                              ? 'font-display text-xl font-extrabold font-stretch-condensed'
                              : 'text-sm font-semibold',
                          )}
                        >
                          {item.title}
                        </h3>
                        <Badge tone="neutral">{humanise(item.type)}</Badge>
                        <span className="text-[11px] text-moss-600 tabular">
                          {formatShortDate(item.simDate)}
                        </span>
                      </div>
                      <p className="mt-0.5 max-w-[70ch] text-sm leading-snug text-ink/75">
                        {item.summary}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      <div ref={sentinel} className="flex justify-center py-2">
        {q.hasNextPage && (
          <Button
            variant="outline"
            size="sm"
            disabled={q.isFetchingNextPage}
            onClick={() => void q.fetchNextPage()}
          >
            {q.isFetchingNextPage ? 'Loading…' : 'Load older'}
          </Button>
        )}
      </div>
    </div>
  );
}
