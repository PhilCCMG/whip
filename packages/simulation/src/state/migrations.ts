import { STATE_SCHEMA_VERSION } from '../context';

/**
 * Save migrations: pure `vN → vN+1` functions on raw JSON (doc 04 §5). To add one: bump
 * STATE_SCHEMA_VERSION, add `N: (s) => …` here, and add a vN fixture save to the tests.
 */
type Migration = (state: Record<string, unknown>) => Record<string, unknown>;
type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2: politicians gain `rebellionCount` (lifetime votes against the whip), seeded from the
   * rebellion records a v1 save still has. Generated ids now use 8-digit counters; existing 4-digit
   * ids are left alone (they belong to short-lived scheduled effects, events and notifications).
   */
  1: (s) => {
    const meta = isObject(s.meta) ? s.meta : {};
    const politicians = isObject(s.politicians) ? s.politicians : {};
    const byId = isObject(politicians.byId) ? politicians.byId : {};
    const migrated: Json = {};
    for (const [id, p] of Object.entries(byId)) {
      migrated[id] = isObject(p)
        ? { ...p, rebellionCount: Array.isArray(p.rebellions) ? p.rebellions.length : 0 }
        : p;
    }
    return {
      ...s,
      meta: { ...meta, schemaVersion: 2 },
      politicians: { ...politicians, byId: migrated },
    };
  },
  /**
   * v2 → v3: the briefing gains the weekly newspaper and the story-template ring buffer. Saves from
   * before the newspaper have no edition (null until the next advance prints one) and no history
   * of used templates.
   */
  2: (s) => {
    const meta = isObject(s.meta) ? s.meta : {};
    const briefing = isObject(s.briefing) ? s.briefing : {};
    return {
      ...s,
      meta: { ...meta, schemaVersion: 3 },
      briefing: { ...briefing, newspaper: null, recentStoryTemplates: [] },
    };
  },
};

export function migrateToCurrent(
  state: Record<string, unknown>,
  fromVersion: number,
): Record<string, unknown> {
  let current = state;
  for (let v = fromVersion; v < STATE_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`No migration from schema v${v}`);
    current = step(current);
  }
  return current;
}
