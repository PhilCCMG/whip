import { GameStateSchema, type GameState } from '@whip/domain';
import { STATE_SCHEMA_VERSION } from '../context';
import { hashString } from '../rng';
import { canonicalStringify } from './canonical';
import { migrateToCurrent } from './migrations';

export type StateLoadErrorCode =
  'invalid_json' | 'not_an_object' | 'future_schema' | 'migration_failed' | 'invalid_state';

/** Thrown by deserializeState. `issues` carries Zod messages for `invalid_state`. */
export class StateLoadError extends Error {
  readonly code: StateLoadErrorCode;
  readonly issues: string[];
  constructor(code: StateLoadErrorCode, message: string, issues: string[] = []) {
    super(message);
    this.name = 'StateLoadError';
    this.code = code;
    this.issues = issues;
  }
}

/** Canonical JSON snapshot (sorted keys). */
export function serializeState(state: GameState): string {
  return canonicalStringify(state);
}

/** Parse → migrate by schemaVersion → Zod-validate. Throws StateLoadError. */
export function deserializeState(json: string): GameState {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new StateLoadError('invalid_json', `State is not valid JSON: ${(e as Error).message}`);
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new StateLoadError('not_an_object', 'State must be a JSON object');
  }
  const meta = (raw as { meta?: unknown }).meta;
  const version =
    typeof meta === 'object' && meta !== null
      ? (meta as { schemaVersion?: unknown }).schemaVersion
      : undefined;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new StateLoadError('invalid_state', 'State has no valid meta.schemaVersion');
  }
  if (version > STATE_SCHEMA_VERSION) {
    throw new StateLoadError(
      'future_schema',
      `State schema v${version} is newer than this engine supports (v${STATE_SCHEMA_VERSION})`,
    );
  }
  let migrated: unknown;
  try {
    migrated = migrateToCurrent(raw as Record<string, unknown>, version);
  } catch (e) {
    throw new StateLoadError(
      'migration_failed',
      `Migration from v${version} failed: ${(e as Error).message}`,
    );
  }
  const parsed = GameStateSchema.safeParse(migrated);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 20).map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new StateLoadError(
      'invalid_state',
      `State failed validation (${parsed.error.issues.length} issues)`,
      issues,
    );
  }
  return parsed.data;
}

/** Pure, non-cryptographic digest of the canonical snapshot (determinism tests, change detection). */
export function hashState(state: GameState): string {
  return hashString(canonicalStringify(state));
}
