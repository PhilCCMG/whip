import { cn, CostChip, DisplayTitle, Kicker, PaperSheet, Slash } from '@whip/ui';
import { isApiError } from '../../api/errors';
import { usePlanAction } from '../../api/hooks';
import type { CareerOverview, PendingEvent } from '../../api/types';
import { DeskHeading } from '../../game-ui/game-screen';
import { plural } from '../../lib/format';
import { toast } from '../../stores/toast-store';

/**
 * A pending event as a dispatch demanding a decision: a letter on the desk with a red seal,
 * the situation, and one button per response with its cost.
 */
function Dispatch({
  event,
  overview,
  index,
}: {
  event: PendingEvent;
  overview: CareerOverview;
  index: number;
}) {
  const plan = usePlanAction(overview.campaign.id);
  const capital = overview.standing.politicalCapital;
  const titleId = `ev-${event.id}`;
  return (
    <PaperSheet
      as="article"
      tone="bright"
      tilt={index % 2 === 0 ? 'left' : 'right'}
      aria-labelledby={titleId}
      className="outline-2 outline-ink"
    >
      <div className="flex items-center justify-between gap-3 bg-ink px-4 py-2 text-paper-bright">
        <Kicker>Dispatch · week {event.raisedOnTurn}</Kicker>
        {/* The seal. */}
        <span aria-hidden="true" className="grid size-8 -my-3 -mr-1 place-items-center bg-whip">
          <Slash className="h-5 w-auto fill-white" />
        </span>
      </div>
      <div className="px-4 pt-3 pb-4">
        <DisplayTitle as="h3" size="md" id={titleId}>
          {event.title}
        </DisplayTitle>
        <p className="mt-2 text-[14px] leading-relaxed text-ink/85">{event.body}</p>
        <Kicker className="mt-4 text-ink/70">Your answer</Kicker>
        <ul className="mt-2 grid gap-1.5">
          {event.options.map((o) => {
            const tooDear = o.capitalCost > capital;
            return (
              <li key={o.key}>
                <button
                  type="button"
                  disabled={plan.isPending || tooDear}
                  onClick={() =>
                    plan.mutate(
                      { kind: 'respond_to_event', params: { eventId: event.id, optionKey: o.key } },
                      {
                        onSuccess: () =>
                          toast({ title: 'Answer sent', description: o.label, tone: 'good' }),
                      },
                    )
                  }
                  className={cn(
                    'group grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 border-2 border-ink px-3 py-2 text-left',
                    'hover:bg-ink hover:text-paper-bright focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-whip',
                    'disabled:cursor-not-allowed disabled:border-ink/30 disabled:text-ink/55 disabled:hover:bg-transparent',
                  )}
                >
                  <span className="font-display text-[1.1rem] leading-none font-black uppercase [font-stretch:72%]">
                    {o.label}
                  </span>
                  {o.capitalCost !== 0 ? (
                    <CostChip
                      kind="capital"
                      value={o.capitalCost}
                      short={tooDear}
                      className="row-span-2 group-hover:bg-paper-bright group-hover:text-ink"
                    />
                  ) : (
                    <span className="row-span-2 text-[10px] font-bold tracking-[0.08em] uppercase opacity-60">
                      Free
                    </span>
                  )}
                  <span className="text-[12.5px] leading-snug opacity-80">{o.description}</span>
                  {tooDear && (
                    <span className="col-span-2 text-[12px] font-bold text-whip">
                      You can’t afford this one
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {plan.error && (
          <div role="alert" className="mt-3 bg-whip px-3 py-2 text-[13px] text-white">
            <p className="font-bold">
              {isApiError(plan.error, 'ACTION_INELIGIBLE')
                ? 'You can’t answer that way this week'
                : 'It did not go as planned'}
            </p>
            {isApiError(plan.error) && plan.error.reasons.length > 0 ? (
              <ul className="mt-1 list-disc pl-4">
                {plan.error.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5">{plan.error.message}</p>
            )}
          </div>
        )}
      </div>
    </PaperSheet>
  );
}

export function Dispatches({ overview }: { overview: CareerOverview }) {
  const n = overview.pendingEvents.length;
  return (
    <section aria-labelledby="dispatches-title">
      <DeskHeading
        id="dispatches-title"
        title="On your desk"
        meta={
          n === 0
            ? 'Nothing on your desk. Someone will see to that.'
            : `${plural(n, 'dispatch', 'dispatches')} to answer before the week ends`
        }
      />
      {n > 0 && (
        <div className="mt-4 grid gap-5">
          {overview.pendingEvents.map((e, i) => (
            <Dispatch key={e.id} event={e} overview={overview} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}
