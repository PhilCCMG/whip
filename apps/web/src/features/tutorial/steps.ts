/**
 * The Members' induction as data (docs/architecture/11-tutorial.md, "Steps"). Each step says when
 * it may run (`requires`, `available`), where it can be shown (`shows`), what it points at
 * (`targets`, the first one on screen wins) and how it completes (`complete`), detected from real
 * game state, never from a "Next" button. The engine (engine.ts) is pure over these definitions.
 */
import type { ActionKind } from '@whip/contracts';
import type { Place } from '../../game-ui/places';

export const STEP_IDS = [
  'welcome',
  'hud',
  'diary',
  'first-meeting',
  'dispatch',
  'end-week',
  'the-papers',
  'fog',
  'find-out',
  'relationships',
  'factions',
  'your-vote',
  'division',
  'graduation',
] as const;
export type TutorialStepId = (typeof STEP_IDS)[number];

export type PlaceKey = Place['key'];
/** Where the player's attention is: the desk (null) or one of the in-game modals. */
export type TutorialModal = 'planner' | 'report' | 'other' | null;

/** Everything a detector may look at: a snapshot of real state plus a few UI event counters. */
export interface TutorialFacts {
  turn: number;
  place: PlaceKey;
  /** A politician's dossier (Tea Room profile) is on screen. */
  dossierOpen: boolean;
  modal: TutorialModal;
  /** This week's diary (planned actions, by kind and target). */
  planned: { id: string; kind: ActionKind; targetId?: string | undefined }[];
  pendingEvents: number;
  /** Unknown votes on the next division's whips' board; null until the Chamber data is loaded. */
  forecastUnknown: number | null;
  /** Divisions in the turn report on screen (0 when none is open). */
  reportDivisions: number;
  /** Times the player has arrived at each place (and at a dossier) this session. */
  visits: Partial<Record<PlaceKey | 'dossier', number>>;
  /** Turn reports continued (closed) this session; and those that carried a division. */
  reportsClosed: number;
  divisionReportsClosed: number;
}

export interface DetectContext {
  /** Facts when the step first became eligible (see engine.captureBaseline). */
  baseline: TutorialFacts;
  /** The player pressed "Got it" on this step. */
  acked: boolean;
}

export interface TutorialStep {
  id: TutorialStepId;
  /** `ack`: completes on "Got it". `tour`: coach marks, completes after the last. `do`: real play. */
  kind: 'ack' | 'tour' | 'do';
  /** Steps that must be complete first. */
  requires: TutorialStepId[];
  /** Data precondition. While false the step waits and later steps may go ahead. */
  available?: (f: TutorialFacts) => boolean;
  /** Whether the card can be shown in the current context (default: on the desk, no modal). */
  shows?: (f: TutorialFacts) => boolean;
  /** `data-tutorial` ids, in preference order; the first visible one is the target. */
  targets: string[];
  complete?: (f: TutorialFacts, ctx: DetectContext) => boolean;
  /** Fetch the Chamber data while this step is eligible (find-out reads the forecast). */
  needsParliament?: boolean;
}

const onDesk = (f: TutorialFacts) => f.modal === null;
const deskOrPlanner = (f: TutorialFacts) => f.modal === null || f.modal === 'planner';
const plannedKind = (f: TutorialFacts, kinds: readonly ActionKind[]) =>
  f.planned.some((p) => kinds.includes(p.kind));

const isAt = (f: TutorialFacts, where: PlaceKey | 'dossier') =>
  where === 'dossier' ? f.dossierOpen : f.place === where && !f.dossierOpen;

/**
 * "Go and look": the player has arrived (since the step became eligible) and has either read the
 * card ("Got it") or moved on. Standing there when it became eligible counts as arriving.
 */
const lookedAt =
  (where: PlaceKey | 'dossier') =>
  (f: TutorialFacts, { baseline, acked }: DetectContext) =>
    (f.visits[where] ?? 0) > (baseline.visits[where] ?? 0) && (acked || !isAt(f, where));

