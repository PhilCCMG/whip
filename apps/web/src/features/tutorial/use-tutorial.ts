import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router';
import {
  useCampaignState,
  useParliament,
  useTurnReport,
  useTutorialState,
  useUpdateTutorial,
} from '../../api/hooks';
import { placeFor } from '../../game-ui/places';
import { campaignPath } from '../../lib/params';
import { useUiStore } from '../../stores/ui-store';
import {
  captureBaseline,
  detectCompletions,
  eligibleSteps,
  isFinished,
  isRunning,
  refreshBaseline,
} from './engine';
import { STEP_IDS, type TutorialFacts, type TutorialStepId } from './steps';
import { useTutorialSession } from './store';

export const STAMP_MS = 3200;

/**
 * Drives the Members' induction for the campaign shell: gathers facts from real state (the
 * overview DTO, the route, the planner and turn report, the Chamber forecast), records each
 * eligible step's baseline, and persists completions as soon as they are detected.
 */
export function useTutorial(
  campaignId: string,
  { paused, transitioning }: { paused: boolean; transitioning: boolean },
) {
  const tutorial = useTutorialState(campaignId);
  const update = useUpdateTutorial(campaignId);
  const state = tutorial.data;
  const running = isRunning(state);
  const overview = useCampaignState(campaignId).data;
  const report = useTurnReport(campaignId).data;
  const plannerOpen = useUiStore((s) => s.plannerOpen);
  const reportFlag = useUiStore((s) => s.turnReportOpen);
  const { pathname } = useLocation();
  const session = useTutorialSession();
  const { begin, visit, reportClosed, setBaseline, markSent } = session;

  useEffect(() => begin(campaignId), [begin, campaignId]);

  const base = campaignPath(campaignId);
  const sub = pathname.startsWith(base) ? pathname.slice(base.length).replace(/^\//, '') : '';
  const place = placeFor(sub).key;
  const dossier = sub.startsWith('politicians/') ? sub : null;

  // Arrivals: each place change counts, as does each dossier opened.
  useEffect(() => visit(place), [place, visit]);
  useEffect(() => {
    if (dossier) visit('dossier');
  }, [dossier, visit]);

  // Continuing a turn report (it closes) is the "read the paper" signal.
  const reportVisible = reportFlag && !!report && !transitioning;
  const wasVisible = useRef(false);
  const reportHadDivision = (report?.divisions.length ?? 0) > 0;
  useEffect(() => {
    if (wasVisible.current && !reportVisible) reportClosed(reportHadDivision);
    wasVisible.current = reportVisible;
  }, [reportVisible, reportHadDivision, reportClosed]);

  const completed = useMemo(() => new Set(state?.completed ?? []), [state?.completed]);

  const modal: TutorialFacts['modal'] =
    paused || transitioning ? 'other' : reportVisible ? 'report' : plannerOpen ? 'planner' : null;

  const draft: TutorialFacts | null = useMemo(
    () =>
      overview
        ? {
            turn: overview.campaign.turn,
            place,
            dossierOpen: !!dossier,
            modal,
            planned: overview.diary.planned.map((p) => ({
              id: p.id,
              kind: p.kind,
              targetId: typeof p.params.targetId === 'string' ? p.params.targetId : undefined,
            })),
            pendingEvents: overview.pendingEvents.length,
            forecastUnknown: null,
            reportDivisions: reportVisible ? (report?.divisions.length ?? 0) : 0,
            visits: session.visits,
            reportsClosed: session.reportsClosed,
            divisionReportsClosed: session.divisionReportsClosed,
          }
        : null,
    [
      overview,
      place,
      dossier,
      modal,
      reportVisible,
      report,
      session.visits,
      session.reportsClosed,
      session.divisionReportsClosed,
    ],
  );

  const needsParliament =
    running && !!draft && eligibleSteps(completed, draft).some((s) => s.needsParliament);
  const parliament = useParliament(campaignId, needsParliament);
  const forecastUnknown = parliament.data?.upcomingDivisions[0]?.forecast.unknown ?? null;

  const facts = useMemo(
    () => (draft ? { ...draft, forecastUnknown: needsParliament ? forecastUnknown : null } : null),
    [draft, forecastUnknown, needsParliament],
  );

  const eligible = useMemo(
    () => (running && facts ? eligibleSteps(completed, facts) : []),
    [running, facts, completed],
  );

  // Baselines: captured when a step first becomes eligible, topped up as data arrives.
  useEffect(() => {
    if (!facts) return;
    const { baselines } = useTutorialSession.getState();
    for (const s of eligible) {
      const b = baselines[s.id];
      if (!b) setBaseline(s.id, captureBaseline(facts));
      else {
        const next = refreshBaseline(b, facts);
        if (next !== b) setBaseline(s.id, next);
      }
    }
  }, [eligible, facts, setBaseline]);

  // Completions: detected from real state, persisted at once (optimistic, retried).
  const { mutate } = update;
  useEffect(() => {
    if (!facts || eligible.length === 0) return;
    const { baselines, acked, sent } = useTutorialSession.getState();
    const done = detectCompletions(eligible, facts, baselines, acked).filter((id) => !sent[id]);
    if (done.length === 0) return;
    markSent(done);
    mutate({ completeSteps: done });
  }, [eligible, facts, session.baselines, session.acked, markSent, mutate]);

  const complete = (ids: TutorialStepId[]) => {
    markSent(ids);
    mutate({ completeSteps: ids });
  };

  return {
    /** The API answered (a 404 counts as "no induction yet"); the menu can offer it. */
    available: tutorial.isSuccess,
    state,
    running,
    finished: !!state && isFinished(state),
    facts,
    completed,
    complete,
    /** "Got it" on an `ack` step completes it; graduation completes the lot and stamps. */
    acknowledge: (id: TutorialStepId) => {
      if (id === 'graduation') {
        complete([...STEP_IDS]);
        useTutorialSession.getState().showStamp(STAMP_MS);
      } else complete([id]);
    },
    skip: () => mutate({ dismissed: true }),
    resume: () => {
      useTutorialSession.setState({ collapsed: {}, confirmingSkip: false });
      mutate({ enabled: true, dismissed: false });
    },
    restart: () => {
      useTutorialSession.getState().resetProgress();
      mutate({ reset: true });
    },
  };
}

export type TutorialController = ReturnType<typeof useTutorial>;
