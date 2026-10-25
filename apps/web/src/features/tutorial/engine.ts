/**
 * The induction engine: pure functions over the step registry (steps.ts), so progression is
 * testable without a DOM. The React layer feeds it facts and persists what it reports.
 */
import type { TutorialState } from '@whip/contracts';
import { STEPS, type TutorialFacts, type TutorialStep, type TutorialStepId } from './steps';

/** The induction is over (graduated). Nothing shows again unless it is restarted. */
export const isFinished = (state: Pick<TutorialState, 'completed'>) =>
  state.completed.includes('graduation');

/** The induction should run at all: enabled, not skipped, not finished. */
export const isRunning = (state: TutorialState | undefined): state is TutorialState =>
  !!state && state.enabled && !state.dismissed && !isFinished(state);

/**
 * Steps that could be active now: not complete, prerequisites complete, data precondition met.
 * Completion is checked for all of them, so doing something early still counts.
 */
export function eligibleSteps(
  completed: ReadonlySet<string>,
  facts: TutorialFacts,
  steps: readonly TutorialStep[] = STEPS,
): TutorialStep[] {
  return steps.filter(
    (s) =>
      !completed.has(s.id) &&
      s.requires.every((r) => completed.has(r)) &&
      (s.available?.(facts) ?? true),
  );
}

export const showsNow = (step: TutorialStep, facts: TutorialFacts) =>
  step.shows ? step.shows(facts) : facts.modal === null;

/**
 * The one step to show. Among eligible steps that can be shown here, prefer the first whose
 * on-screen target is present (a real element, not just a place tab pointing elsewhere), then
 * the first in order. `present` is the set of `data-tutorial` ids visible on screen.
 */
export function selectActive(
  completed: ReadonlySet<string>,
  facts: TutorialFacts,
  present: ReadonlySet<string> = new Set(),
  steps: readonly TutorialStep[] = STEPS,
): TutorialStep | null {
  const showable = eligibleSteps(completed, facts, steps).filter((s) => showsNow(s, facts));
  const here = showable.find((s) =>
    s.targets.some((t) => !t.startsWith('place-') && present.has(t)),
  );
  return here ?? showable[0] ?? null;
}

/** 1-based position of a step in the registry ("INDUCTION 4/14"). */
export const stepNumber = (id: TutorialStepId, steps: readonly TutorialStep[] = STEPS) =>
  steps.findIndex((s) => s.id === id) + 1;

/**
 * The facts a step is judged against later. The place the player is standing in counts as an
 * arrival, so "go and look" steps need no second trip.
 */
export function captureBaseline(f: TutorialFacts): TutorialFacts {
  const visits = { ...f.visits };
  const here = f.dossierOpen ? 'dossier' : f.place;
  visits[here] = (visits[here] ?? 1) - 1;
  return { ...f, visits, planned: [...f.planned] };
}

/** Fill in baseline data that was still loading when it was captured (the Chamber forecast). */
export function refreshBaseline(baseline: TutorialFacts, f: TutorialFacts): TutorialFacts {
  if (baseline.forecastUnknown === null && f.forecastUnknown !== null)
    return { ...baseline, forecastUnknown: f.forecastUnknown };
  return baseline;
}

/**
 * Which eligible `do` steps the facts now complete. `ack` and `tour` steps complete only from
 * the card (see the layer); their detectors are absent.
 */
export function detectCompletions(
  eligible: readonly TutorialStep[],
  facts: TutorialFacts,
  baselines: Readonly<Partial<Record<TutorialStepId, TutorialFacts>>>,
  acked: Readonly<Partial<Record<TutorialStepId, boolean>>> = {},
): TutorialStepId[] {
  return eligible
    .filter((s) => {
      const baseline = baselines[s.id];
      return !!(s.complete && baseline && s.complete(facts, { baseline, acked: !!acked[s.id] }));
    })
    .map((s) => s.id);
}
