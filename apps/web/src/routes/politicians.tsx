import { Button, cn, Input, PartyChip, Select } from '@whip/ui';
import { Search } from 'lucide-react';
import { useDeferredValue, useEffect, useId, useState } from 'react';
import { Link } from 'react-router';
import { useParliament, useParty, usePoliticians } from '../api/hooks';
import type { PoliticianFilters } from '../api/types';
import { KnownVoteBadge, RelationshipChips } from '../components/politician-bits';
import { Empty, ErrorState, Loading } from '../components/states';
import { campaignPath, useCampaignId } from '../lib/params';
import { useSentinel } from '../lib/use-sentinel';
import { useUiStore } from '../stores/ui-store';

export function Component() {
  const id = useCampaignId();
  const filters = useUiStore((s) => s.politicianFilters);
  const setFilters = useUiStore((s) => s.setPoliticianFilters);
  const [search, setSearch] = useState(filters.search ?? '');
  const deferredSearch = useDeferredValue(search.trim());
  useEffect(() => {
    setFilters({ search: deferredSearch || undefined });
  }, [deferredSearch, setFilters]);

  const parliament = useParliament(id);
  const party = useParty(id);
  const list = usePoliticians(id, filters);
  const rows = list.data?.pages.flatMap((p) => p.items) ?? [];
  const sentinel = useSentinel<HTMLDivElement>(
    () => void list.fetchNextPage(),
    list.hasNextPage && !list.isFetchingNextPage,
  );
  const ids = { search: useId(), party: useId(), faction: useId(), sort: useId() };

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-[3px] border-ink pb-2">
        <h1 className="font-display text-4xl leading-none font-black font-stretch-condensed">
          Members
        </h1>
        <p className="text-xs text-moss-600">
          What you know about your colleagues, and what they think of you.
        </p>
      </header>

      <div
        role="search"
        className="grid gap-2 bg-paper p-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]"
      >
        <div className="relative">
          <label htmlFor={ids.search} className="sr-only">
            Search by name
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 opacity-50"
          />
          <Input
            id={ids.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name"
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <div>
          <label htmlFor={ids.party} className="sr-only">
            Party
          </label>
          <Select
            id={ids.party}
            value={filters.partyId ?? ''}
            onChange={(e) => setFilters({ partyId: e.target.value || undefined })}
          >
            <option value="">All parties</option>
            {parliament.data?.composition.map((c) => (
              <option key={c.partyId} value={c.partyId}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={ids.faction} className="sr-only">
            Faction
          </label>
          <Select
            id={ids.faction}
            value={filters.factionId ?? ''}
            onChange={(e) => setFilters({ factionId: e.target.value || undefined })}
          >
            <option value="">All factions</option>
            {party.data?.factions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={ids.sort} className="sr-only">
            Sort by
          </label>
          <Select
            id={ids.sort}
            value={filters.sort ?? 'name'}
            onChange={(e) => setFilters({ sort: e.target.value as PoliticianFilters['sort'] })}
          >
            <option value="influence">Most influential</option>
            <option value="relationship">Best relationship</option>
            <option value="name">Name A–Z</option>
          </Select>
        </div>
      </div>

      <section aria-label="Members" className="bg-paper">
        {list.isPending ? (
          <Loading label="Loading members" />
        ) : list.isError ? (
          <ErrorState className="m-4" error={list.error} onRetry={() => void list.refetch()} />
        ) : rows.length === 0 ? (
          <Empty>No members match these filters.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead className="max-md:sr-only">
              <tr className="border-b-2 border-ink text-left text-xs">
                <th scope="col" className="px-3 py-2 font-semibold">
                  Name
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Party
                </th>
                <th scope="col" className="px-3 py-2 font-semibold max-xl:hidden">
                  Seat
                </th>
                <th scope="col" className="px-3 py-2 font-semibold max-lg:hidden">
                  Role
                </th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">
                  Influence
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Towards you
                </th>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Next vote
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr
                  key={p.id}
                  className={cn(
                    'border-b border-moss-200 hover:bg-paper-deep/60 max-md:grid max-md:grid-cols-[1fr_auto] max-md:gap-x-3 max-md:gap-y-1 max-md:px-3 max-md:py-2.5',
                    p.isPlayer && 'bg-whip/[0.06]',
                  )}
                >
                  <th scope="row" className="px-3 py-2 text-left font-normal max-md:p-0">
                    <Link
                      to={campaignPath(id, `politicians/${encodeURIComponent(p.id)}`)}
                      className="font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      {p.name}
                    </Link>
                    {p.isPlayer && (
                      <span className="ml-1.5 text-xs font-semibold text-whip">You</span>
                    )}
                    <span className="block text-xs text-moss-600 md:hidden">
                      {p.offices[0] ?? p.constituencyName}
                    </span>
                  </th>
                  <td className="px-3 py-2 max-md:p-0 max-md:text-right">
                    <PartyChip colour={p.partyColour} label={p.partyShort ?? 'Ind'} />
                  </td>
                  <td className="px-3 py-2 text-moss-600 max-xl:hidden">{p.constituencyName}</td>
                  <td className="px-3 py-2 max-lg:hidden">
                    <span className="block">{p.offices[0] ?? 'Backbencher'}</span>
                    {p.factionName && (
                      <span className="block text-xs text-moss-600">{p.factionName}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular max-md:hidden">
                    {Math.round(p.influence)}
                  </td>
                  <td className="px-3 py-2 max-md:p-0">
                    {p.isPlayer ? null : <RelationshipChips rel={p.relationshipToPlayer} />}
                  </td>
                  <td className="px-3 py-2 max-md:p-0 max-md:text-right">
                    {!p.isPlayer && <KnownVoteBadge vote={p.knownIntention} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div ref={sentinel} className="flex justify-center py-3">
          {list.hasNextPage && (
            <Button
              variant="outline"
              size="sm"
              disabled={list.isFetchingNextPage}
              onClick={() => void list.fetchNextPage()}
            >
              {list.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </div>
      </section>
    </div>
  );
}
