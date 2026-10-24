import { loadContentRegistry, scenarios } from '@whip/content';
import type { ActionRequest, DivisionId, GameState, PlayerSetup, PoliticianId } from '@whip/domain';
import {
  advanceSimulation,
  createCampaignState,
  planAction,
  SIMULATION_VERSION,
  type SimulationContext,
  type SimulationResult,
} from '../src';

export const content = loadContentRegistry();
export const ctx: SimulationContext = { content, simulationVersion: SIMULATION_VERSION };
export const strictCtx: SimulationContext = { ...ctx, options: { checkInvariants: true } };

export const playerSetup: PlayerSetup = {
  firstName: 'Alex',
  lastName: 'Morgan',
  gender: 'nonbinary',
  strength: 'negotiation',
  ideologyPreset: 'independent',
};

export const SECOND_READING = 'div.hdb_second_reading' as DivisionId;
export const BILL = 'bill.housing_delivery';
export const pid = (s: string) => s as PoliticianId;

export function newGame(seed: number, setup: PlayerSetup = playerSetup): GameState {
  return createCampaignState({ scenario: scenarios.firstWeeks, seed, player: setup }, ctx);
}

/** Plan each request in order (ignoring rejections) and return the new state. */
export function planAll(state: GameState, requests: ActionRequest[]): GameState {
  let s = state;
  for (const r of requests) {
    const res = planAction(s, r, ctx);
    if (res.ok) s = res.state;
  }
  return s;
}

/** Advance `turns` weeks; `script(turn, state)` returns the player's requests for that week. */
export function play(
  state: GameState,
  turns: number,
  script: (turn: number, state: GameState) => ActionRequest[] = () => [],
  c: SimulationContext = ctx,
): { state: GameState; results: SimulationResult[] } {
  let s = state;
  const results: SimulationResult[] = [];
  for (let i = 0; i < turns; i++) {
    s = planAll(s, script(s.meta.turn, s));
    const r = advanceSimulation(s, [], c);
    results.push(r);
    s = r.state;
  }
  return { state: s, results };
}

/** Recursively freeze a value so any mutation throws (ES modules run in strict mode). */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
  }
  return value;
}

export function env(name: string): string | undefined {
  return process.env[name];
}
