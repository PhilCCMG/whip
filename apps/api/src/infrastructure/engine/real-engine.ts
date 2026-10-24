import type { GameState, HistoryRecord } from '@whip/domain';
import {
  advanceSimulation,
  cancelPlannedAction,
  createCampaignState,
  deserializeState,
  planAction,
  selectors,
  serializeState,
  SIMULATION_VERSION,
  type SimulationResult,
} from '@whip/simulation';
import type { Engine } from '../../application/engine';
import { scenarioFor, simulationContext } from './context';

/**
 * `Engine` port over `@whip/simulation` (docs/architecture/07-vertical-slice.md §5).
 * All rules live in the engine; this adapter only binds the SimulationContext and scenario.
 */
export const realEngine: Engine<GameState, SimulationResult, HistoryRecord> = {
  version: SIMULATION_VERSION,

  create(input) {
    const state = createCampaignState(
      { scenario: scenarioFor(input.scenarioKey), seed: input.seed, player: input.player },
      simulationContext(),
    );
    // The opening chronicle (campaign created, player elected) lives in recentHistory and must be
    // persisted like any later turn's records.
    return { state, history: state.recentHistory };
  },

  meta(state) {
    return {
      turn: state.meta.turn,
      simDate: state.meta.date,
      playerPoliticianId: state.player.politicianId,
      playerName: selectors.displayName(state, state.player.politicianId),
    };
  },

  planAction(state, request) {
    const result = planAction(
      state,
      { kind: request.kind, params: request.params },
      simulationContext(),
    );
    if (!result.ok) return { ok: false, reasons: result.reasons.map((r) => r.message) };
    return { ok: true, state: result.state, plannedActionId: result.planned.id };
  },

  cancelPlannedAction(state, plannedActionId) {
    return cancelPlannedAction(state, plannedActionId);
  },

  advance(state) {
    const result = advanceSimulation(state, [], simulationContext());
    return { state: result.state, history: result.history, result };
  },

  serialize: serializeState,
  deserialize: deserializeState,
};
