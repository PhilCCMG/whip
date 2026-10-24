import { getScenario, loadContentRegistry } from '@whip/content';
import type { ScenarioDefinition } from '@whip/domain';
import { SIMULATION_VERSION, type SimulationContext } from '@whip/simulation';

/**
 * The SimulationContext, built once per isolate. `loadContentRegistry()` assembles the static
 * content tables; doing that per request would waste CPU in the Campaign DO, so it is memoised at
 * module level (the content is immutable and shared by every campaign in the isolate).
 */
let cached: SimulationContext | null = null;
let loads = 0;

export function simulationContext(): SimulationContext {
  if (cached === null) {
    loads += 1;
    cached = { content: loadContentRegistry(), simulationVersion: SIMULATION_VERSION };
  }
  return cached;
}

/** How many times the registry was built in this isolate (diagnostics/tests: should stay 1). */
export function contentLoadCount(): number {
  return loads;
}

export function scenarioFor(key: string): ScenarioDefinition {
  const scenario = getScenario(key);
  if (!scenario) throw new Error(`Unknown scenario "${key}".`);
  return scenario;
}
