import { cn, CostChip, Kicker, Plate, Portrait } from '@whip/ui';
import type {
  ActionCatalogueItem,
  ActionKind,
  Bill,
  CareerOverview,
  DivisionForecast,
  KnownVote,
} from '../../api/types';
import { PoliticianLink } from '../../components/politician-bits';
import { formatSimDate } from '../../lib/format';
import { useUiStore } from '../../stores/ui-store';
import {
  CALL_LABEL,
  countdownLabel,
  forecastCall,
  VOTE_WORD,
  weeksUntil,
  whipCommentary,
  whipLines,
  type ForecastCounts,
} from './model';

const MARK: Record<KnownVote, string> = {
  aye: 'bg-aye',
  no: 'bg-no',
  abstain: 'bg-abstain',
  unknown: 'bg-unknown',
};

/**
 * The whips' board: four columns of figures, and the line of the vote with the unknowns in the
 * middle where they belong. If the unknown block covers the halfway mark, it could go either way.
 */
export function ForecastBoard({ forecast }: { forecast: ForecastCounts }) {
  const { ayes, noes, abstain, unknown } = forecast;
  const voting = Math.max(1, ayes + noes + unknown);
  const cells: [KnownVote, string, number, string][] = [
    ['aye', 'Aye', ayes, 'Expected in the Aye lobby'],
    ['no', 'No', noes, 'Expected in the No lobby'],
    ['abstain', 'Abstain', abstain, 'Expected to stay in the tea room'],
    ['unknown', 'Unknown', unknown, 'Not yet known to you'],
  ];
  return (
    <div className="grid gap-3">
      <dl className="grid grid-cols-2 gap-px bg-paper/15 sm:grid-cols-4">
        {cells.map(([k, label, n, gloss]) => (
          <div
            key={k}
            className={cn(
              'flex flex-col-reverse justify-end bg-ink px-3 py-2.5',
              k === 'unknown' && 'outline-2 -outline-offset-4 outline-paper/30 outline-dashed',
            )}
          >
            <dd className="grid gap-1">
              <span className="font-display text-[clamp(2.4rem,4.4vw,3.6rem)] leading-[0.85] font-black text-paper-bright tabular-nums [font-stretch:66%]">
                {k === 'unknown' && (
                  <span aria-hidden="true" className="mr-1 text-paper/45">
                    ?
                  </span>
                )}
                {n}
              </span>
              <span className="text-[11px] leading-tight text-paper/70">{gloss}</span>
            </dd>
            <dt className="mb-1.5 flex items-center gap-2 text-[11px] font-black tracking-[0.12em] text-paper-bright uppercase">
              <span aria-hidden="true" className={cn('size-2.5', MARK[k])} />
              {label}
            </dt>
          </div>
        ))}
      </dl>
      {/* The line of the vote: ayes from the left, noes from the right, fog in between. */}
      <div aria-hidden="true" className="relative">
        <div className="flex h-4 gap-[2px]">
          <span className="bg-aye" style={{ flexGrow: ayes / voting, flexBasis: 0 }} />
          <span
            className="outline-2 -outline-offset-2 outline-paper/45 outline-dashed"
            style={{ flexGrow: unknown / voting, flexBasis: 0 }}
          />
          <span className="bg-no" style={{ flexGrow: noes / voting, flexBasis: 0 }} />
        </div>
        <span className="absolute -top-1.5 left-1/2 h-7 w-[3px] -translate-x-1/2 bg-paper-bright" />
        <span className="absolute top-7 left-1/2 -translate-x-1/2 text-[9.5px] font-bold tracking-[0.12em] whitespace-nowrap text-paper/70 uppercase">
          Halfway
        </span>
      </div>
      <p className="mt-5 text-[12px] text-paper/70 tabular-nums">
        {abstain} abstentions don’t count towards the result. Meet colleagues to shrink the
        unknowns.
      </p>
    </div>
  );
}

