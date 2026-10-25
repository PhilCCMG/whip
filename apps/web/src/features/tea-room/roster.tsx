import { cn, Kicker, Portrait } from '@whip/ui';
import { Link } from 'react-router';
import type { PoliticianSummary } from '../../api/types';
import { campaignPath } from '../../lib/params';
import { IntentionStamp, RelationPips } from './bits';

const profilePath = (campaignId: string, id: string) =>
  campaignPath(campaignId, `politicians/${encodeURIComponent(id)}`);

const roleOf = (p: PoliticianSummary) => p.offices[0] ?? 'Backbencher';

/** A colleague as a portrait card on the desk (the CK / FM roster tile). */
export function RosterCard({ p, campaignId }: { p: PoliticianSummary; campaignId: string }) {
  const colour = p.partyColour ?? 'var(--color-moss-400)';
  return (
    <li className="min-w-0 animate-deal">
      <Link
        to={profilePath(campaignId, p.id)}
        className={cn(
          'group relative flex h-full flex-col bg-ink text-paper outline-1 -outline-offset-1 outline-paper/15',
          'hover:bg-moss-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-paper-bright',
          p.isPlayer && 'outline-2 -outline-offset-2 outline-whip',
        )}
      >
        <span aria-hidden="true" className="h-1 shrink-0" style={{ backgroundColor: colour }} />
        <span className="flex gap-3 p-3 pb-2.5">
          <Portrait seed={p.id} partyColour={p.partyColour} size="lg" className="shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-start justify-between gap-2">
              <span className="flex min-w-0 flex-col-reverse">
                <span className="mt-1 font-display text-[1.2rem] leading-[0.92] font-black text-paper-bright uppercase [font-stretch:70%] group-hover:underline group-hover:decoration-whip group-hover:decoration-2 group-hover:underline-offset-2">
                  {p.name}
                </span>
                <Kicker className="truncate text-paper/70">
                  {p.partyShort ?? 'Ind'}
                  {p.factionName ? ` · ${p.factionName}` : ''}
                </Kicker>
              </span>
              {p.isPlayer ? (
                <span className="shrink-0 bg-whip px-1.5 py-1 text-[10px] leading-none font-bold tracking-[0.08em] text-white uppercase">
                  You
                </span>
              ) : (
                <span className="shrink-0 text-right">
                  <span className="block font-display text-[1.15rem] leading-none font-black text-lamp tabular-nums [font-stretch:72%]">
                    {Math.round(p.influence)}
                  </span>
                  <span className="block text-[9px] leading-none font-bold tracking-[0.08em] text-paper/60 uppercase">
                    Inf
                  </span>
                </span>
              )}
            </span>
            <span className="mt-1.5 truncate text-[12px] font-semibold text-paper/85">
              {roleOf(p)}
            </span>
            <span className="truncate text-[12px] text-paper/65">
              {p.constituencyName ?? 'No seat'}
            </span>
          </span>
        </span>
        <span className="mt-auto flex min-h-10 items-center justify-between gap-2 border-t border-paper/12 px-3 py-2">
          {p.isPlayer ? (
            <span className="text-[11px] font-semibold text-paper/70">
              Your own file. Reads well.
            </span>
          ) : (
            <RelationPips rel={p.relationshipToPlayer} tone="paper" />
          )}
          {!p.isPlayer && <IntentionStamp vote={p.knownIntention} />}
        </span>
      </Link>
    </li>
  );
}

/** Dense FM-style register on paper: one row per member. */
export function RosterTable({
  rows,
  campaignId,
}: {
  rows: PoliticianSummary[];
  campaignId: string;
}) {
  const maxInf = Math.max(1, ...rows.map((r) => r.influence));
  const th = 'px-2 py-2 text-left text-[10px] font-bold tracking-[0.08em] uppercase';
  return (
    <div className="bg-paper-bright text-ink">
      <table className="w-full table-fixed border-collapse text-[13px]">
        <caption className="sr-only">Members of Parliament</caption>
        <thead className="border-b-2 border-ink">
          <tr>
            <th scope="col" className={cn(th, 'w-[3.25rem]')}>
              <span className="sr-only">Portrait</span>
            </th>
            <th scope="col" className={th}>
              Member
            </th>
            <th scope="col" className={cn(th, 'w-16 max-sm:hidden')}>
              Party
            </th>
            <th scope="col" className={cn(th, 'w-[22%] max-lg:hidden')}>
              Post · Faction
            </th>
            <th scope="col" className={cn(th, 'w-32 max-xl:hidden')}>
              Influence
            </th>
            <th scope="col" className={cn(th, 'w-[11.5rem] max-md:hidden')}>
              Their view of you
            </th>
            <th scope="col" className={cn(th, 'w-[4.75rem] text-center')}>
              Vote
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr
              key={p.id}
              className={cn(
                'border-b border-ink/12 hover:bg-paper-deep/70',
                p.isPlayer && 'bg-whip/[0.07]',
              )}
            >
              <td className="py-1 pl-2">
                <Portrait seed={p.id} partyColour={p.partyColour} size="sm" />
              </td>
              <th scope="row" className="min-w-0 px-2 py-1.5 text-left font-normal">
                <Link
                  to={profilePath(campaignId, p.id)}
                  className="block truncate font-display text-[1.02rem] leading-tight font-black uppercase [font-stretch:72%] hover:underline hover:decoration-whip hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-whip"
                >
                  {p.name}
                  {p.isPlayer && (
                    <span className="ml-1.5 align-middle font-sans text-[10px] font-bold tracking-[0.08em] text-whip">
                      YOU
                    </span>
                  )}
                </Link>
                <span className="block truncate text-[11px] text-ink/70">
                  <span className="lg:hidden">{roleOf(p)} · </span>
                  {p.constituencyName ?? 'No seat'}
                </span>
              </th>
              <td className="px-2 py-1.5 max-sm:hidden">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold">
                  <span
                    aria-hidden="true"
                    className="size-2.5"
                    style={{ backgroundColor: p.partyColour ?? 'var(--color-moss-400)' }}
                  />
                  {p.partyShort ?? 'Ind'}
                </span>
              </td>
              <td className="px-2 py-1.5 max-lg:hidden">
                <span className="block truncate text-[12px] font-semibold">{roleOf(p)}</span>
                <span className="block truncate text-[11px] text-ink/65">
                  {p.factionName ?? 'No faction'}
                </span>
              </td>
              <td className="px-2 py-1.5 max-xl:hidden">
                <span className="flex items-center gap-2">
                  <span className="w-7 text-right font-display text-[15px] leading-none font-black tabular-nums [font-stretch:75%]">
                    {Math.round(p.influence)}
                  </span>
                  <span aria-hidden="true" className="h-2 flex-1 bg-ink/10">
                    <span
                      className="block h-full bg-ink"
                      style={{ width: `${(p.influence / maxInf) * 100}%` }}
                    />
                  </span>
                </span>
              </td>
              <td className="px-2 py-1.5 max-md:hidden">
                {!p.isPlayer && <RelationPips rel={p.relationshipToPlayer} />}
              </td>
              <td className="px-2 py-1.5 text-center">
                {!p.isPlayer && <IntentionStamp vote={p.knownIntention} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
