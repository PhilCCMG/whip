import {
  Button,
  cn,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WhipIcon,
  WhipWordmark,
} from '@whip/ui';
import { Flag, Inbox, Landmark, Newspaper, ScrollText, Users } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router';
import { useAdvance, useCampaignState, useTurnReport } from '../api/hooks';
import { isMockMode } from '../api/runtime';
import type { CareerOverview } from '../api/types';
import { ActionPlanner } from '../components/action-planner';
import { ContextPanelContent } from '../components/context-panel';
import { ErrorState, Loading } from '../components/states';
import { TurnReportDialog } from '../components/turn-report';
import { formatShortDate, formatSimDate, plural, signed } from '../lib/format';
import { campaignPath, useCampaignId } from '../lib/params';
import { useUiStore } from '../stores/ui-store';

const NAV = [
  { to: '', label: 'Career', icon: Newspaper, end: true },
  { to: 'parliament', label: 'Parliament', icon: Landmark, end: false },
  { to: 'politicians', label: 'Politicians', icon: Users, end: false },
  { to: 'party', label: 'Party', icon: Flag, end: false },
  { to: 'history', label: 'History', icon: ScrollText, end: false },
] as const;

function NavRail({ campaignId }: { campaignId: string }) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-[76px] shrink-0 flex-col border-r border-white/10 bg-ink lg:flex"
    >
      <Link
        to="/"
        className="flex h-14 items-center justify-center border-b-[3px] border-whip focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        aria-label="WHIP: all careers"
      >
        <WhipIcon className="size-9" />
      </Link>
      <ul className="flex flex-col gap-1 py-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={label}>
            <NavLink
              to={campaignPath(campaignId, to)}
              end={end}
              className={({ isActive }) =>
                cn(
                  'relative mx-2 flex flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-paper/60',
                  'hover:bg-white/5 hover:text-paper focus-visible:outline-2 focus-visible:outline-ring',
                  isActive &&
                    'bg-white/[0.07] text-paper before:absolute before:inset-y-1 before:-left-2 before:w-[3px] before:bg-whip',
                )
              }
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function BottomTabs({ campaignId }: { campaignId: string }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-ink pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <li key={label}>
            <NavLink
              to={campaignPath(campaignId, to)}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 border-t-[3px] border-transparent pt-1.5 pb-2 text-[10px] font-semibold text-paper/60',
                  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
                  isActive && 'border-whip text-paper',
                )
              }
            >
              <Icon aria-hidden="true" className="size-5" strokeWidth={1.75} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function EndWeekButton({ overview, className }: { overview: CareerOverview; className?: string }) {
  const advance = useAdvance(overview.campaign.id);
  const free = overview.diary.slotsTotal - overview.diary.slotsUsed;
  const pending = overview.pendingEvents.length;
  const hint = [
    free > 0 ? `${plural(free, 'diary slot')} unused` : null,
    pending > 0 ? `${plural(pending, 'event')} unanswered` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="whip"
          className={cn(
            'h-10 px-4 font-display text-base font-extrabold font-stretch-condensed',
            className,
          )}
          disabled={advance.isPending}
          onClick={() => advance.mutate()}
          aria-describedby={hint ? 'end-week-hint' : undefined}
        >
          {advance.isPending ? 'Resolving the week…' : 'End week'}
        </Button>
      </TooltipTrigger>
      <TooltipContent id="end-week-hint">
        {hint || 'Resolve this week: your actions, NPC moves and any divisions.'}
      </TooltipContent>
    </Tooltip>
  );
}