const VOTE_KINDS: readonly ActionKind[] = [
  'support_legislation',
  'oppose_legislation',
  'rebel_against_party',
  'make_political_promise',
];
const MEETING_KINDS: readonly ActionKind[] = ['meet_politician', 'build_relationship'];

export const STEPS: readonly TutorialStep[] = [
  { id: 'welcome', kind: 'ack', requires: [], targets: [] },
  {
    id: 'hud',
    kind: 'tour',
    requires: ['welcome'],
    targets: ['hud-week'],
  },
  {
    id: 'diary',
    kind: 'do',
    requires: ['hud'],
    targets: ['plan-action', 'place-office'],
    complete: (f) => f.modal === 'planner',
  },
  {
    id: 'first-meeting',
    kind: 'do',
    requires: ['diary'],
    shows: deskOrPlanner,
    targets: ['action-meet_politician', 'plan-action', 'place-office'],
    complete: (f) => plannedKind(f, ['meet_politician']),
  },
  {
    id: 'dispatch',
    kind: 'do',
    requires: ['first-meeting'],
    // Waits for a dispatch to exist; later steps go ahead meanwhile.
    available: (f) => f.pendingEvents > 0 || plannedKind(f, ['respond_to_event']),
    targets: ['dispatch', 'place-office'],
    complete: (f) => plannedKind(f, ['respond_to_event']),
  },
  {
    id: 'end-week',
    kind: 'do',
    requires: ['first-meeting'],
    targets: ['end-week'],
    complete: (f, { baseline }) => f.turn > baseline.turn,
  },
  {
    id: 'the-papers',
    kind: 'do',
    requires: ['end-week'],
    shows: (f) => f.modal === 'report',
    targets: ['your-week'],
    complete: (f, { baseline }) => f.reportsClosed > baseline.reportsClosed,
  },
  {
    id: 'fog',
    kind: 'do',
    requires: ['end-week'],
    targets: ['forecast', 'place-chamber'],
    complete: lookedAt('chamber'),
  },
  {
    id: 'find-out',
    kind: 'do',
    requires: ['fog'],
    shows: deskOrPlanner,
    needsParliament: true,
    // The planner's Meet action; else a waverer's Find out button; else the Tea Room roster,
    // where every unasked colleague shows a "?"; else the Tea Room tab.
    targets: ['action-meet_politician', 'find-out', 'roster', 'place-tea-room'],
    complete: (f, { baseline }) =>
      (f.forecastUnknown !== null &&
        baseline.forecastUnknown !== null &&
        f.forecastUnknown < baseline.forecastUnknown) ||
      f.planned.some(
        (p) => MEETING_KINDS.includes(p.kind) && !baseline.planned.some((b) => b.id === p.id),
      ),
  },
  {
    id: 'relationships',
    kind: 'do',
    requires: ['find-out'],
    targets: ['relationships', 'roster', 'place-tea-room'],
    complete: lookedAt('dossier'),
  },
  {
    id: 'factions',
    kind: 'do',
    requires: ['relationships'],
    targets: ['factions', 'place-party-hq'],
    complete: lookedAt('party-hq'),
  },
  {
    id: 'your-vote',
    kind: 'do',
    requires: ['factions'],
    shows: deskOrPlanner,
    targets: ['your-vote', 'place-chamber'],
    complete: (f, { baseline }) =>
      plannedKind(f, VOTE_KINDS) || (f.turn >= 4 && f.turn > baseline.turn),
  },
  {
    id: 'division',
    kind: 'do',
    requires: ['end-week'],
    shows: (f) => f.modal === 'report' && f.reportDivisions > 0,
    targets: ['division-tally'],
    complete: (f, { baseline }) => f.divisionReportsClosed > baseline.divisionReportsClosed,
  },
  { id: 'graduation', kind: 'ack', requires: ['division'], shows: onDesk, targets: [] },
];

export const TOTAL_STEPS = STEPS.length;
