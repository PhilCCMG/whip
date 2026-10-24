import { Badge, Button, cn, Panel, PanelBody, PanelHeader, PartyChip, VoteBar } from '@whip/ui';
import { useParliament } from '../api/hooks';
import type { Bill, DivisionForecast } from '../api/types';
import { DivisionResultView } from '../components/division-result';
import { Hemicycle } from '../components/hemicycle';
import { KnownVoteBadge, PoliticianLink } from '../components/politician-bits';
import { Empty, ErrorState, Loading } from '../components/states';
import { formatSimDate } from '../lib/format';
import { useCampaignId } from '../lib/params';
import { useUiStore } from '../stores/ui-store';

const STAGES = [
  'First reading',
  'Second reading',
  'Committee stage',
  'Report stage',
  'Third reading',
  'Lords',
  'Royal Assent',
];

function stageIndex(stage: string): number {
  const s = stage.toLowerCase();
  const i = STAGES.findIndex((x) => s.startsWith(x.toLowerCase().split(' ')[0] ?? x));
  return i === -1 ? 0 : i;
}

function BillRow({ bill, campaignId }: { bill: Bill; campaignId: string }) {
  const current = stageIndex(bill.stage);
  return (
    <li className="grid gap-2 border-b border-moss-200 py-3 last:border-b-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-lg leading-tight font-extrabold font-stretch-condensed">
          {bill.title}
        </h3>
        <span className="text-xs text-moss-600">
          Sponsor{' '}
          <PoliticianLink campaignId={campaignId} id={bill.sponsorId} name={bill.sponsorName} />
        </span>
      </div>
      <p className="max-w-[72ch] text-sm text-ink/75">{bill.summary}</p>
      <ol className="grid grid-cols-7 gap-px" aria-label={`Stage: ${bill.stage}`}>
        {STAGES.map((s, i) => (
          <li
            key={s}
            aria-current={i === current ? 'step' : undefined}
            className={cn(
              'h-1.5',
              i < current ? 'bg-ink' : i === current ? 'bg-whip' : 'bg-moss-200',
            )}
            title={s}
          />
        ))}
      </ol>
      <p className="-mt-1 text-xs font-semibold">
        {bill.stage}
        <span className="font-normal text-moss-600">
          {' '}
          · stage {current + 1} of {STAGES.length}
        </span>
      </p>
      {bill.whipping.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Party whips">
          {bill.whipping.map((w) => (
            <li key={w.partyId} className="inline-flex items-center gap-1.5">
              <span className="font-semibold">{w.shortName}</span>
              <span className="text-moss-600">{w.instruction}</span>
              {w.direction && <KnownVoteBadge vote={w.direction} />}
            </li>
          ))}
        </ul>
      )}
      {bill.issues.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="What the bill does">
          {bill.issues.map((iss) => (
            <li key={iss.issueKey}>
              <Badge tone={iss.stance > 0 ? 'good' : iss.stance < 0 ? 'critical' : 'neutral'}>
                {iss.label} {iss.stance > 0 ? `+${iss.stance}` : iss.stance}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Forecast({ d, campaignId }: { d: DivisionForecast; campaignId: string }) {
  const openPlanner = useUiStore((s) => s.openPlanner);
  const { ayes, noes, abstain, unknown } = d.forecast;
  const lead = ayes - noes;
  return (
    <article className="grid gap-3" aria-labelledby={`fc-${d.id}`}>
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs text-moss-600">
            {d.stage} · {formatSimDate(d.scheduledFor)}
          </p>
          <h3
            id={`fc-${d.id}`}
            className="font-display text-xl leading-none font-extrabold font-stretch-condensed"
          >
            {d.billTitle}
          </h3>
        </div>
        <p className="text-right text-xs">
          <span className="text-moss-600">Known lead </span>
          <span className={cn('font-bold tabular', lead >= 0 ? 'text-good-strong' : 'text-whip')}>
            {lead >= 0 ? 'Ayes' : 'Noes'} by {Math.abs(lead)}
          </span>
          <br />
          <span className="text-moss-600">{unknown} intentions unknown</span>
        </p>
      </header>
      <VoteBar ayes={ayes} noes={noes} abstain={abstain} unknown={unknown} size="lg" />
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          Your intended vote: <KnownVoteBadge vote={d.playerIntendedVote ?? 'unknown'} />
        </span>
        <span className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              openPlanner({ kind: 'make_political_promise', params: { divisionId: d.id } })
            }
          >
            Promise a vote
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              openPlanner({ kind: 'rebel_against_party', params: { divisionId: d.id } })
            }
          >
            Rebel
          </Button>
        </span>
      </div>
      {d.waverers.length > 0 && (
        <div>
          <h4 className="mb-1 text-xs font-semibold text-moss-600">
            Waverers you know about ({d.waverers.length})
          </h4>
          <ul className="grid gap-x-4 sm:grid-cols-2">
            {d.waverers.map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between gap-2 border-b border-moss-200 py-1 text-sm"
              >
                <span className="min-w-0 truncate">
                  <PoliticianLink campaignId={campaignId} id={w.id} name={w.name} />{' '}
                  <span className="text-xs text-moss-600">{w.partyShort}</span>
                </span>
                <KnownVoteBadge vote={w.known} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function Component() {
  const id = useCampaignId();
  const q = useParliament(id);
  if (q.isPending) return <Loading label="Loading the Commons" />;
  if (q.isError)
    return <ErrorState className="m-5" error={q.error} onRetry={() => void q.refetch()} />;
  const p = q.data;
  const government = p.composition.filter((c) => c.inGovernment);
  const opposition = p.composition.filter((c) => !c.inGovernment).sort((a, b) => b.seats - a.seats);
  const ordered = [...government, ...opposition];
  const govSeats = government.reduce((s, c) => s + c.seats, 0);

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-[3px] border-ink pb-2">
        <h1 className="font-display text-4xl leading-none font-black font-stretch-condensed">
          The Commons
        </h1>
        <p className="text-xs text-moss-600">
          Session {p.session.number}, opened {formatSimDate(p.session.openedOn)}
        </p>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel aria-labelledby="house-title" className="bg-paper">
          <PanelHeader number={1} title="House composition" titleId="house-title" />
          <PanelBody>
            <Hemicycle
              groups={ordered.map((c) => ({
                id: c.partyId,
                label: c.shortName,
                colour: c.colour,
                seats: c.seats,
              }))}
              majorityLine={Math.floor(p.totalSeats / 2) + 1}
              className="mx-auto w-full max-w-xl text-ink"
            />
            <div className="mt-3 flex items-baseline justify-between border-y border-ink py-2">
              <span className="text-sm">
                Government majority{' '}
                <strong className="font-display text-2xl font-black font-stretch-condensed tabular">
                  {p.governmentMajority}
                </strong>
              </span>
              <span className="text-xs text-moss-600 tabular">
                {govSeats} of {p.totalSeats} seats · {Math.floor(p.totalSeats / 2) + 1} to win
              </span>
            </div>
            <table className="mt-2 w-full text-sm">
              <caption className="sr-only">Seats by party</caption>
              <thead className="sr-only">
                <tr>
                  <th scope="col">Party</th>
                  <th scope="col">Side</th>
                  <th scope="col">Seats</th>
                </tr>
              </thead>
              <tbody>
                {ordered.map((c) => (
                  <tr key={c.partyId} className="border-b border-moss-200">
                    <th scope="row" className="py-1.5 text-left font-normal">
                      <PartyChip colour={c.colour} label={c.name} size="md" />
                    </th>
                    <td className="py-1.5 pr-3 text-right text-xs text-moss-600">
                      {c.inGovernment ? 'Government' : ''}
                    </td>
                    <td className="py-1.5 text-right font-semibold">{c.seats}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PanelBody>
        </Panel>

        <div className="grid gap-4">
          <Panel aria-labelledby="forecast-title" className="bg-paper">
            <PanelHeader number={2} title="Division forecast" titleId="forecast-title">
              <p className="mt-1 text-xs text-moss-600">
                From what you and the whips know. Meet colleagues to shrink the unknowns.
              </p>
            </PanelHeader>
            <PanelBody className="grid gap-6">
              {p.upcomingDivisions.length === 0 ? (
                <Empty className="px-0">No divisions scheduled.</Empty>
              ) : (
                p.upcomingDivisions.map((d) => <Forecast key={d.id} d={d} campaignId={id} />)
              )}
            </PanelBody>
          </Panel>

          <Panel aria-labelledby="bills-title" className="bg-paper">
            <PanelHeader number={3} title="Bills before the House" titleId="bills-title" />
            <PanelBody className="py-0">
              <ul>
                {p.bills.map((b) => (
                  <BillRow key={b.id} bill={b} campaignId={id} />
                ))}
              </ul>
            </PanelBody>
          </Panel>
        </div>
      </div>

      <Panel aria-labelledby="recent-title" className="bg-paper">
        <PanelHeader number={4} title="Recent divisions" titleId="recent-title" />
        <PanelBody className="grid gap-8">
          {p.recentDivisions.length === 0 ? (
            <Empty className="px-0">No divisions yet this session.</Empty>
          ) : (
            p.recentDivisions.map((d) => (
              <DivisionResultView key={d.id} division={d} campaignId={id} />
            ))
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
