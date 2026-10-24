/**
 * @whip/content — static, code-reviewed scenario data (traits, offices, issues, event definitions,
 * name pools, text templates) plus the "First Weeks" scenario. Bundled into the Worker and injected
 * into the simulation via SimulationContext; the engine never imports this package.
 */
import type {
  AmbitionDefinition,
  AmbitionKey,
  ContentRegistry,
  EventDefinition,
  EventKey,
  IssueDefinition,
  IssueKey,
  OfficeDefinition,
  OfficeKey,
  ScenarioDefinition,
  SkillDefinition,
  SkillKey,
  TraitDefinition,
  TraitKey,
} from '@whip/domain';
import { ambitionList, issueList, officeList, skillList } from './catalogue';
import { eventList } from './events';
import { namePools, placeNameParts } from './names';
import { firstWeeks } from './scenarios/first-weeks';
import { textTemplates } from './templates';
import { traitList } from './traits';

/** Version of the bundled content set. Bump when definitions change in a save-affecting way. */
export const CONTENT_VERSION = 1;

function byKey<K extends string, V extends { key: K }>(list: V[]): Record<K, V> {
  const out = {} as Record<K, V>;
  for (const item of list) out[item.key] = item;
  return out;
}

/** Builds the registry injected into the simulation through `SimulationContext.content`. */
export function loadContentRegistry(): ContentRegistry {
  return {
    version: CONTENT_VERSION,
    traits: byKey<TraitKey, TraitDefinition>(traitList),
    issues: byKey<IssueKey, IssueDefinition>(issueList),
    offices: byKey<OfficeKey, OfficeDefinition>(officeList),
    skills: byKey<SkillKey, SkillDefinition>(skillList),
    ambitions: byKey<AmbitionKey, AmbitionDefinition>(ambitionList),
    events: byKey<EventKey, EventDefinition>(eventList),
    names: namePools,
    places: placeNameParts,
    templates: textTemplates,
  };
}

export const scenarios: { firstWeeks: ScenarioDefinition } = { firstWeeks };

/** Scenario lookup by contracts' ScenarioKey (`first_weeks`). */
export function getScenario(key: string): ScenarioDefinition | null {
  return key === firstWeeks.key ? firstWeeks : null;
}

export {
  traitList,
  issueList,
  officeList,
  skillList,
  ambitionList,
  eventList,
  namePools,
  placeNameParts,
  textTemplates,
};
export { generatedCabinetOfficeKeys } from './catalogue';
