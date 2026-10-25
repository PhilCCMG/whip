import { create } from 'zustand';
import type { PlaceKey, TutorialFacts, TutorialStepId } from './steps';

/**
 * Session-only induction state: UI event counters the detectors read, each step's baseline, and
 * card presentation (collapsed, tour position, skip confirm). Persistent progress lives on the
 * server (useTutorialState); this store is reset per campaign and on restart.
 */
interface TutorialSession {
  campaignId: string | null;
  visits: Partial<Record<PlaceKey | 'dossier', number>>;
  reportsClosed: number;
  divisionReportsClosed: number;
  baselines: Partial<Record<TutorialStepId, TutorialFacts>>;
  acked: Partial<Record<TutorialStepId, boolean>>;
  /** Cards put away with "Got it" / Esc (the step stays active, as a chip). */
  collapsed: Partial<Record<TutorialStepId, boolean>>;
  /** Completions already sent this session (the PUT is idempotent, this just avoids spam). */
  sent: Partial<Record<TutorialStepId, boolean>>;
  tourIndex: number;
  confirmingSkip: boolean;
  /** Graduation stamp on screen until this time (ms epoch). */
  stampUntil: number | null;

  begin: (campaignId: string) => void;
  resetProgress: () => void;
  visit: (where: PlaceKey | 'dossier') => void;
  reportClosed: (hadDivision: boolean) => void;
  setBaseline: (id: TutorialStepId, facts: TutorialFacts) => void;
  ack: (id: TutorialStepId) => void;
  setCollapsed: (id: TutorialStepId, collapsed: boolean) => void;
  markSent: (ids: TutorialStepId[]) => void;
  setTourIndex: (i: number) => void;
  setConfirmingSkip: (v: boolean) => void;
  showStamp: (ms: number) => void;
}

const fresh = {
  baselines: {},
  acked: {},
  collapsed: {},
  sent: {},
  tourIndex: 0,
  confirmingSkip: false,
};

export const useTutorialSession = create<TutorialSession>()((set, get) => ({
  campaignId: null,
  visits: {},
  reportsClosed: 0,
  divisionReportsClosed: 0,
  stampUntil: null,
  ...fresh,

  begin: (campaignId) => {
    if (get().campaignId === campaignId) return;
    set({
      campaignId,
      visits: {},
      reportsClosed: 0,
      divisionReportsClosed: 0,
      stampUntil: null,
      ...fresh,
    });
  },
  resetProgress: () => set({ ...fresh, stampUntil: null }),
  visit: (where) => set((s) => ({ visits: { ...s.visits, [where]: (s.visits[where] ?? 0) + 1 } })),
  reportClosed: (hadDivision) =>
    set((s) => ({
      reportsClosed: s.reportsClosed + 1,
      divisionReportsClosed: s.divisionReportsClosed + (hadDivision ? 1 : 0),
    })),
  setBaseline: (id, facts) => set((s) => ({ baselines: { ...s.baselines, [id]: facts } })),
  ack: (id) => set((s) => ({ acked: { ...s.acked, [id]: true } })),
  setCollapsed: (id, collapsed) =>
    set((s) => ({ collapsed: { ...s.collapsed, [id]: collapsed }, confirmingSkip: false })),
  markSent: (ids) =>
    set((s) => ({ sent: { ...s.sent, ...Object.fromEntries(ids.map((i) => [i, true])) } })),
  setTourIndex: (tourIndex) => set({ tourIndex }),
  setConfirmingSkip: (confirmingSkip) => set({ confirmingSkip }),
  showStamp: (ms) => set({ stampUntil: Date.now() + ms }),
}));

/**
 * Esc goes to the induction card before the pause menu. The layer registers a handler while a
 * card is open; the shell's key handler calls this first and stops if it returns true.
 */
let escapeHandler: (() => boolean) | null = null;
export function setTutorialEscape(fn: (() => boolean) | null) {
  escapeHandler = fn;
}
export function consumeTutorialEscape(): boolean {
  return escapeHandler?.() ?? false;
}