function WavererChip({
  w,
  campaignId,
  onFindOut,
  tutorialTarget = false,
}: {
  w: DivisionForecast['waverers'][number];
  campaignId: string;
  onFindOut: () => void;
  /** Marks this chip's Find out button for the induction ("find-out" step). */
  tutorialTarget?: boolean;
}) {
  const unknown = w.known === 'unknown';
  return (
    <li className="flex items-center gap-2.5 border-b border-paper/12 py-2">
      <Portrait seed={w.id} size="sm" />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <PoliticianLink
          campaignId={campaignId}
          id={w.id}
          name={w.name}
          className="truncate text-[13px] text-paper-bright focus-visible:outline-paper-bright"
        />
        <span className="text-[11px] text-paper/65">{w.partyShort}</span>
      </span>
      {unknown ? (
        <button
          type="button"
          onClick={onFindOut}
          data-tutorial={tutorialTarget ? 'find-out' : undefined}
          aria-label={`Find out how ${w.name} will vote: plan a meeting`}
          className="flex h-7 shrink-0 cursor-pointer items-center gap-1.5 px-2 text-[11px] font-black tracking-[0.06em] text-paper-bright uppercase outline-1 -outline-offset-1 outline-paper/40 outline-dashed hover:bg-paper-bright hover:text-ink focus-visible:outline-2 focus-visible:outline-paper-bright"
        >
          <span aria-hidden="true">?</span> Find out
        </button>
      ) : (
        <span
          className={cn(
            'shrink-0 px-1.5 py-1 text-[11px] leading-none font-black tracking-[0.06em] uppercase',
            w.known === 'aye' && 'bg-aye text-white',
            w.known === 'no' && 'bg-no text-white',
            w.known === 'abstain' && 'bg-abstain text-ink',
          )}
        >
          {VOTE_WORD[w.known]}
        </span>
      )}
    </li>
  );
}

function VoteOption({
  item,
  label,
  note,
  onPlan,
  planned,
}: {
  item: ActionCatalogueItem | undefined;
  label: string;
  note: string;
  onPlan: () => void;
  planned: boolean;
}) {
  const disabled = (!!item && !item.eligible) || planned;
  const why = planned ? 'Already in your diary.' : item && !item.eligible ? item.reasons[0] : null;
  return (
    <button
      type="button"
      onClick={onPlan}
      disabled={disabled}
      className="grid cursor-pointer gap-1 bg-paper-bright px-3 py-2.5 text-left text-ink outline-none hover:bg-paper focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-whip disabled:cursor-not-allowed disabled:bg-moss-900 disabled:text-paper/70"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="font-display text-[1.05rem] leading-none font-black uppercase [font-stretch:72%]">
          {label}
        </span>
        {item && (
          <span className="flex shrink-0 gap-1">
            <CostChip kind="slots" value={item.slots} />
            {item.capitalCost > 0 && <CostChip kind="capital" value={item.capitalCost} />}
          </span>
        )}
      </span>
      <span className={cn('text-[12px] leading-snug', why ? 'text-lamp' : 'text-ink/75')}>
        {why ?? note}
      </span>
    </button>
  );
}

/**
 * NEXT DIVISION: the countdown, the whips' board (unknowns shown honestly), the waverers you
 * know about, and your own vote with the ways to change it (each opens the Office planner).
 */
