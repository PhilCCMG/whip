import type { TutorialState, TutorialUpdate } from '@whip/contracts';

/**
 * Tutorial progress (docs/architecture/11-tutorial.md §Persistence): UI metadata kept in the
 * Campaign DO's `meta` table, outside the simulation, so it never bumps the campaign revision.
 */

/** Max completed step ids stored per campaign (TutorialStateSchema). */
export const MAX_TUTORIAL_STEPS = 100;

/** State of a campaign with nothing stored (created before the tutorial existed): disabled. */
export const DEFAULT_TUTORIAL_STATE: TutorialState = {
  enabled: false,
  completed: [],
  dismissed: false,
  updatedAt: null,
};

/** Initial state written when a campaign is created (`CreateCampaignRequest.tutorial`, default true). */
export function initialTutorialState(enabled: boolean, now: string): TutorialState {
  return { enabled, completed: [], dismissed: false, updatedAt: now };
}

/**
 * Applies a PUT body. `reset` first (clears progress + dismissed, enables), then last-write-wins
 * `enabled` / `dismissed`, then `completeSteps` as a set union that keeps first-completion order.
 * Once `MAX_TUTORIAL_STEPS` are stored, further new ids are ignored (keeps the union idempotent).
 */
export function mergeTutorial(
  prev: TutorialState,
  update: TutorialUpdate,
  now: string,
): TutorialState {
  let { enabled, dismissed } = prev;
  let completed = [...prev.completed];
  if (update.reset === true) {
    completed = [];
    dismissed = false;
    enabled = true;
  }
  if (update.enabled !== undefined) enabled = update.enabled;
  if (update.dismissed !== undefined) dismissed = update.dismissed;
  const seen = new Set(completed);
  for (const step of update.completeSteps ?? []) {
    if (completed.length >= MAX_TUTORIAL_STEPS) break;
    if (seen.has(step)) continue;
    seen.add(step);
    completed.push(step);
  }
  return { enabled, completed, dismissed, updatedAt: now };
}

/** Parses a stored `meta.tutorial` value; anything unreadable falls back to the default. */
export function parseStoredTutorial(json: string | null): TutorialState | null {
  if (json === null) return null;
  try {
    const v = JSON.parse(json) as Partial<TutorialState>;
    return {
      enabled: v.enabled === true,
      completed: Array.isArray(v.completed)
        ? v.completed.filter((s): s is string => typeof s === 'string').slice(0, MAX_TUTORIAL_STEPS)
        : [],
      dismissed: v.dismissed === true,
      updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
    };
  } catch {
    return null;
  }
}
