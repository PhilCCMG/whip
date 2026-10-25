import type {
  ActionOutcome,
  BillId,
  ContentRegistry,
  DivisionId,
  EventInstance,
  Headline,
  HistoryRecord,
  IntelItem,
  NewspaperEdition,
  Notification,
  PartyId,
  PoliticianId,
  SimDate,
  GameState,
  Vote,
} from '@whip/domain';

/** Rules version. Bump deliberately when rule changes alter outcomes; re-record golden fixtures. */
export const SIMULATION_VERSION = 1;
/** Shape version of GameState (save compatibility; see state/migrations.ts). */
export const STATE_SCHEMA_VERSION = 3;

export const PHASE_KEYS = [
  'begin_turn',
  'scheduled_effects',
  'ai_planning',
  'action_resolution',
  'relationships',
  'party_factions',
  'parliament',
  'government',
  'public_opinion',
  'indicators',
  'event_generation',
  'careers',
  'chronicle',
] as const;
export type PhaseKey = (typeof PHASE_KEYS)[number];

export interface SimulationContext {
  /** Traits, offices, events, issues, templates — injected, never imported by the engine. */
  content: ContentRegistry;
  /** Asserted against SIMULATION_VERSION. */
  simulationVersion: number;
  options?: {
    /** Run checkInvariants at the end of each advance; throws InvariantError on violation. */
    checkInvariants?: boolean;
  };
  /** Optional monotonic clock (ms) for per-phase timings; tests/bench inject one. */
  clock?: () => number;
}

/** Projection-friendly summary of a division held this turn. */
export interface DivisionReport {
  divisionId: DivisionId;
  billId: BillId;
  billTitle: string;
  stage: string;
  heldOn: SimDate;
  ayes: number;
  noes: number;
  abstentions: number;
  passed: boolean;
  governmentWon: boolean;
  margin: number;
  playerVote: Vote | null;
  byParty: {
    partyId: PartyId;
    shortName: string;
    colour: string;
    ayes: number;
    noes: number;
    abstentions: number;
  }[];
  rebels: {
    politicianId: PoliticianId;
    name: string;
    partyId: PartyId;
    partyShort: string;
    vote: Vote;
    reason: string;
  }[];
}

/** Everything the API needs for the turn report (contracts' TurnReport) lives here. */
export interface SimulationResult {
  /** New state (the input is never mutated). Already rolled over to the next week. */
  state: GameState;
  /** The turn that was just resolved and its Monday. */
  resolvedTurn: number;
  resolvedDate: SimDate;
  /** Append-only records created this turn (persist these). */
  history: HistoryRecord[];
  /** Player-facing notifications created this turn. */
  notifications: Notification[];
  /** One per player action (planned or submitted), including rejections. */
  actionOutcomes: ActionOutcome[];
  /** Event instances raised this turn. */
  events: EventInstance[];
  /** Weekly briefing headlines, derived from the newspaper's lead and politics column. */
  headlines: Headline[];
  /** The week's newspaper edition (also stored in state.briefing.newspaper). */
  newspaper: NewspaperEdition;
  divisions: DivisionReport[];
  /** Intelligence items the player learned this turn. */
  intelligence: IntelItem[];
  /** Player political capital after the turn minus at the start of the advance. */
  capitalChange: number;
  metrics: { phaseTimingsMs?: Partial<Record<PhaseKey, number>> };
}

export class SimulationVersionError extends Error {
  constructor(expected: number, got: number) {
    super(`Simulation version mismatch: engine is v${expected}, context requested v${got}`);
    this.name = 'SimulationVersionError';
  }
}

export function assertVersion(ctx: SimulationContext): void {
  if (ctx.simulationVersion !== SIMULATION_VERSION) {
    throw new SimulationVersionError(SIMULATION_VERSION, ctx.simulationVersion);
  }
}
