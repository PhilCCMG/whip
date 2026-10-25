import { Kicker } from '@whip/ui';
import { useCampaignState, useCatalogue, useParliament } from '../api/hooks';
import type { ParliamentView } from '../api/types';
import { ErrorState, Loading } from '../components/states';
import { ChamberFloor } from '../features/chamber/chamber-floor';
import { DivisionList } from '../features/chamber/division-list';
import { MAJORITY_CAPTIONS, pick } from '../features/chamber/model';
import { NextDivision } from '../features/chamber/next-division';
import { OrderPaper } from '../features/chamber/order-paper';
import { DeskHeading, GameScreenHeader } from '../game-ui/game-screen';
import { formatSimDate } from '../lib/format';
import { useCampaignId } from '../lib/params';

/** "WORKING MAJORITY 74": a stencilled figure, with the caveat. */
function MajorityReadout({ parliament, turn }: { parliament: ParliamentView; turn: number }) {
  const m = parliament.governmentMajority;
  return (
    <div
      className="grid justify-items-end text-right"
      role="group"
      aria-label={`Working majority ${m}`}
    >
      <Kicker className="text-paper/80">Working majority</Kicker>
      <span
        aria-hidden="true"
        className="relative font-display text-[clamp(3.4rem,6vw,5.4rem)] leading-[0.82] font-black text-paper-bright tabular-nums [font-stretch:62%]"
      >
        {m > 0 ? m : m === 0 ? 'NONE' : m}
        {/* Stencil bridges: flat ink cuts through the figure. */}
        <span className="absolute inset-x-0 top-[46%] h-[0.06em] bg-ink/90" />
      </span>
      <span className="mt-1 text-[12px] text-lamp italic">
        {pick(MAJORITY_CAPTIONS, `majority:${turn}:${m}`)}
      </span>
    </div>
  );
}

/**
 * CHAMBER: the Commons. The House drawn from above (who sits where, your own seat), the next
 * division with the whips' board, the Order Paper, and the division lists.
 */
export function Component() {
  const id = useCampaignId();
  const q = useParliament(id);
  const state = useCampaignState(id);
  const catalogue = useCatalogue(id);
  const overview = state.data;

  if (q.isPending) return <Loading label="Calling the House to order" className="text-paper" />;
  if (q.isError)
    return (
      <div className="p-6">
        <ErrorState
          error={q.error}
          onRetry={() => void q.refetch()}
          className="bg-paper text-ink"
        />
      </div>
    );
  const p = q.data;
  const today = overview?.campaign.simDate ?? p.session.openedOn;
  const upcoming = [...p.upcomingDivisions]
    .filter((d) => d.scheduledFor >= today)
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
  const next = upcoming[0];
  const later = upcoming.slice(1);
  const items = catalogue.data?.items ?? [];
  const player = overview
    ? {
        id: overview.player.id,
        partyId: overview.player.partyId,
        constituencyName: overview.player.constituencyName,
      }
    : null;
  const govSeats = p.composition.filter((c) => c.inGovernment).reduce((s, c) => s + c.seats, 0);

  return (
    <div className="flex min-h-full flex-col">
      <GameScreenHeader
        title="Chamber"
        kicker={`Session ${p.session.number} · opened ${formatSimDate(p.session.openedOn)} · Where bills go to be amended beyond recognition`}
        crop="30% 46%"
        aside={<MajorityReadout parliament={p} turn={overview?.campaign.turn ?? 0} />}
      />

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] content-start gap-9 px-4 py-6 md:px-8 md:py-7">
        <section aria-labelledby="house-title" className="grid gap-4">
          <DeskHeading
            id="house-title"
            title="The House"
            meta={`${p.totalSeats} Members · government ${govSeats} · opposition ${p.totalSeats - govSeats} · ${Math.floor(p.totalSeats / 2) + 1} to win`}
          />
          <ChamberFloor parliament={p} player={player} className="bg-ink p-3 md:p-5" />
        </section>

        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-9 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,30rem)] xl:gap-x-10">
          <section aria-labelledby="next-division-title" className="grid gap-4">
            <DeskHeading
              id="next-division-title"
              title="Next division"
              meta={
                next
                  ? `${upcoming.length} ${upcoming.length === 1 ? 'division' : 'divisions'} scheduled`
                  : 'Nothing scheduled'
              }
            />
            {next && overview ? (
              <NextDivision
                division={next}
                bill={p.bills.find((b) => b.id === next.billId)}
                overview={overview}
                campaignId={id}
                catalogue={items}
              />
            ) : (
              <p className="bg-ink px-4 py-5 text-[13px] text-paper/75">
                No divisions scheduled. The whips are using the time to remember who owes them.
              </p>
            )}
            {later.length > 0 && (
              <ul className="grid gap-[2px]" aria-label="Later divisions">
                {later.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink px-4 py-2.5"
                  >
                    <span className="font-display text-[1.1rem] leading-none font-black text-paper-bright uppercase [font-stretch:72%]">
                      {d.billTitle}
                    </span>
                    <span className="text-[12px] text-paper/75 tabular-nums">
                      {d.stage} · {formatSimDate(d.scheduledFor)} · {d.forecast.unknown} unknown
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Order Paper" className="grid gap-4">
            <DeskHeading
              id="order-paper-heading"
              title="Today’s business"
              meta={`${p.bills.length} ${p.bills.length === 1 ? 'bill' : 'bills'} before the House`}
            />
            <OrderPaper
              parliament={p}
              campaignId={id}
              playerPartyId={overview?.player.partyId ?? null}
              catalogue={items}
              today={today}
            />
          </section>
        </div>

        <section aria-labelledby="divisions-title" className="grid gap-4">
          <DeskHeading
            id="divisions-title"
            title="Division lists"
            meta="How the House voted, as the Journal records it. Enter opens the tellers’ report."
          />
          <DivisionList divisions={p.recentDivisions} campaignId={id} />
        </section>
      </div>
    </div>
  );
}
