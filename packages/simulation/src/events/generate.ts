import type { Division, EventDefinition, EventInstance, GameState, Politician } from '@whip/domain';
import { forecastDivision } from '../ai/forecast';
import { whipFor } from '../parliament/vote-utility';
import {
  getBill,
  getConstituency,
  getPolitician,
  governmentMajority,
  isGovernmentParty,
  isOnPayroll,
  isSitting,
  nameOf,
  scheduledDivisions,
  compareStrings,
} from '../state/access';
import type { TurnContext } from '../turn/context';
import { bindOption } from './bind';

function onCooldown(
  state: GameState,
  def: EventDefinition,
  addresseeId: string,
  turn: number,
): boolean {
  const personal = state.events.cooldowns[`${def.key}:${addresseeId}`];
  const global = def.audience === 'npc' ? state.events.cooldowns[def.key] : undefined;
  return (personal !== undefined && personal > turn) || (global !== undefined && global > turn);
}

function alreadyPending(state: GameState, def: EventDefinition, addresseeId: string): boolean {
  return state.events.pending.some(
    (e) => e.definitionKey === def.key && e.addresseeId === addresseeId,
  );
}

/** Divisions coming up after this week, within `weeks` turns (the player responds next week). */
function upcoming(state: GameState, turn: number, weeks: number): Division[] {
  return scheduledDivisions(state).filter((d) => d.turn > turn && d.turn - turn <= weeks);
}

/**
 * Player events that reach their expiry unanswered resolve with the default option, so nothing is
 * left dangling (and the "non-committal" choice is what silence means).
 */
function expirePlayerEvents(draft: GameState, tc: TurnContext): void {
  for (const ev of draft.events.pending.slice().sort((a, b) => compareStrings(a.id, b.id))) {
    if (ev.addresseeId !== draft.player.politicianId || ev.expiresTurn > tc.turn) continue;
    const def = tc.content.events[ev.definitionKey];
    const opt = def?.options.find((o) => o.key === def.defaultOptionKey);
    if (!def || !opt) continue;
    const bound = bindOption(draft, ev, opt, tc.content, tc.turn);
    tc.emitAll(draft, [
      ...bound.effects,
      { kind: 'event.resolve', eventId: ev.id, optionKey: opt.key, expired: true },
    ]);
    for (const s of bound.scheduled)
      tc.schedule(draft, s.effect, s.dueTurn, { kind: 'event', id: ev.id }, s.conditions);
    tc.record(draft, {
      type: 'event',
      payload: { eventId: ev.id, definitionKey: ev.definitionKey, optionKey: opt.key },
      importance: 1,
      template: 'event.resolved',
      vars: {
        actor: nameOf(draft, ev.addresseeId),
        event: def.title,
        option: `let it pass (${opt.label.toLowerCase()})`,
      },
      actorIds: [ev.addresseeId],
      subjectIds: [ev.id],
    });
  }
}

/**
 * Phase 10 — event generation: evaluate each definition's declarative trigger against the
 * end-of-week state (definitions in key order; one evaluator per trigger kind).
 */
export function eventGenerationPhase(draft: GameState, tc: TurnContext): void {
  expirePlayerEvents(draft, tc);
  const me = getPolitician(draft, draft.player.politicianId);
  for (const key of Object.keys(tc.content.events).sort()) {
    const def = tc.content.events[key as EventDefinition['key']];
    if (!def) continue;
    // One stream per definition (and per subject MP where draws are per-MP), so adding an event
    // definition or a candidate never shifts another's rolls (ADR-0008 §2).
    const rng = tc.rng(`events:${key}`);
    const t = def.trigger;
    switch (t.kind) {
      case 'whips_suspect_waverer': {
        const div = upcoming(draft, tc.turn, t.maxWeeksBeforeDivision).find((d) => {
          const w = whipFor(getBill(draft, d.billId), me);
          return (
            w !== null && w.direction !== null && (w.line === 'three_line' || w.line === 'two_line')
          );
        });
        if (
          !div ||
          !isGovernmentParty(draft, me.partyId) ||
          onCooldown(draft, def, me.id, tc.turn) ||
          alreadyPending(draft, def, me.id)
        )
          break;
        // Suspicion: the whips doubt the player (phase 5), or a routine check on a new MP.
        const doubted = tc.flags.has(`whips_doubt_player:${div.id}`) || me.partyLoyalty < 30;
        const p = doubted ? t.chance : t.chance * 0.35;
        if (rng.chance(p)) raise(draft, tc, def, me, div);
        break;
      }
      case 'constituency_protest': {
        if (tc.turn < t.firstTurn || tc.turn > t.lastTurn) break;
        const div = upcoming(draft, tc.turn, 3).find(
          (d) => (getBill(draft, d.billId).issues[t.issueKey] ?? 0) < 0,
        );
        if (!div) break;
        // Candidates: the player and high-fidelity government MPs in seats that care about the issue.
        for (const id of draft.politicians.ids) {
          const p = draft.politicians.byId[id];
          if (
            !p ||
            !isSitting(p) ||
            p.constituencyId === null ||
            !isGovernmentParty(draft, p.partyId)
          )
            continue;
          if (
            !p.isPlayer &&
            (p.fidelity !== 'high' || def.audience === 'player' || isOnPayroll(draft, p))
          )
            continue;
          const concern = getConstituency(draft, p.constituencyId).concerns[t.issueKey] ?? 0;
          if (
            concern < t.minConcern ||
            onCooldown(draft, def, p.id, tc.turn) ||
            alreadyPending(draft, def, p.id)
          )
            continue;
          if (tc.rng(`events:${key}:${p.id}`).chance(t.chance)) raise(draft, tc, def, p, div);
        }
        break;
      }
      case 'journalist_call': {
        if (
          tc.turn < t.firstTurn ||
          onCooldown(draft, def, me.id, tc.turn) ||
          alreadyPending(draft, def, me.id)
        )
          break;
        const div = upcoming(draft, tc.turn, 3)[0];
        if (div && rng.chance(t.chance)) raise(draft, tc, def, me, div);
        break;
      }
      case 'forecast_rebellion': {
        const div = upcoming(draft, tc.turn, t.maxWeeksBeforeDivision)[0];
        if (!div) break;
        const bill = getBill(draft, div.billId);
        const sponsor = getPolitician(draft, bill.sponsorId);
        if (!isGovernmentParty(draft, sponsor.partyId)) break;
        const pm = getPolitician(draft, draft.government.primeMinisterId);
        if (onCooldown(draft, def, pm.id, tc.turn) || alreadyPending(draft, def, pm.id)) break;
        // The whips' count: government MPs set to vote against the bill (abstainers are not counted).
        const forecast = forecastDivision(draft, div, tc.content);
        const rebels = forecast.governmentOpponents.length;
        if (rebels > governmentMajority(draft) * t.fractionOfMajority) {
          tc.flags.add('concession_considered');
          raise(draft, tc, def, pm, div);
        }
        break;
      }
      case 'engine':
        break;
    }
  }
}

function raise(
  draft: GameState,
  tc: TurnContext,
  def: EventDefinition,
  addressee: Politician,
  div: Division,
): EventInstance | undefined {
  tc.emit(draft, {
    kind: 'event.raise',
    definitionKey: def.key,
    addresseeId: addressee.id,
    subjects: {
      politicianIds: [addressee.id],
      billId: div.billId,
      divisionId: div.id,
      officeKey: null,
    },
  });
  return draft.events.pending[draft.events.pending.length - 1];
}
