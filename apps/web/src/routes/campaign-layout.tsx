import { Keycap } from '@whip/ui';
import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useMatches, useNavigate } from 'react-router';
import { useCampaignState, useTurnReport } from '../api/hooks';
import type { CareerOverview } from '../api/types';
import { ActionPlanner } from '../components/action-planner';
import { ErrorState, Loading } from '../components/states';
import { TurnReportDialog } from '../components/turn-report';
import { uiSound, useClickSounds, useUiSoundPreload } from '../features/audio/use-ui-sound';
import { UI as INDUCTION_COPY } from '../features/tutorial/copy';
import { consumeTutorialEscape } from '../features/tutorial/store';
import { TutorialLayer } from '../features/tutorial/tutorial-layer';
import { useTutorial } from '../features/tutorial/use-tutorial';
import { EndWeekButton, EndWeekConfirm, WeekTransition } from '../game-ui/end-week';
import { useEndWeek } from '../game-ui/use-end-week';
import { GameScreenHeader } from '../game-ui/game-screen';
import { HudBar, PlaceTabs } from '../game-ui/hud';
import { END_WEEK_KEY, isEditable, modalOpen } from '../game-ui/keys';
import { PauseMenu } from '../game-ui/pause-menu';
import { PLACES, placeFor } from '../game-ui/places';
import { formatSimDate, weekdayName, formatShortDate } from '../lib/format';
import { campaignPath, useCampaignId } from '../lib/params';
import { useSettingsStore } from '../stores/settings-store';
import { useUiStore } from '../stores/ui-store';

/** Route modules that draw their own game screen (header band and desk) export this handle. */
export interface GameRouteHandle {
  gameScreen?: boolean;
}

/** Painting crops for screens still drawn inside the shell's generic frame. */
const CROP: Record<string, string> = {
  chamber: '40% 45%',
  'tea-room': '88% 30%',
  'party-hq': '15% 55%',
  archive: '70% 85%',
};

/** The bottom strip's left side: the next fixture on the order paper, then key prompts. */
function OrderPaper({ overview }: { overview: CareerOverview | undefined }) {
  const next =
    overview?.upcoming.find((u) => u.kind === 'division' || u.kind === 'reading') ??
    overview?.upcoming[0];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-6 px-4 text-[11px] font-bold tracking-[0.06em] uppercase md:px-5">
      {next && (
        <p className="flex min-w-0 items-center gap-2.5">
          <span className="shrink-0 bg-paper-bright px-1.5 py-1 leading-none text-ink">Next</span>
          <span className="shrink-0 text-paper/70 tabular-nums">
            {weekdayName(next.date)} {formatShortDate(next.date)}
          </span>
          <span className="truncate text-paper-bright">{next.label}</span>
        </p>
      )}
      <p
        className="ml-auto flex shrink-0 items-center gap-4 text-paper/75 max-xl:hidden"
        aria-hidden="true"
      >
        <span className="flex items-center gap-1.5">
          <Keycap>1</Keycap>–<Keycap>5</Keycap> Places
        </span>
        <span className="flex items-center gap-1.5">
          <Keycap>M</Keycap> Sound
        </span>
        <span className="flex items-center gap-1.5">
          <Keycap>Esc</Keycap> Menu
        </span>
      </p>
    </div>
  );
}

