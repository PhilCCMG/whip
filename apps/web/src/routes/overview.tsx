import {
  Badge,
  Button,
  cn,
  Headline,
  Panel,
  PanelBody,
  PanelHeader,
  PartyChip,
  StatMeter,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@whip/ui';
import { Newspaper, Plus, X } from 'lucide-react';
import { isApiError } from '../api/errors';
import { useCampaignState, useCancelAction, usePlanAction, useTurnReport } from '../api/hooks';
import type { CareerOverview, PendingEvent, PlannedAction } from '../api/types';
import {
  addDays,
  formatNumber,
  formatSimDate,
  formatShortDate,
  plural,
  REPUTATION_LABELS,
  signed,
  SKILL_LABELS,
  weekdayName,
} from '../lib/format';
import { useCampaignId } from '../lib/params';
import { toast } from '../stores/toast-store';
import { useUiStore } from '../stores/ui-store';

function ProfileCard({ overview }: { overview: CareerOverview }) {
  const { player, standing } = overview;
  const skills = Object.entries(player.skills).sort((a, b) => b[1] - a[1]);
  return (
    <section
      aria-labelledby="profile-name"
      className="relative bg-ink text-paper"
      style={{ borderTop: `6px solid ${player.partyColour}` }}
    >
      <div className="px-5 pt-4 pb-5">
        <div className="flex items-center justify-between gap-2">
          <PartyChip
            colour={player.partyColour}
            label={player.partyName}
            className="text-paper/85"
          />
          <span className="text-[11px] font-semibold text-paper/55">
            {player.offices[0] ?? 'Backbencher'}
          </span>
        </div>
        <h2
          id="profile-name"
          className="mt-3 font-display text-[2.6rem] leading-[0.88] font-black font-stretch-condensed"
        >
          {player.name}
        </h2>
        <p className="mt-2 text-sm text-paper/75">
          Member for <strong className="text-paper">{player.constituencyName}</strong>
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-px bg-white/10 text-center">
          <div className="bg-ink px-2 py-2">
            <dt className="text-[11px] text-paper/55">Majority</dt>
            <dd className="font-display text-xl font-extrabold font-stretch-condensed tabular">
              {player.majority === null ? '—' : formatNumber(player.majority)}
            </dd>
          </div>
          <div className="bg-ink px-2 py-2">
            <dt className="text-[11px] text-paper/55">Influence</dt>
            <dd className="font-display text-xl font-extrabold font-stretch-condensed tabular">
              {Math.round(standing.influence.total)}
            </dd>
          </div>
          <div className="bg-ink px-2 py-2">
            <dt className="text-[11px] text-paper/55">Loyalty</dt>
            <dd className="font-display text-xl font-extrabold font-stretch-condensed tabular">
              {Math.round(standing.partyLoyalty)}
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-paper/60">
          {player.factionName ? `${player.factionName} faction` : 'No faction'}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
          {skills.map(([key, v]) => (
            <li key={key}>
              <StatMeter
                label={SKILL_LABELS[key] ?? key}
                value={v}
                min={0}
                max={20}
                banded
                className="text-paper"
              />
            </li>
          ))}
        </ul>
        {player.traits.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Traits">
            {player.traits.map((t) => (
              <li key={t.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      tabIndex={0}
                      className="inline-block border border-paper/30 px-1.5 py-0.5 text-[11px] font-semibold"
                    >
                      {t.label}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{t.description}</TooltipContent>
                </Tooltip>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Reopens the report from the most recent advance (kept server-side, so it survives a reload). */
function LastReportButton({ campaignId }: { campaignId: string }) {
  const report = useTurnReport(campaignId);
  const setTurnReportOpen = useUiStore((s) => s.setTurnReportOpen);
  if (!report.data) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setTurnReportOpen(true)}
      aria-label={`Last week’s report (week ${report.data.turn})`}
    >
      <Newspaper aria-hidden="true" /> Last week’s report
    </Button>
  );
}

function Briefing({ overview }: { overview: CareerOverview }) {
  const sorted = [...overview.briefing.headlines].sort((a, b) => b.importance - a.importance);
  const [lead, ...rest] = sorted;
  return (
    <section aria-labelledby="briefing-title" className="bg-paper px-5 pt-3 pb-5 text-ink">
      <header className="flex items-end justify-between gap-3 border-b-[3px] border-ink pb-1.5">
        <h2
          id="briefing-title"
          className="font-display text-[1.35rem] leading-none font-black font-stretch-condensed"
        >
          Weekly briefing
        </h2>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <p className="text-[11px] font-semibold text-moss-600 tabular">
            Week {overview.briefing.turn} · {formatSimDate(overview.campaign.simDate)}
          </p>
          <LastReportButton campaignId={overview.campaign.id} />
        </div>
      </header>
      <div className="mt-px border-t border-ink" />
      {!lead ? (
        <p className="py-6 text-sm text-moss-600">The papers are quiet. It won’t last.</p>
      ) : (
        <>
          <Headline
            as="h3"
            className="mt-4"
            text={lead.text}
            standfirst={lead.standfirst}
            importance={Math.max(lead.importance, 4)}
          />
          {rest.length > 0 && (
            <div className="mt-5 grid gap-x-4 gap-y-4 border-t border-ink pt-3 sm:grid-cols-2 sm:[&>*:nth-child(even)]:border-l sm:[&>*:nth-child(even)]:border-moss-200 sm:[&>*:nth-child(even)]:pl-4">
              {rest.slice(0, 6).map((h) => (
                <Headline
                  key={h.text}
                  as="h3"
                  text={h.text}
                  standfirst={h.standfirst}
                  importance={Math.min(h.importance, 3)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

interface Cell {
  action: PlannedAction | null;
  start: number;
  span: number;
}

function layoutDiary(slotsTotal: number, planned: PlannedAction[]): Cell[] {
  const cells: Cell[] = [];
  let cursor = 0;
  for (const a of planned) {
    if (a.slots <= 0) continue;
    const span = Math.min(a.slots, Math.max(slotsTotal - cursor, 1));
    cells.push({ action: a, start: cursor, span });
    cursor += span;
  }
  for (; cursor < slotsTotal; cursor++) cells.push({ action: null, start: cursor, span: 1 });
  return cells;
}

function Diary({ overview }: { overview: CareerOverview }) {
  const id = overview.campaign.id;
  const openPlanner = useUiStore((s) => s.openPlanner);
  const cancel = useCancelAction(id);
  const { diary } = overview;
  const cells = layoutDiary(diary.slotsTotal, diary.planned);
  const noSlot = diary.planned.filter((a) => a.slots <= 0);
  const free = diary.slotsTotal - diary.slotsUsed;
  const dayFor = (slot: number) => addDays(overview.campaign.simDate, slot % 5);

  return (
    <Panel aria-labelledby="diary-title" className="bg-paper">
      <PanelHeader
        number={1}
        title="This week’s diary"
        titleId="diary-title"
        actions={
          <Button size="sm" onClick={() => openPlanner()} disabled={free <= 0}>
            <Plus aria-hidden="true" /> Plan action
          </Button>
        }
      >
        <p className="mt-1 text-xs text-moss-600">
          {plural(free, 'slot')} free of {diary.slotsTotal} · {overview.standing.politicalCapital}{' '}
          capital to spend
        </p>
      </PanelHeader>
      <PanelBody className="pb-4">
        <ol
          className="grid gap-px border border-moss-200 bg-moss-200"
          style={{ gridTemplateColumns: `repeat(${diary.slotsTotal}, minmax(0, 1fr))` }}
          aria-label="Diary slots, Monday to Friday"
        >
          {cells.map((cell) => {
            const days = Array.from({ length: cell.span }, (_, i) => dayFor(cell.start + i));
            const dayLabel =
              cell.span > 1
                ? `${weekdayName(days[0] ?? '')}–${weekdayName(days.at(-1) ?? '')}`
                : weekdayName(days[0] ?? '');
            return (
              <li
                key={cell.start}
                className="flex min-h-[7.5rem] flex-col bg-paper max-sm:col-span-full! max-sm:min-h-0"
                style={{ gridColumn: `span ${cell.span} / span ${cell.span}` }}
              >
                <div className="flex items-baseline justify-between border-b border-moss-200 px-2.5 py-1.5">
                  <span className="text-xs font-bold">{dayLabel}</span>
                  <span className="text-[11px] text-moss-600 tabular">
                    {formatShortDate(days[0] ?? overview.campaign.simDate)}
                  </span>
                </div>
                {cell.action ? (
                  <div className="relative flex flex-1 flex-col justify-between gap-2 border-l-[3px] border-ink bg-white/50 px-2.5 py-2">
                    <p className="pr-6 text-sm leading-snug font-semibold">{cell.action.label}</p>
                    <p className="flex gap-1">
                      <Badge tone="outline">{plural(cell.action.slots, 'slot')}</Badge>
                      {cell.action.capitalCost > 0 && (
                        <Badge tone="ink">{cell.action.capitalCost} PC</Badge>
                      )}
                    </p>
                    <button
                      type="button"
                      className="absolute top-1.5 right-1.5 inline-flex size-6 cursor-pointer items-center justify-center text-moss-600 hover:bg-ink/10 hover:text-ink focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-40"
                      aria-label={`Remove “${cell.action.label}” from diary`}
                      disabled={cancel.isPending}
                      onClick={() => {
                        const label = cell.action?.label ?? 'Action';
                        if (cell.action)
                          cancel.mutate(cell.action.id, {
                            onSuccess: () =>
                              toast({ title: 'Removed from diary', description: label }),
                          });
                      }}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => openPlanner()}
                    className="group m-2 flex flex-1 cursor-pointer items-center justify-center gap-1.5 border border-dashed border-moss-400 text-xs font-semibold text-moss-600 hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-ring"
                    aria-label={`Plan an action for ${dayLabel}`}
                  >
                    <Plus aria-hidden="true" className="size-3.5" /> Free
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {noSlot.length > 0 && (
          <div className="mt-3">
            <h3 className="text-xs font-semibold text-moss-600">Also decided this week</h3>
            <ul className="mt-1 grid gap-1">
              {noSlot.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{a.label}</span>
                  {a.capitalCost !== 0 && <Badge tone="ink">{a.capitalCost} PC</Badge>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </PanelBody>
    </Panel>
  );
}

function EventCard({ event, overview }: { event: PendingEvent; overview: CareerOverview }) {
  const plan = usePlanAction(overview.campaign.id);
  const capital = overview.standing.politicalCapital;
  return (
    <article
      aria-labelledby={`ev-${event.id}`}
      className="border-l-4 border-whip bg-paper px-4 py-3"
    >
      <p className="text-[11px] font-semibold text-moss-600">Raised in week {event.raisedOnTurn}</p>
      <h3
        id={`ev-${event.id}`}
        className="mt-0.5 font-display text-xl leading-tight font-extrabold font-stretch-condensed"
      >
        {event.title}
      </h3>
      <p className="mt-1 max-w-[68ch] text-sm leading-relaxed text-ink/80">{event.body}</p>
      <ul className="mt-3 grid gap-2 md:grid-cols-3">
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
                        toast({ title: 'Response decided', description: o.label, tone: 'good' }),
                    },
                  )
                }
                className={cn(
                  'flex h-full w-full cursor-pointer flex-col gap-1 border border-ink/25 bg-white/40 px-3 py-2 text-left',
                  'hover:border-ink hover:bg-white focus-visible:outline-2 focus-visible:outline-ring',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="text-sm leading-tight font-bold">{o.label}</span>
                  {o.capitalCost !== 0 && (
                    <Badge tone="ink" className="shrink-0">
                      {o.capitalCost} PC
                    </Badge>
                  )}
                </span>
                <span className="text-xs leading-snug text-ink/70">{o.description}</span>
                {tooDear && (
                  <span className="text-xs font-semibold text-whip">Not enough capital</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {plan.error && (
        <div role="alert" className="mt-2 border-l-4 border-whip pl-3 text-sm">
          <p className="font-semibold">
            {isApiError(plan.error, 'ACTION_INELIGIBLE')
              ? 'You can’t respond that way this week'
              : 'Couldn’t record your response'}
          </p>
          {isApiError(plan.error) && plan.error.reasons.length > 0 ? (
            <ul className="mt-1 list-disc pl-4 opacity-80">
              {plan.error.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-0.5 opacity-80">{plan.error.message}</p>
          )}
        </div>
      )}
    </article>
  );
}

function PendingEvents({ overview }: { overview: CareerOverview }) {
  return (
    <Panel aria-labelledby="events-title" className="bg-paper-deep">
      <PanelHeader number={2} title="Needs your answer" titleId="events-title">
        <p className="mt-1 text-xs text-moss-600">
          {overview.pendingEvents.length === 0
            ? 'Nothing waiting.'
            : `${plural(overview.pendingEvents.length, 'decision')} before the week ends`}
        </p>
      </PanelHeader>
      {overview.pendingEvents.length > 0 && (
        <div className="grid gap-3 px-4 py-3">
          {overview.pendingEvents.map((e) => (
            <EventCard key={e.id} event={e} overview={overview} />
          ))}
        </div>
      )}
    </Panel>
  );
}

function Standing({ overview }: { overview: CareerOverview }) {
  const { standing } = overview;
  const maxInfluence = Math.max(...standing.influence.breakdown.map((b) => Math.abs(b.value)), 1);
  return (
    <Panel aria-labelledby="standing-title" className="bg-paper">
      <PanelHeader number={3} title="Standing" titleId="standing-title" />
      <PanelBody className="grid gap-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-moss-600">Political capital</p>
            <p className="font-display text-5xl leading-none font-black font-stretch-condensed tabular">
              {standing.politicalCapital}
            </p>
            <p className="mt-1 text-xs font-semibold text-good-strong">
              {signed(standing.capitalIncome)} next week
            </p>
          </div>
          <div>
            <p className="text-xs text-moss-600">Influence</p>
            <p className="font-display text-5xl leading-none font-black font-stretch-condensed tabular">
              {Math.round(standing.influence.total)}
            </p>
            <p className="mt-1 text-xs text-moss-600">
              {plural(standing.endorsements.length, 'endorsement')}
            </p>
          </div>
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-moss-600">
            Where your influence comes from
          </h3>
          <ul className="grid gap-1">
            {standing.influence.breakdown.map((b) => (
              <li
                key={b.label}
                className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-xs"
              >
                <span className="truncate">{b.label}</span>
                <span className="h-2 bg-moss-100">
                  <span
                    className={cn('block h-full', b.value < 0 ? 'bg-whip' : 'bg-ink')}
                    style={{ width: `${(Math.abs(b.value) / maxInfluence) * 100}%` }}
                  />
                </span>
                <span className="text-right font-semibold tabular">
                  {signed(Math.round(b.value))}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="mb-1.5 text-xs font-semibold text-moss-600">Reputation</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(standing.reputation).map(([k, v]) => (
              <li key={k}>
                <StatMeter label={REPUTATION_LABELS[k] ?? k} value={v} colour="var(--color-ink)" />
              </li>
            ))}
          </ul>
        </div>

        {standing.endorsements.length > 0 && (
          <p className="text-xs">
            <span className="text-moss-600">Endorsed by </span>
            {standing.endorsements.map((e) => e.name).join(', ')}
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

export function Component() {
  const id = useCampaignId();
  const { data } = useCampaignState(id);
  if (!data) return null;
  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 p-3 sm:p-4 lg:p-5">
      <h1 className="sr-only">Career overview</h1>
      <div className="grid gap-4 2xl:grid-cols-[340px_minmax(0,1fr)] xl:grid-cols-[300px_minmax(0,1fr)]">
        <ProfileCard overview={data} />
        <Briefing overview={data} />
      </div>
      <Diary overview={data} />
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <PendingEvents overview={data} />
        <Standing overview={data} />
      </div>
    </div>
  );
}
