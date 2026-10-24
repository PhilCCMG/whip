import {
  MAX_INBOX_NOTIFICATIONS,
  type ActionOutcome,
  type DivisionId,
  type Effect,
  type EffectCondition,
  type EffectSource,
  type EventInstance,
  type GameState,
  type HistoryPayloads,
  type HistoryRecord,
  type HistoryRecordId,
  type HistoryTemplateKey,
  type HistoryType,
  type IntelItem,
  type Notification,
  type PlannedAction,
  type NotificationId,
  type NotificationLinkKind,
  type NotificationSeverity,
  type PoliticianId,
  type ScheduledEffectId,
  type SimDate,
} from '@whip/domain';
import { PHASE_KEYS, type PhaseKey, type SimulationContext } from '../context';
import { historyText, type TemplateVars } from '../chronicle/templates';
import { applyEffect, type ApplyResult } from '../effects/apply';
import { Rng } from '../rng';
import { formatId, nextId } from '../state/ids';
import { compareStrings } from '../state/access';

export interface HistoryInput<T extends HistoryType> {
  type: T;
  payload: HistoryPayloads[T];
  importance: number;
  template: HistoryTemplateKey;
  vars: TemplateVars;
  actorIds: PoliticianId[];
  subjectIds: string[];
  effectIds?: string[];
  date?: SimDate;
}

export interface NotificationInput {
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: { kind: NotificationLinkKind; id: string } | null;
}

/**
 * Per-turn working context (doc 03 §4). Phases emit effects through `emit`, which applies them
 * immediately with the single interpreter and stamps an `effectId = turn:phase:seq`. Effects are
 * either applied now (`emit`) or queued (`schedule`), never both.
 */
export class TurnContext {
  readonly turn: number;
  /** Monday of the week being resolved. */
  readonly date: SimDate;
  readonly ctx: SimulationContext;
  phase: PhaseKey = 'begin_turn';
  private seq = 0;
  private readonly rngs = new Map<string, Rng>();
  private readonly rootRng: GameState['meta']['rng'];

  readonly appliedEffectIds: string[] = [];
  readonly history: HistoryRecord[] = [];
  readonly notifications: Notification[] = [];
  readonly raisedEvents: EventInstance[] = [];
  readonly actionOutcomes: ActionOutcome[] = [];
  readonly divisionsHeld: DivisionId[] = [];
  readonly intel: IntelItem[] = [];
  /** Player diary capacity for this week, fixed before scheduled effects are consumed. */
  playerSlotCapacity = 0;
  /** Player capital at the start of the advance. */
  playerCapitalStart = 0;
  /** Politicians who rebelled on a division this turn (for careers / reshuffles). */
  readonly rebelsThisTurn = new Set<PoliticianId>();
  /** Turn-scoped scratch flags for cross-phase signals (documented where set). */
  readonly flags = new Set<string>();
  /** NPC actions chosen in the AI planning phase, resolved in the action phase. */
  readonly npcPlans: PlannedAction[] = [];
  /** Player actions submitted with advanceSimulation (validated at the start of the advance). */
  readonly extraPlayerActions: PlannedAction[] = [];
  /** Capital reserved by the player's planned actions at the start of the advance. */
  playerCapitalReserved = 0;
  /** Government stability at the start of the turn (for opinion drift). */
  stabilityStart = 0;

  constructor(state: GameState, ctx: SimulationContext) {
    this.turn = state.meta.turn;
    this.date = state.meta.date;
    this.ctx = ctx;
    this.rootRng = state.meta.rng;
  }

  get content(): SimulationContext['content'] {
    return this.ctx.content;
  }

  /** Named RNG stream for this turn (forked from the root state by turn + key). */
  rng(key: string): Rng {
    let r = this.rngs.get(key);
    if (!r) {
      r = Rng.fork(this.rootRng, this.turn, key);
      this.rngs.set(key, r);
    }
    return r;
  }

  nextEffectId(): string {
    this.seq += 1;
    return `${this.turn}:${PHASE_KEYS.indexOf(this.phase)}:${this.seq}`;
  }

  /** Apply an effect now. Returns human-readable lines describing what changed. */
  emit(draft: GameState, effect: Effect): ApplyResult {
    const effectId = this.nextEffectId();
    this.appliedEffectIds.push(effectId);
    return applyEffect(draft, effect, this, effectId);
  }

  emitAll(draft: GameState, effects: Effect[]): { lines: string[]; effectIds: string[] } {
    const lines: string[] = [];
    const effectIds: string[] = [];
    for (const e of effects) {
      const r = this.emit(draft, e);
      lines.push(...r.lines);
      effectIds.push(r.effectId);
    }
    return { lines, effectIds };
  }

  /** Queue an effect for a later turn (doc 03 §5). */
  schedule(
    draft: GameState,
    effect: Effect,
    dueTurn: number,
    source: EffectSource,
    conditions: EffectCondition[] = [],
  ): ScheduledEffectId {
    if (dueTurn <= this.turn && this.phase !== 'begin_turn') {
      throw new Error(
        `Cannot schedule an effect for turn ${dueTurn} from turn ${this.turn}; emit it instead`,
      );
    }
    const id = nextId<ScheduledEffectId>(draft, 'sch');
    draft.scheduled.push({ id, dueTurn, effect, source, conditions });
    draft.scheduled.sort((a, b) => a.dueTurn - b.dueTurn || compareStrings(a.id, b.id));
    return id;
  }

  record<T extends HistoryType>(draft: GameState, input: HistoryInput<T>): HistoryRecord {
    draft.meta.historySeq += 1;
    const seq = draft.meta.historySeq;
    const { title, summary } = historyText(this.content, input.template, input.vars);
    const rec = {
      id: formatId<HistoryRecordId>('his', seq),
      seq,
      turn: this.turn,
      date: input.date ?? this.date,
      type: input.type,
      importance: Math.max(1, Math.min(5, Math.round(input.importance))),
      title,
      summary,
      actorIds: input.actorIds,
      subjectIds: input.subjectIds,
      effectIds: input.effectIds ?? [],
      payload: input.payload,
    } as HistoryRecord;
    draft.recentHistory.push(rec);
    this.history.push(rec);
    return rec;
  }

  notify(draft: GameState, input: NotificationInput): Notification {
    const n: Notification = { id: nextId<NotificationId>(draft, 'ntf'), turn: this.turn, ...input };
    draft.inbox.push(n);
    if (draft.inbox.length > MAX_INBOX_NOTIFICATIONS)
      draft.inbox.splice(0, draft.inbox.length - MAX_INBOX_NOTIFICATIONS);
    this.notifications.push(n);
    return n;
  }
}