export function Component() {
  const campaignId = useCampaignId();
  const state = useCampaignState(campaignId);
  const report = useTurnReport(campaignId);
  const reportOpen = useUiStore((s) => s.turnReportOpen);
  const setReportOpen = useUiStore((s) => s.setTurnReportOpen);
  const overview = state.data;
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();

  const [paused, setPaused] = useState(false);
  const endWeek = useEndWeek(campaignId, overview);
  const tutorial = useTutorial(campaignId, { paused, transitioning: !!endWeek.transition });

  const base = campaignPath(campaignId);
  const sub = location.pathname.startsWith(base)
    ? location.pathname.slice(base.length).replace(/^\//, '')
    : '';
  const place = placeFor(sub);
  const ownFrame = matches.some((m) => (m.handle as GameRouteHandle | undefined)?.gameScreen);

  const rootRef = useRef<HTMLDivElement>(null);
  useClickSounds(rootRef);
  useUiSoundPreload();

  // One capture-phase key handler for the shell, so it sees keys before any screen does and
  // can step aside for modals (planner, report, pause) that own their own keys.
  const live = useRef({ paused, endWeek, place });
  useEffect(() => {
    live.current = { paused, endWeek, place };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
      const s = live.current;
      if (s.paused || s.endWeek.transition) return;
      if (e.key === 'Escape') {
        if (s.endWeek.confirming) {
          e.preventDefault();
          e.stopPropagation();
          s.endWeek.cancel();
          uiSound.click();
        } else if (!modalOpen()) {
          e.preventDefault();
          // The induction card takes the first Esc (it puts the card away, not the induction).
          if (consumeTutorialEscape()) {
            uiSound.click();
            return;
          }
          setPaused(true);
          uiSound.click();
        }
        return;
      }
      if (isEditable(e.target)) return;
      const key = e.key.length === 1 ? e.key.toUpperCase() : e.key;
      if (key === END_WEEK_KEY) {
        if (modalOpen() && !s.endWeek.confirming) return;
        e.preventDefault();
        s.endWeek.request();
        return;
      }
      if (modalOpen()) return;
      if (key === 'M') {
        const store = useSettingsStore.getState();
        store.set('sound', !store.sound);
        return;
      }
      const target = PLACES.find((p) => p.hotkey === key);
      if (target) {
        e.preventDefault();
        if (target.key !== s.place.key || sub.includes('/')) {
          uiSound.click();
          void navigate(campaignPath(campaignId, target.path));
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [campaignId, navigate, sub]);

  const badges = overview ? { office: overview.pendingEvents.length } : undefined;
  const turn = overview?.campaign.turn ?? 0;

  const content = state.isError ? (
    <div className="p-6">
      <ErrorState
        error={state.error}
        onRetry={() => void state.refetch()}
        className="bg-paper text-ink"
      />
    </div>
  ) : state.isPending ? (
    <Loading label="Consulting the whips" className="text-paper" />
  ) : ownFrame ? (
    <Outlet />
  ) : (
    <div className="flex min-h-full flex-col">
      <GameScreenHeader title={place.label} kicker={place.blurb} crop={CROP[place.key]} />
      <div className="flex-1 bg-paper-deep text-ink">
        <Outlet />
      </div>
    </div>
  );

  return (
    <div
      ref={rootRef}
      className="relative isolate flex h-dvh flex-col overflow-hidden bg-desk text-paper"
    >
      <div inert={paused || !!endWeek.transition} className="flex min-h-0 flex-1 flex-col">
        <header className="relative z-20 shrink-0">
          <HudBar overview={overview} onMenu={() => setPaused(true)} />
          <PlaceTabs campaignId={campaignId} variant="strip" badges={badges} />
        </header>

        <main
          id="main"
          aria-busy={state.isPending}
          aria-label={place.label}
          className="min-h-0 flex-1 overflow-y-auto scrollbar-thin"
        >
          {content}
        </main>

        <footer className="relative z-20 shrink-0">
          {overview && (
            <div className="flex items-stretch bg-ink md:h-14">
              <div className="flex min-w-0 flex-1 items-center max-md:hidden">
                <OrderPaper overview={overview} />
              </div>
              <EndWeekButton
                turn={turn}
                blockers={endWeek.blockers}
                pending={endWeek.pending}
                onPress={endWeek.request}
                className="h-14 w-full md:-mt-4 md:h-[4.5rem] md:w-[min(24rem,34vw)]"
              />
            </div>
          )}
          <PlaceTabs campaignId={campaignId} variant="bar" badges={badges} />
        </footer>

        {endWeek.confirming && (
          <div className="fixed right-3 bottom-[8rem] z-40 md:right-4 md:bottom-[5.25rem]">
            <EndWeekConfirm
              blockers={endWeek.blockers}
              onCancel={endWeek.cancel}
              onConfirm={endWeek.confirm}
            />
          </div>
        )}
        <TutorialLayer controller={tutorial} />
      </div>

      {endWeek.transition && <WeekTransition turn={endWeek.transition.turn} />}
      {paused && (
        <PauseMenu
          campaignName={overview?.campaign.name}
          weekLabel={
            overview ? `Week ${turn} · ${formatSimDate(overview.campaign.simDate)}` : undefined
          }
          onResume={() => setPaused(false)}
          induction={
            tutorial.available
              ? {
                  sub: !tutorial.state?.enabled
                    ? INDUCTION_COPY.menuStart
                    : tutorial.state.dismissed && !tutorial.finished
                      ? INDUCTION_COPY.menuResume
                      : INDUCTION_COPY.menuRestart,
                  onActivate: () => {
                    if (tutorial.state?.enabled && tutorial.state.dismissed && !tutorial.finished)
                      tutorial.resume();
                    else tutorial.restart();
                    setPaused(false);
                  },
                }
              : undefined
          }
        />
      )}
      <ActionPlanner campaignId={campaignId} />
      <TurnReportDialog
        report={report.data}
        campaignId={campaignId}
        open={reportOpen && !endWeek.transition}
        onOpenChange={setReportOpen}
      />
    </div>
  );
}
