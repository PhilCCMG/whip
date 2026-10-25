import { cn, CostChip, PaperSheet, Portrait, Stamp } from '@whip/ui';
import { ChevronDown } from 'lucide-react';
import { useRef, useState, type KeyboardEvent } from 'react';
import type { ActionCatalogueItem, Bill, ParliamentView } from '../../api/types';
import { PoliticianLink } from '../../components/politician-bits';
import { useUiStore } from '../../stores/ui-store';
import { uiSound } from '../audio/use-ui-sound';
import { STAGES, stageIndex, whipLines } from './model';
import { WhipMark } from './whip-lines';

/** The bill's journey as a punched card: one cell per stage, the current one punched red. */
export function StageTrack({ stage, compact = false }: { stage: string; compact?: boolean }) {
  const current = stageIndex(stage);
  return (
    <ol
      aria-label={`Stage: ${stage}, ${current + 1} of ${STAGES.length}`}
      className="grid grid-cols-7 gap-[3px]"
    >
      {STAGES.map((s, i) => (
        <li
          key={s.key}
          aria-current={i === current ? 'step' : undefined}
          className="grid min-w-0 gap-1"
        >
          <span
            aria-hidden="true"
            className={cn(
              'relative flex h-3.5 items-center justify-center',
              i < current ? 'bg-ink' : i === current ? 'bg-whip' : 'bg-ink/12',
            )}
          >
            {/* The punch hole. */}
            {i <= current && <span className="size-1.5 bg-paper-bright" />}
          </span>
          {!compact && (
            <span
              className={cn(
                'truncate text-[9.5px] leading-none font-bold tracking-[0.04em] uppercase',
                i === current ? 'text-whip-dark' : i < current ? 'text-ink/75' : 'text-ink/45',
                i !== current && 'max-sm:sr-only',
              )}
            >
              {s.label}
            </span>
          )}
          {compact && <span className="sr-only">{s.label}</span>}
        </li>
      ))}
    </ol>
  );
}

function StanceChip({ label, stance }: { label: string; stance: number }) {
  const marks = stance === 0 ? '±' : (stance > 0 ? '+' : '−').repeat(Math.min(3, Math.abs(stance)));
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 px-1.5 text-[11.5px] font-bold',
        stance > 0 && 'bg-ink text-paper-bright',
        stance < 0 && 'bg-whip-dark text-white',
        stance === 0 && 'text-ink outline-1 -outline-offset-1 outline-ink/50',
      )}
    >
      {label}
      <span aria-hidden="true" className="font-display text-[14px] leading-none font-black">
        {marks}
      </span>
      <span className="sr-only">
        {stance > 0 ? `advances it (${stance})` : stance < 0 ? `cuts it (${stance})` : 'neutral'}
      </span>
    </span>
  );
}

function PlanButton({
  item,
  label,
  onPlan,
}: {
  item: ActionCatalogueItem | undefined;
  label: string;
  onPlan: () => void;
}) {
  const disabled = !!item && !item.eligible;
  return (
    <button
      type="button"
      onClick={onPlan}
      disabled={disabled}
      title={disabled ? item.reasons.join(' ') : undefined}
      className="flex h-9 cursor-pointer items-center gap-2 px-2.5 text-[12px] font-black tracking-[0.04em] text-ink uppercase outline-2 -outline-offset-2 outline-ink hover:bg-ink hover:text-paper-bright focus-visible:outline-whip disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent disabled:hover:text-ink"
    >
      {label}
      {item && (
        <span className="flex gap-1">
          <CostChip kind="slots" value={item.slots} />
          {item.capitalCost > 0 && <CostChip kind="capital" value={item.capitalCost} />}
        </span>
      )}
    </button>
  );
}

