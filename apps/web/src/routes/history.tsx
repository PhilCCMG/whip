import { cn, Kicker, Slash } from '@whip/ui';
import { useCampaignState, useHistory } from '../api/hooks';
import type { HistoryType } from '../api/types';
import { ErrorState, Loading } from '../components/states';
import { WeekPage } from '../features/archive/chronicle';
import { groupByWeek } from '../features/archive/model';
import { MoreBar, ToggleRow } from '../features/tea-room/controls';
import { GameScreenHeader } from '../game-ui/game-screen';
import { useCampaignId } from '../lib/params';
import { useSentinel } from '../lib/use-sentinel';
import { useUiStore } from '../stores/ui-store';

const TABS: { value: HistoryType | undefined; label: string }[] = [
  { value: undefined, label: 'All papers' },
  { value: 'division', label: 'Divisions' },
  { value: 'appointment', label: 'Appointments' },
  { value: 'resignation', label: 'Resignations' },
  { value: 'event', label: 'Events' },
  { value: 'action_outcome', label: 'Actions' },
];

const IMPORTANCE = [
  { value: undefined, label: 'Everything' },
  { value: 3, label: 'Notable' },
  { value: 4, label: 'Front page' },
] as const;

/**
 * ARCHIVE: the record as press cuttings and Hansard-style ledger lines, a page per week. Filter
 * tabs by type, "my career only", importance; older weeks load as you scroll ("OLDER PAPERS").
 */
export function Component() {
  const id = useCampaignId();
  const filters = useUiStore((s) => s.historyFilters);
  const setFilters = useUiStore((s) => s.setHistoryFilters);
  const state = useCampaignState(id);
  const playerId = state.data?.player.id;
  const q = useHistory(id, filters);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = groupByWeek(items);
  const sentinel = useSentinel<HTMLDivElement>(
    () => void q.fetchNextPage(),
    !!q.hasNextPage && !q.isFetchingNextPage,
  );
  const mineOnly = !!filters.politicianId && filters.politicianId === playerId;

  return (
    <div className="flex min-h-full flex-col">
      <GameScreenHeader
        title="Archive"
        kicker="Everything that happened, on the record"
        crop="70% 85%"
      />
      <div className="flex-1 px-4 py-6 md:px-8 md:py-7">
        <div className="mx-auto grid max-w-[68rem] grid-cols-[minmax(0,1fr)] gap-7">
          <div className="grid gap-4 border-b border-paper/15 pb-5">
            <nav aria-label="Filter by type">
              <ul className="flex flex-wrap gap-x-1 gap-y-1.5 border-b-2 border-paper-bright">
                {TABS.map((t) => {
                  const active = filters.type === t.value;
                  return (
                    <li key={t.label}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => !active && setFilters({ type: t.value })}
                        className={cn(
                          'h-9 cursor-pointer px-3.5 font-display text-[1rem] leading-none font-black tracking-[0.02em] uppercase [font-stretch:72%] [clip-path:polygon(0_0,calc(100%-0.5em)_0,100%_100%,0_100%)] pr-5',
                          'focus-visible:outline-2 focus-visible:-outline-offset-4',
                          active
                            ? 'bg-paper-bright text-ink focus-visible:outline-whip'
                            : 'bg-ink text-paper/80 hover:text-paper-bright focus-visible:outline-paper-bright',
                        )}
                      >
                        {t.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
              <ToggleRow
                label="Importance"
                options={IMPORTANCE}
                value={filters.minImportance as 3 | 4 | undefined}
                onChange={(minImportance) => setFilters({ minImportance })}
              />
              <div>
                <Kicker className="mb-1.5 text-paper/70">Whose story</Kicker>
                <button
                  type="button"
                  aria-pressed={mineOnly}
                  disabled={!playerId}
                  onClick={() => setFilters({ politicianId: mineOnly ? undefined : playerId })}
                  className={cn(
                    'inline-flex h-8 cursor-pointer items-center gap-2 px-2.5 text-[12px] leading-none font-bold tracking-[0.06em] uppercase',
                    'focus-visible:outline-2 focus-visible:-outline-offset-2',
                    mineOnly
                      ? 'bg-whip text-white focus-visible:outline-paper-bright'
                      : 'bg-ink text-paper/80 outline-1 -outline-offset-1 outline-paper/15 hover:text-paper-bright focus-visible:outline-paper-bright',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-4 place-items-center outline-1 -outline-offset-1',
                      mineOnly ? 'bg-paper-bright outline-paper-bright' : 'outline-paper/60',
                    )}
                  >
                    {mineOnly && <Slash className="h-3 w-auto" />}
                  </span>
                  Only my career
                </button>
              </div>
            </div>
          </div>

          {q.isPending ? (
            <Loading label="Fetching the bound volumes" className="text-paper" />
          ) : q.isError ? (
            <ErrorState
              className="bg-paper text-ink"
              error={q.error}
              onRetry={() => void q.refetch()}
            />
          ) : groups.length === 0 ? (
            <p className="border border-dashed border-paper/25 px-4 py-8 text-center text-[14px] text-paper/80">
              {mineOnly
                ? 'Nothing on the record yet. Some would call that a career.'
                : 'Nothing on file. Either it never happened or it has been shredded.'}
            </p>
          ) : (
            <div className="grid gap-9">
              {groups.map((g) => (
                <WeekPage key={g.turn} turn={g.turn} items={g.items} playerId={playerId} />
              ))}
            </div>
          )}
          <div ref={sentinel}>
            {q.hasNextPage ? (
              <MoreBar
                onClick={() => void q.fetchNextPage()}
                busy={q.isFetchingNextPage}
                label="Older papers"
                busyLabel="Fetching older papers…"
              />
            ) : (
              groups.length > 0 && (
                <p className="text-center text-[12px] font-semibold text-paper/65">
                  The record begins here. Earlier volumes were lost in a reorganisation.
                </p>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
