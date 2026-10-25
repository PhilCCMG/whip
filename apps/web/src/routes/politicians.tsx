import { cn, Keycap } from '@whip/ui';
import { LayoutGrid, List } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';
import { useParliament, useParty, usePoliticians } from '../api/hooks';
import { ErrorState, Loading } from '../components/states';
import { DeskSearch, MoreBar, ToggleRow } from '../features/tea-room/controls';
import { RosterCard, RosterTable } from '../features/tea-room/roster';
import { DeskHeading, GameScreenHeader } from '../game-ui/game-screen';
import { isEditable, modalOpen } from '../game-ui/keys';
import { useCampaignId } from '../lib/params';
import { useUiStore } from '../stores/ui-store';

const SORTS = [
  { value: 'influence', label: 'Influence' },
  { value: 'relationship', label: 'Rapport' },
  { value: 'name', label: 'A–Z' },
] as const;

const EMPTY_LINES = [
  'Nobody of that description. The whips will be relieved.',
  'No members match. Possibly they are all at a fundraiser.',
] as const;

/**
 * TEA ROOM: the roster of colleagues. Cards (portrait, party band, post, how they regard you,
 * known vote) or a dense register; filters are game controls. `/` searches, `V` switches view.
 */
export function Component() {
  const id = useCampaignId();
  const filters = useUiStore((s) => s.politicianFilters);
  const setFilters = useUiStore((s) => s.setPoliticianFilters);
  const view = useUiStore((s) => s.rosterView);
  const setView = useUiStore((s) => s.setRosterView);
  const [search, setSearch] = useState(filters.search ?? '');
  const deferredSearch = useDeferredValue(search.trim());
  useEffect(() => {
    setFilters({ search: deferredSearch || undefined });
  }, [deferredSearch, setFilters]);

  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      if (isEditable(e.target) || modalOpen()) return;
      if (e.key === '/') {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault();
        const s = useUiStore.getState();
        s.setRosterView(s.rosterView === 'grid' ? 'list' : 'grid');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const parliament = useParliament(id);
  const party = useParty(id);
  const list = usePoliticians(id, filters);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];

  const parties = [
    { value: undefined, label: 'All', swatch: undefined },
    ...(parliament.data?.composition ?? []).map((c) => ({
      value: c.partyId,
      label: c.shortName,
      swatch: c.colour,
      title: c.name,
    })),
  ];
  const factions = [
    { value: undefined, label: 'Any' },
    ...(party.data?.factions ?? []).map((f) => ({
      value: f.id,
      label: f.name,
    })),
  ];
  const known = rows.filter(
    (r) => !r.isPlayer && r.knownIntention && r.knownIntention !== 'unknown',
  );
  const seats = parliament.data?.totalSeats;

  return (
    <div className="flex min-h-full flex-col">
      <GameScreenHeader
        title="Tea Room"
        kicker={`${seats ?? 650} colleagues, several of them friends`}
        crop="88% 30%"
      />
      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-6 px-4 py-6 md:px-8 md:py-7">
        <section
          role="search"
          aria-label="Find members"
          className="flex flex-wrap items-end gap-x-7 gap-y-4 border-b border-paper/15 pb-5"
        >
          <DeskSearch
            ref={searchRef}
            label="Search the tea room"
            placeholder="Name, seat or post"
            hotkey="/"
            value={search}
            onChange={setSearch}
            className="w-full sm:w-72"
          />
          <ToggleRow
            label="Party"
            options={parties}
            value={filters.partyId}
            onChange={(partyId) => setFilters({ partyId })}
          />
          {party.data && (
            <ToggleRow
              label={`${party.data.shortName} faction`}
              options={factions}
              value={filters.factionId}
              onChange={(factionId) => setFilters({ factionId })}
            />
          )}
          <div className="flex flex-wrap items-end gap-x-7 gap-y-4">
            <ToggleRow
              label="Order by"
              options={SORTS}
              value={filters.sort ?? 'name'}
              onChange={(sort) => setFilters({ sort: sort })}
            />
            <div className="flex items-end gap-2">
              <ToggleRow
                label="View"
                options={[
                  {
                    value: 'grid' as const,
                    label: (
                      <>
                        <LayoutGrid aria-hidden="true" className="size-3.5" /> Cards
                      </>
                    ),
                  },
                  {
                    value: 'list' as const,
                    label: (
                      <>
                        <List aria-hidden="true" className="size-3.5" /> Register
                      </>
                    ),
                  },
                ]}
                value={view}
                onChange={setView}
              />
              <Keycap
                className="mb-1.5 max-md:hidden"
                aria-hidden="true"
                title="Press V to switch view"
              >
                V
              </Keycap>
            </div>
          </div>
        </section>

        <section aria-labelledby="roster-title" className="grid gap-4">
          <DeskHeading
            id="roster-title"
            title="Members"
            meta={
              list.isPending
                ? 'Consulting the whips…'
                : `${rows.length}${list.hasNextPage ? '+' : ''} on the list · ${known.length} voting intentions known · “?” means nobody has asked`
            }
          />
          {list.isPending ? (
            <Loading label="Consulting the whips" className="text-paper" />
          ) : list.isError ? (
            <ErrorState
              className="bg-paper text-ink"
              error={list.error}
              onRetry={() => void list.refetch()}
            />
          ) : rows.length === 0 ? (
            <p className="border border-dashed border-paper/25 px-4 py-8 text-center text-[14px] text-paper/80">
              {EMPTY_LINES[(filters.search?.length ?? 0) % EMPTY_LINES.length]}
            </p>
          ) : view === 'grid' ? (
            <ul
              aria-label="Members"
              className={cn(
                'grid gap-2.5',
                'grid-cols-[repeat(auto-fill,minmax(min(100%,17.5rem),1fr))]',
              )}
            >
              {rows.map((p, i) => (
                <RosterCard
                  key={p.id}
                  p={p}
                  campaignId={id}
                  tutorialTarget={i === 0 ? 'roster' : undefined}
                />
              ))}
            </ul>
          ) : (
            <div data-tutorial="roster">
              <RosterTable rows={rows} campaignId={id} />
            </div>
          )}
          <div>
            {list.hasNextPage && (
              <MoreBar
                onClick={() => void list.fetchNextPage()}
                busy={list.isFetchingNextPage}
                label="More members"
                busyLabel="Fetching more members…"
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
