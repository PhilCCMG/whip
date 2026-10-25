import type { TutorialState, TutorialUpdate } from '@whip/contracts';

/** Stored step ids are capped server-side (docs/architecture/11-tutorial.md). */
export const MAX_TUTORIAL_STEPS = 100;

/** The state a campaign has before anything is stored. */
export const DEFAULT_TUTORIAL: TutorialState = {
  enabled: false,
  completed: [],
  dismissed: false,
  updatedAt: null,
};

/**
 * The PUT merge (11-tutorial.md "Persistence"): `reset` first (clear progress, re-enable), then
 * `completed` as a set union and last write wins for `enabled` / `dismissed`. Pure, so the mock
 * backend and the client's optimistic update agree with the server.
 */
export function mergeTutorial(
  state: TutorialState,
  update: TutorialUpdate,
  now: string | null = new Date().toISOString(),
): TutorialState {
  let next: TutorialState = { ...state, completed: [...state.completed] };
  if (update.reset) next = { ...next, completed: [], dismissed: false, enabled: true };
  if (update.enabled !== undefined) next.enabled = update.enabled;
  if (update.dismissed !== undefined) next.dismissed = update.dismissed;
  if (update.completeSteps?.length) {
    const seen = new Set(next.completed);
    for (const id of update.completeSteps) {
      if (seen.size >= MAX_TUTORIAL_STEPS) break;
      if (!seen.has(id)) {
        seen.add(id);
        next.completed.push(id);
      }
    }
  }
  return { ...next, updatedAt: now };
}