function BillItem({
  bill,
  number,
  open,
  onToggle,
  buttonRef,
  tabIndex,
  onFocus,
  campaignId,
  partyColour,
  playerPartyId,
  catalogue,
  division,
}: {
  bill: Bill;
  number: number;
  open: boolean;
  onToggle: () => void;
  buttonRef: (el: HTMLButtonElement | null) => void;
  tabIndex: number;
  onFocus: () => void;
  campaignId: string;
  partyColour: (id: string) => string | undefined;
  playerPartyId: string | null;
  catalogue: ActionCatalogueItem[];
  division: ParliamentView['upcomingDivisions'][number] | undefined;
}) {
  const openPlanner = useUiStore((s) => s.openPlanner);
  const assented = /royal|assent/i.test(bill.stage);
  const mine = bill.whipping.find((w) => w.partyId === playerPartyId);
  const heaviest = Math.max(0, ...bill.whipping.map((w) => whipLines(w.instruction)));
  const panelId = `bill-${bill.id}`;
  const item = (k: string) => catalogue.find((c) => c.kind === k);

  return (
    <li className="border-t-2 border-ink first:border-t-0">
      <h3>
        <button
          ref={buttonRef}
          type="button"
          tabIndex={tabIndex}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          onFocus={onFocus}
          className="group grid w-full cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-x-3 py-3 text-left outline-none hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-whip"
        >
          <span className="pt-0.5 text-right font-display text-[1.3rem] leading-none font-black text-ink/45 tabular-nums [font-stretch:70%]">
            {number}.
          </span>
          <span className="grid min-w-0 gap-2">
            <span className="font-display text-[1.3rem] leading-[0.95] font-black uppercase [font-stretch:70%]">
              {bill.title}
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-semibold text-ink/75">
              <span>{bill.stage}</span>
              {division && (
                <span className="font-bold text-whip-dark">Division due · {division.stage}</span>
              )}
              {mine && !assented && <WhipMark whip={mine} />}
            </span>
          </span>
          <span className="flex items-center gap-2 pt-0.5">
            {assented ? (
              <Stamp tone="good" size="sm" angle={-4}>
                Royal Assent
              </Stamp>
            ) : (
              heaviest === 3 && (
                <span className="text-[10px] font-black tracking-[0.08em] text-whip-dark uppercase max-sm:hidden">
                  Three-line
                </span>
              )
            )}
            <ChevronDown
              aria-hidden="true"
              className={cn('size-4 transition-transform', open && 'rotate-180')}
            />
          </span>
        </button>
      </h3>
      <div className="pb-3 pl-[2.75rem] max-sm:pl-0">
        <StageTrack stage={bill.stage} compact={!open} />
      </div>
      {open && (
        <div
          id={panelId}
          className="grid gap-4 pb-5 pl-[2.75rem] max-sm:pl-0 motion-safe:animate-deal"
        >
          <p className="max-w-[68ch] text-[13.5px] leading-relaxed text-ink/85">{bill.summary}</p>
          <div className="flex items-center gap-2.5">
            <Portrait seed={bill.sponsorId} size="sm" />
            <span className="grid gap-0.5 text-[12px]">
              <span className="text-[10px] font-bold tracking-[0.08em] text-ink/60 uppercase">
                In the name of
              </span>
              <PoliticianLink campaignId={campaignId} id={bill.sponsorId} name={bill.sponsorName} />
            </span>
          </div>
          {bill.issues.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-[10px] font-bold tracking-[0.08em] text-ink/60 uppercase">
                What it does
              </p>
              <ul aria-label="What the bill does" className="flex flex-wrap gap-1.5">
                {bill.issues.map((iss) => (
                  <li key={iss.issueKey}>
                    <StanceChip label={iss.label} stance={iss.stance} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bill.whipping.length > 0 && (
            <div className="grid gap-1.5">
              <p className="text-[10px] font-bold tracking-[0.08em] text-ink/60 uppercase">
                The whips · lines underlined
              </p>
              <ul aria-label="Party whips" className="flex flex-wrap gap-x-5 gap-y-2.5">
                {bill.whipping.map((w) => (
                  <li key={w.partyId}>
                    <WhipMark whip={w} colour={partyColour(w.partyId)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!assented && (
            <div className="flex flex-wrap gap-2">
              <PlanButton
                item={item('support_legislation')}
                label="Speak in support"
                onPlan={() =>
                  openPlanner({ kind: 'support_legislation', params: { billId: bill.id } })
                }
              />
              <PlanButton
                item={item('oppose_legislation')}
                label="Speak against"
                onPlan={() =>
                  openPlanner({ kind: 'oppose_legislation', params: { billId: bill.id } })
                }
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * ORDER PAPER: the bills before the House as the day's printed business. Arrow keys move
 * between items; Enter opens one (sponsor, what it does, how each party is whipping it).
 */
export function OrderPaper({
  parliament,
  campaignId,
  playerPartyId,
  catalogue,
  today,
}: {
  parliament: ParliamentView;
  campaignId: string;
  playerPartyId: string | null;
  catalogue: ActionCatalogueItem[];
  today: string;
}) {
  const bills = parliament.bills;
  const upcoming = parliament.upcomingDivisions;
  const firstLive = Math.max(
    0,
    bills.findIndex((b) => upcoming.some((d) => d.billId === b.id)),
  );
  const [openId, setOpenId] = useState<string | null>(bills[firstLive]?.id ?? null);
  const [cursor, setCursor] = useState(firstLive);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const colour = (id: string) => parliament.composition.find((c) => c.partyId === id)?.colour;

  const onKey = (e: KeyboardEvent<HTMLOListElement>) => {
    if (!(e.target instanceof HTMLButtonElement) || !refs.current.includes(e.target)) return;
    const delta = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const jump = e.key === 'Home' ? 0 : e.key === 'End' ? bills.length - 1 : null;
    if (!delta && jump === null) return;
    e.preventDefault();
    const next = jump ?? Math.min(bills.length - 1, Math.max(0, cursor + delta));
    setCursor(next);
    refs.current[next]?.focus();
    uiSound.click();
  };

  return (
    <PaperSheet tone="bright" tilt="right" className="px-4 pt-4 pb-2 md:px-6">
      <header className="text-center">
        <div aria-hidden="true" className="h-[4px] bg-ink" />
        <p className="mt-2 text-[10px] font-bold tracking-[0.22em] uppercase opacity-70">
          House of Commons · Session {parliament.session.number}
        </p>
        <h2
          id="order-paper-title"
          className="mt-1 font-display text-[clamp(1.6rem,3vw,2.2rem)] leading-none font-black tracking-[0.08em] uppercase [font-stretch:115%]"
        >
          Order Paper
        </h2>
        <p className="mt-1.5 mb-2 text-[11px] italic opacity-75">
          Business of the House, as printed. Amendments not yet read by anyone.
        </p>
        <div aria-hidden="true" className="h-px bg-ink" />
        <div aria-hidden="true" className="mt-[2px] h-[2px] bg-ink" />
      </header>
      {bills.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-ink/75">
          No business before the House. Members are advised to look busy.
        </p>
      ) : (
        <ol aria-labelledby="order-paper-title" onKeyDown={onKey} className="mt-1">
          {bills.map((b, i) => (
            <BillItem
              key={b.id}
              bill={b}
              number={i + 1}
              open={openId === b.id}
              onToggle={() => setOpenId((o) => (o === b.id ? null : b.id))}
              buttonRef={(el) => {
                refs.current[i] = el;
              }}
              tabIndex={i === cursor ? 0 : -1}
              onFocus={() => setCursor(i)}
              campaignId={campaignId}
              partyColour={colour}
              playerPartyId={playerPartyId}
              catalogue={catalogue}
              division={upcoming.find((d) => d.billId === b.id && d.scheduledFor >= today)}
            />
          ))}
        </ol>
      )}
    </PaperSheet>
  );
}
