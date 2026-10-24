import { Badge, cn, PartyChip, VoteBar } from '@whip/ui';
import type { DivisionResult } from '../api/types';
import { formatSimDate } from '../lib/format';
import { PoliticianLink } from './politician-bits';

const voteLabel = { aye: 'Aye', no: 'No', abstain: 'Abstained' } as const;

/** One division: the verdict, the lobby split, how each party voted and who rebelled. */
export function DivisionResultView({
  division,
  campaignId,
  compact = false,
}: {
  division: DivisionResult;
  campaignId: string;
  compact?: boolean;
}) {
  const majority = division.ayes - division.noes;
  return (
    <article className="grid gap-3" aria-label={`${division.billTitle}, ${division.stage}`}>
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-xs opacity-70">
            {division.stage} · {formatSimDate(division.heldOn)}
          </p>
          <h3 className="font-display text-xl leading-none font-extrabold font-stretch-condensed">
            {division.billTitle}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={division.passed ? 'good' : 'critical'}>
            {division.passed ? 'Passed' : 'Defeated'}
          </Badge>
          <Badge tone={division.governmentWon ? 'neutral' : 'whip'}>
            {division.governmentWon ? 'Government win' : 'Government defeat'}
          </Badge>
        </div>
      </header>

      <div className="flex items-end gap-4">
        <p className="font-display leading-none font-black font-stretch-condensed tabular">
          <span className="text-4xl text-aye">{division.ayes}</span>
          <span className="mx-1.5 text-2xl opacity-40">–</span>
          <span className="text-4xl text-no">{division.noes}</span>
        </p>
        <p className="pb-0.5 text-xs opacity-75">
          Majority {Math.abs(majority)}
          {division.abstentions > 0 && ` · ${division.abstentions} abstained`}
          {division.playerVote && (
            <>
              <br />
              You voted <strong>{voteLabel[division.playerVote]}</strong>
            </>
          )}
        </p>
      </div>
      <VoteBar
        ayes={division.ayes}
        noes={division.noes}
        abstain={division.abstentions}
        showLegend={false}
        size="md"
      />

      {!compact && (
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <table className="w-full self-start text-xs">
            <caption className="sr-only">Votes by party</caption>
            <thead>
              <tr className="border-b border-current/20 text-left opacity-70">
                <th scope="col" className="py-1 font-semibold">
                  Party
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Aye
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  No
                </th>
                <th scope="col" className="py-1 text-right font-semibold">
                  Abst.
                </th>
              </tr>
            </thead>
            <tbody>
              {division.byParty.map((p) => (
                <tr key={p.partyId} className="border-b border-current/10">
                  <th scope="row" className="py-1 text-left font-normal">
                    <PartyChip colour={p.colour} label={p.shortName} />
                  </th>
                  <td className="py-1 text-right">{p.ayes}</td>
                  <td className="py-1 text-right">{p.noes}</td>
                  <td className="py-1 text-right">{p.abstentions}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div>
            <h4 className="mb-1 text-xs font-semibold opacity-70">
              Rebels ({division.rebels.length})
            </h4>
            {division.rebels.length === 0 ? (
              <p className="text-xs opacity-60">No one defied their whip.</p>
            ) : (
              <ul className="grid max-h-80 gap-x-3 overflow-y-auto sm:grid-cols-2">
                {division.rebels.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-baseline justify-between gap-2 border-b border-current/10 py-1 text-xs"
                    title={r.reason}
                  >
                    <span className="min-w-0 truncate">
                      <PoliticianLink campaignId={campaignId} id={r.id} name={r.name} />{' '}
                      <span className="opacity-60">{r.partyShort}</span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 font-semibold',
                        r.vote === 'no' ? 'text-no' : r.vote === 'aye' ? 'text-aye' : 'opacity-70',
                      )}
                    >
                      {voteLabel[r.vote]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