function TopBar({ overview }: { overview: CareerOverview | undefined }) {
  const setSheet = useUiStore((s) => s.setContextSheetOpen);
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-ink text-paper">
      <div className="flex h-14 items-center gap-3 px-4 lg:px-5">
        <Link to="/" className="shrink-0 text-paper lg:hidden" aria-label="WHIP: all careers">
          <WhipWordmark className="h-5 w-auto" />
        </Link>
        <div className="min-w-0 flex-1">
          {overview ? (
            <>
              <p className="truncate text-[11px] font-semibold text-paper/55">
                {overview.campaign.name}
                {isMockMode && ' · demo data'}
              </p>
              <p className="truncate font-display text-[17px] leading-tight font-extrabold font-stretch-condensed">
                Week {overview.campaign.turn}
                <span className="mx-1.5 text-whip">/</span>
                <span className="font-semibold max-sm:hidden">
                  {formatSimDate(overview.campaign.simDate)}
                </span>
                <span className="font-semibold sm:hidden">
                  {formatShortDate(overview.campaign.simDate)}
                </span>
              </p>
            </>
          ) : (
            <p className="text-sm text-paper/60">Loading career…</p>
          )}
        </div>
        {overview && (
          <>
            <div
              className="hidden items-baseline gap-1.5 border-l border-white/15 pl-3 sm:flex"
              aria-label={`Political capital ${overview.standing.politicalCapital}, ${signed(overview.standing.capitalIncome)} per week`}
            >
              <span className="font-display text-2xl leading-none font-black font-stretch-condensed tabular">
                {overview.standing.politicalCapital}
              </span>
              <span className="text-[11px] leading-tight text-paper/60">
                capital
                <br />
                {signed(overview.standing.capitalIncome)}/wk
              </span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-paper lg:hidden"
              onClick={() => setSheet(true)}
              aria-label={`Inbox and intelligence, ${overview.notifications.length} notifications`}
            >
              <Inbox aria-hidden="true" />
              {overview.notifications.length > 0 && (
                <span className="absolute top-1 right-1 size-2 bg-whip" aria-hidden="true" />
              )}
            </Button>
            <EndWeekButton overview={overview} />
          </>
        )}
      </div>
    </header>
  );
}

export function Component() {
  const campaignId = useCampaignId();
  const state = useCampaignState(campaignId);
  const report = useTurnReport(campaignId);
  const reportOpen = useUiStore((s) => s.turnReportOpen);
  const setReportOpen = useUiStore((s) => s.setTurnReportOpen);
  const sheetOpen = useUiStore((s) => s.contextSheetOpen);
  const setSheet = useUiStore((s) => s.setContextSheetOpen);
  const overview = state.data;

  return (
    <div className="flex min-h-dvh bg-ink">
      <NavRail campaignId={campaignId} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar overview={overview} />
        <div className="flex min-h-0 flex-1">
          <main
            id="main"
            className="min-w-0 flex-1 bg-paper-deep pb-20 text-ink lg:pb-0"
            aria-busy={state.isPending}
          >
            {state.isError ? (
              <div className="p-6">
                <ErrorState error={state.error} onRetry={() => void state.refetch()} />
              </div>
            ) : state.isPending ? (
              <Loading label="Opening your career" />
            ) : (
              <Outlet />
            )}
          </main>
          {overview && (
            <aside
              aria-label="Inbox and intelligence"
              className="dark sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-[300px] shrink-0 border-l border-white/10 bg-moss-900 text-paper lg:block xl:w-[340px]"
            >
              <ScrollArea className="h-full">
                <ContextPanelContent overview={overview} />
              </ScrollArea>
            </aside>
          )}
        </div>
      </div>
      <BottomTabs campaignId={campaignId} />

      {overview && (
        <Sheet open={sheetOpen} onOpenChange={setSheet}>
          <SheetContent side="right" className="dark bg-moss-900 text-paper">
            <div className="border-b border-white/10 px-4 py-4 pr-12">
              <SheetTitle className="font-display text-2xl leading-none font-black font-stretch-condensed">
                Inbox &amp; intelligence
              </SheetTitle>
              <SheetDescription className="mt-1 text-xs text-paper/60">
                What you’ve heard this week, and what’s coming.
              </SheetDescription>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ContextPanelContent overview={overview} />
            </div>
          </SheetContent>
        </Sheet>
      )}
      <ActionPlanner campaignId={campaignId} />
      <TurnReportDialog
        report={report.data}
        campaignId={campaignId}
        open={reportOpen}
        onOpenChange={setReportOpen}
      />
    </div>
  );
}
