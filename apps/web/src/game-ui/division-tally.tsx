import { cn, Kicker, PartyChip, Plate, Portrait, Stamp } from '@whip/ui';
import type { DivisionResult } from '../api/types';
import { PoliticianLink } from '../components/politician-bits';
import { formatSimDate } from '../lib/format';
import { CountUp } from './count-up';
import { divisionAnnouncement } from './division-copy';
import { SceneImage } from './location-backdrop';
import { verdictStamp } from './stamps';

const voteLabel = { aye: 'Aye', no: 'No', abstain: 'Abstained' } as const;

/** When the verdict stamp starts to land, after the lobbies have counted up. */
export const VERDICT_STAMP_DELAY_MS = 1900;

/**
 * A division result as a results reveal: the tellers' announcement with the two lobbies
 * counting up, the verdict stamped, then the split by party (bars to scale) and the rebels'
 * roll call with their stated reasons. Ink sheet, so it reads as an event after the newspaper.
 */
export function DivisionTally({
  division,
  campaignId,
  headingLevel = 'h3',
}: {
  division: DivisionResult;
  campaignId: string;
  headingLevel?: 'h2' | 'h3';
}) {
  const total = Math.max(1, division.ayes + division.noes + division.abstentions);
  const majority = Math.abs(division.ayes - division.noes);
  const { tellers, verdict } = divisionAnnouncement(division);
  const mark = verdictStamp(division);
  const biggest = Math.max(1, ...division.byParty.map((p) => p.ayes + p.noes + p.abstentions));
  const colourOf = (short: string) => division.byParty.find((p) => p.shortName === short)?.colour;
  const H = headingLevel;
  const Sub = headingLevel === 'h2' ? 'h3' : 'h4';

  return (
    <article aria-label={`${division.billTitle}, ${division.stage}`} className="bg-ink text-paper">
      <div className="h-1.5 bg-whip" aria-hidden="true" />
      <div className="grid gap-6 p-5 md:p-7">
        {/*
          The lobby band: the division lobby painting behind the header only, under a flat ink
          veil (one solid layer, never a gradient), so the figures below stay on plain ink.
        */}
        <header className="relative isolate -mx-5 -mt-5 flex flex-wrap items-end justify-between gap-4 px-5 pt-10 pb-5 md:-mx-7 md:-mt-7 md:px-7 md:pt-14">
          <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden bg-ink">
            <SceneImage
              scene="division-lobby"
              loading="lazy"
              sizes="(min-width: 78rem) 78rem, 100vw"
            />
            <div className="absolute inset-0 bg-ink/80" />
          </div>
          <div className="flex min-w-0 flex-col-reverse">
            <H className="mt-2 font-display text-[clamp(1.8rem,3.5vw,2.8rem)] leading-[0.88] font-black text-paper-bright uppercase [font-stretch:68%]">
              {division.billTitle}
            </H>
            <Kicker className="text-paper/75">
              The division · {division.stage} · {formatSimDate(division.heldOn)}
            </Kicker>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Plate
              tone={division.governmentWon ? 'ink' : 'whip'}
              edge="both"
              className={cn(
                'py-1.5 text-[11px] font-black tracking-[0.12em] uppercase',
                division.governmentWon && 'bg-moss-800',
              )}
            >
              {division.governmentWon ? 'Government win' : 'Government defeat'}
            </Plate>
            <Stamp
              tone={mark.tone}
              {...(mark.image ? { image: mark.image } : {})}
              size="lg"
              angle={-5}
              className="animate-stamp"
              style={{ animationDelay: `${VERDICT_STAMP_DELAY_MS}ms` }}
            >
              {mark.text}
            </Stamp>
          </div>
        </header>

        {/* The tellers' figures: Ayes to the right (of the Chair), Noes to the left. */}
        <div className="grid gap-3">
          <p className="sr-only">
            {tellers} {verdict}
          </p>
          <div aria-hidden="true" className="grid grid-cols-2 gap-px bg-paper/15">
            {(
              [
                [
                  'The Ayes',
                  'to the right',
                  division.ayes,
                  'bg-aye',
                  division.ayes > division.noes,
                  0,
                ],
                [
                  'The Noes',
                  'to the left',
                  division.noes,
                  'bg-no',
                  division.noes > division.ayes,
                  500,
                ],
              ] as const
            ).map(([label, side, n, colour, won, delay]) => (
              <div key={label} className="bg-ink px-4 py-3 md:px-6">
                <p className="flex flex-wrap items-center gap-x-2 text-[12px] font-black tracking-[0.14em] text-paper-bright uppercase">
                  <span className={cn('size-3', colour)} />
                  {label} <span className="text-paper/65">{side}</span>
                  {won && <span className="text-lamp">· have it</span>}
                </p>
                <p className="font-display text-[clamp(3.5rem,8vw,6.5rem)] leading-[0.85] font-black text-paper-bright tabular-nums [font-stretch:66%]">
                  <CountUp value={n} delayMs={delay} />
                </p>
              </div>
            ))}
          </div>
          <div aria-hidden="true" className="flex h-3 gap-[2px]">
            <span className="bg-aye" style={{ flexGrow: division.ayes / total }} />
            <span className="bg-abstain" style={{ flexGrow: division.abstentions / total }} />
            <span className="bg-no" style={{ flexGrow: division.noes / total }} />
          </div>
          <p
            aria-hidden="true"
            className="font-display text-[1.05rem] leading-tight font-bold text-paper-bright italic [font-stretch:90%]"
          >
            “{verdict}”
          </p>
          <p className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] font-semibold text-paper/80">
            <span>Majority {majority}</span>
            {division.abstentions > 0 && <span>{division.abstentions} abstained</span>}
            {division.playerVote && (
              <span className="text-paper-bright">
                You voted <strong>{voteLabel[division.playerVote]}</strong>
              </span>
            )}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <table className="w-full self-start text-[13px]">
            <caption className="sr-only">Votes by party</caption>
            <thead>
              <tr className="border-b-2 border-paper/30 text-left text-[10px] tracking-[0.1em] text-paper/70 uppercase">
                <th scope="col" className="py-1.5 font-bold">
                  Party
                </th>
                <th scope="col" className="w-[45%] py-1.5 font-bold">
                  <span className="sr-only">Split</span>
                </th>
                <th scope="col" className="py-1.5 text-right font-bold">
                  Aye
                </th>
                <th scope="col" className="py-1.5 text-right font-bold">
                  No
                </th>
                <th scope="col" className="py-1.5 text-right font-bold">
                  Abst.
                </th>
              </tr>
            </thead>
            <tbody>
              {division.byParty.map((p) => {
                const sum = p.ayes + p.noes + p.abstentions;
                return (
                  <tr key={p.partyId} className="border-b border-paper/10">
                    <th scope="row" className="py-1.5 pr-2 text-left font-normal">
                      <PartyChip
                        colour={p.colour}
                        label={p.shortName}
                        className="text-paper-bright"
                      />
                    </th>
                    <td aria-hidden="true" className="py-1.5 pr-3">
                      {/* To scale: the bar is as long as the party is big. */}
                      <span className="flex h-2.5 items-stretch">
                        <span
                          className="flex gap-px"
                          style={{ width: `${(sum / biggest) * 100}%` }}
                        >
                          <span className="bg-aye" style={{ flexGrow: p.ayes }} />
                          <span className="bg-abstain" style={{ flexGrow: p.abstentions }} />
                          <span className="bg-no" style={{ flexGrow: p.noes }} />
                        </span>
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-bold">{p.ayes}</td>
                    <td className="py-1.5 text-right font-bold">{p.noes}</td>
                    <td className="py-1.5 text-right">{p.abstentions}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div>
            <Sub className="mb-2 text-[11px] font-bold tracking-[0.1em] text-paper/75 uppercase">
              Rebels ({division.rebels.length})
            </Sub>
            {division.rebels.length === 0 ? (
              <p className="text-[13px] text-paper/70">
                Nobody defied the whips. The whips find this suspicious.
              </p>
            ) : (
              <ul className="grid max-h-80 gap-x-4 overflow-y-auto scrollbar-thin sm:grid-cols-2">
                {division.rebels.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-start gap-2.5 border-b border-paper/10 py-2 text-[13px]"
                  >
                    <Portrait seed={r.id} size="sm" partyColour={colourOf(r.partyShort)} />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate">
                          <PoliticianLink
                            campaignId={campaignId}
                            id={r.id}
                            name={r.name}
                            className="text-paper-bright"
                          />{' '}
                          <span className="text-paper/60">{r.partyShort}</span>
                        </span>
                        <span
                          className={cn(
                            'shrink-0 text-[11px] font-black uppercase',
                            r.vote === 'no'
                              ? 'bg-no px-1 text-white'
                              : r.vote === 'aye'
                                ? 'bg-good-strong px-1 text-white'
                                : 'text-paper/70',
                          )}
                        >
                          {voteLabel[r.vote]}
                        </span>
                      </span>
                      {r.reason && (
                        <span className="text-[12px] leading-snug text-paper/70">{r.reason}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