export function NextDivision({
  division,
  bill,
  overview,
  campaignId,
  catalogue,
}: {
  division: DivisionForecast;
  bill: Bill | undefined;
  overview: CareerOverview;
  campaignId: string;
  catalogue: ActionCatalogueItem[];
}) {
  const openPlanner = useUiStore((s) => s.openPlanner);
  const today = overview.campaign.simDate;
  const weeks = weeksUntil(today, division.scheduledFor);
  const { call, lead, side } = forecastCall(division.forecast);
  const whip = bill?.whipping.find((w) => w.partyId === overview.player.partyId);
  const lines = whip ? whipLines(whip.instruction) : 0;
  const vote = division.playerIntendedVote;
  const against = !!(vote && whip?.direction && vote !== whip.direction);
  const item = (k: ActionKind) => catalogue.find((c) => c.kind === k);
  const planned = (k: ActionKind) =>
    overview.diary.planned.some(
      (p) =>
        p.kind === k &&
        (p.params.divisionId === division.id || p.params.billId === division.billId),
    );
  const knownWaverers = [...division.waverers].sort(
    (a, b) => Number(a.known === 'unknown') - Number(b.known === 'unknown'),
  );
  const firstUnknownId = knownWaverers.find((w) => w.known === 'unknown')?.id;

  return (
    <section aria-labelledby={`nd-${division.id}`} className="bg-ink text-paper">
      <div aria-hidden="true" className="h-1.5 bg-whip" />
      <div className="grid gap-6 p-4 md:p-6">
        <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 flex-col-reverse">
            <h3
              id={`nd-${division.id}`}
              className="mt-2 font-display text-[clamp(1.9rem,3.6vw,3rem)] leading-[0.88] font-black text-paper-bright uppercase [font-stretch:68%]"
            >
              {division.billTitle}
            </h3>
            <Kicker className="text-paper/75">
              Next division · {division.stage} · {formatSimDate(division.scheduledFor)}
            </Kicker>
          </div>
          <Plate tone="whip" edge="both" className="py-2 text-white">
            <span className="block text-[10px] font-bold tracking-[0.12em] uppercase opacity-90">
              The House divides
            </span>
            <span className="block font-display text-[clamp(1.6rem,3vw,2.3rem)] leading-none font-black uppercase [font-stretch:68%]">
              {countdownLabel(weeks)}
            </span>
          </Plate>
        </header>

        <div className="grid gap-2" data-tutorial="forecast">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h4 className="text-[11px] font-black tracking-[0.12em] text-paper-bright uppercase">
              The whips’ forecast
            </h4>
            <p className="text-[12px] font-semibold text-paper/80 tabular-nums">
              <span className="text-lamp">{CALL_LABEL[call]}</span>
              {side !== 'tied' && (
                <>
                  {' '}
                  · known lead: {side === 'aye' ? 'Ayes' : 'Noes'} by {Math.abs(lead)}
                </>
              )}
            </p>
          </div>
          <ForecastBoard forecast={division.forecast} />
          <p className="border-l-[3px] border-whip pl-3 text-[13.5px] leading-snug text-paper-bright italic">
            {whipCommentary(call, `${division.id}:${overview.campaign.turn}`)}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div data-tutorial="waverers">
            <h4 className="mb-1 text-[11px] font-black tracking-[0.12em] text-paper-bright uppercase">
              Waverers you know of ({division.waverers.length})
            </h4>
            {knownWaverers.length === 0 ? (
              <p className="text-[13px] text-paper/70">
                You know of no waverers. That is not the same as there being none.
              </p>
            ) : (
              <ul className="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-1">
                {knownWaverers.map((w) => (
                  <WavererChip
                    key={w.id}
                    w={w}
                    campaignId={campaignId}
                    tutorialTarget={w.id === firstUnknownId}
                    onFindOut={() =>
                      openPlanner({
                        kind: 'meet_politician',
                        params: { targetId: w.id },
                        labels: { [w.id]: w.name },
                      })
                    }
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="grid content-start gap-3" data-tutorial="your-vote">
            <h4 className="text-[11px] font-black tracking-[0.12em] text-paper-bright uppercase">
              Your vote
            </h4>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
              <span
                className={cn(
                  'font-display text-[3.2rem] leading-[0.82] font-black uppercase [font-stretch:66%]',
                  vote ? 'text-paper-bright' : 'text-paper/50',
                )}
              >
                {vote ? VOTE_WORD[vote] : 'Undecided'}
              </span>
              <span className="pb-1 text-[12.5px] leading-snug text-paper/80">
                {whip?.direction ? (
                  against ? (
                    <strong className="text-lamp">Against the {whip.shortName} whip</strong>
                  ) : (
                    <>With the {whip.shortName} whip</>
                  )
                ) : (
                  'No party line'
                )}
                {whip && (
                  <>
                    <br />
                    {whip.instruction}
                    {lines === 3 && ' · the whips will be counting'}
                  </>
                )}
              </span>
            </div>
            <p className="text-[12.5px] leading-snug text-paper/75">
              You vote as your whip says unless you plan otherwise. Each option goes in your Office
              diary for this week.
            </p>
            <div className="grid gap-[2px] sm:grid-cols-2">
              <VoteOption
                item={item('support_legislation')}
                label="Speak in support"
                note="Vote aye, publicly. The front bench notices."
                planned={planned('support_legislation')}
                onPlan={() =>
                  openPlanner({ kind: 'support_legislation', params: { billId: division.billId } })
                }
              />
              <VoteOption
                item={item('oppose_legislation')}
                label="Speak against"
                note="Vote no, publicly. So do the whips, privately."
                planned={planned('oppose_legislation')}
                onPlan={() =>
                  openPlanner({ kind: 'oppose_legislation', params: { billId: division.billId } })
                }
              />
              <VoteOption
                item={item('rebel_against_party')}
                label="Rebel"
                note="Vote no or abstain against the whip, and bring friends."
                planned={planned('rebel_against_party')}
                onPlan={() =>
                  openPlanner({
                    kind: 'rebel_against_party',
                    params: { divisionId: division.id },
                  })
                }
              />
              <VoteOption
                item={item('make_political_promise')}
                label="Promise a vote"
                note="Pledge your vote to a colleague. Keeping it is optional, once."
                planned={false}
                onPlan={() =>
                  openPlanner({
                    kind: 'make_political_promise',
                    params: { divisionId: division.id },
                  })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
