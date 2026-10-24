import type { GameState, HistoryRecord } from '@whip/domain';
import type { SimulationResult } from '@whip/simulation';
import type { EngineRuntime } from '../../application/engine';
import { realProjections } from './projections';
import { realEngine } from './real-engine';

export { contentLoadCount, simulationContext } from './context';

/** The production runtime: @whip/simulation + GameState → contracts projections. */
export const realRuntime: EngineRuntime<GameState, SimulationResult, HistoryRecord> = {
  engine: realEngine,
  projections: realProjections,
};
