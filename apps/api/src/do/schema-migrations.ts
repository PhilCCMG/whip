/**
 * Tiny forward-only migration runner for the Campaign DO's own SQLite schema, keyed by
 * `meta.schema_version` and run on wake (docs/architecture/04-persistence.md §5).
 */
export interface DoMigration {
  version: number;
  up: (sql: SqlStorage) => void;
}

export const DO_MIGRATIONS: readonly DoMigration[] = [
  {
    // docs/architecture/04-persistence.md §2 (+ simulation_version on revisions, §5).
    version: 1,
    up: (sql) => {
      sql.exec(`CREATE TABLE revisions (
        revision INTEGER PRIMARY KEY,
        turn INTEGER NOT NULL,
        sim_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        state_hash TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        simulation_version INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`);
      sql.exec(`CREATE TABLE snapshot_chunks (
        revision INTEGER NOT NULL,
        idx INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (revision, idx)
      )`);
      sql.exec(`CREATE TABLE history (
        seq INTEGER PRIMARY KEY,
        revision INTEGER NOT NULL,
        turn INTEGER NOT NULL,
        sim_date TEXT NOT NULL,
        type TEXT NOT NULL,
        importance INTEGER NOT NULL,
        actor_ids TEXT NOT NULL,
        subject_ids TEXT NOT NULL,
        payload TEXT NOT NULL
      )`);
      sql.exec('CREATE INDEX history_by_type ON history(type, seq)');
      sql.exec('CREATE INDEX history_by_turn ON history(turn)');
      sql.exec('CREATE INDEX history_by_revision ON history(revision)');
      sql.exec(`CREATE TABLE history_subjects (
        politician_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        PRIMARY KEY (politician_id, seq)
      )`);
      sql.exec(`CREATE TABLE idempotency (
        key TEXT PRIMARY KEY,
        request_hash TEXT NOT NULL,
        response TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )`);
      sql.exec('CREATE INDEX idempotency_by_created ON idempotency(created_at)');
    },
  },
  {
    // Latest TurnReport JSON, written in the advance commit (GET /turn-report/latest).
    version: 2,
    up: (sql) => {
      sql.exec(`CREATE TABLE turn_reports (
        revision INTEGER PRIMARY KEY,
        report TEXT NOT NULL
      )`);
    },
  },
  {
    // Oversized turn reports (row-limits.ts) are stored gzip-chunked like snapshots:
    // encoding 'json' (report = JSON) or 'gzip_chunks' (report = SHA-256 of the JSON).
    version: 3,
    up: (sql) => {
      sql.exec("ALTER TABLE turn_reports ADD COLUMN encoding TEXT NOT NULL DEFAULT 'json'");
      sql.exec(`CREATE TABLE turn_report_chunks (
        revision INTEGER NOT NULL,
        idx INTEGER NOT NULL,
        data BLOB NOT NULL,
        PRIMARY KEY (revision, idx)
      )`);
    },
  },
];

export function runDoSchemaMigrations(
  sql: SqlStorage,
  migrations: readonly DoMigration[] = DO_MIGRATIONS,
): number {
  sql.exec('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)');
  const row = sql
    .exec<{ value: string }>("SELECT value FROM meta WHERE key = 'schema_version'")
    .toArray()[0];
  let current = Number(row?.value ?? 0);
  for (const m of [...migrations].sort((a, b) => a.version - b.version)) {
    if (m.version <= current) continue;
    m.up(sql);
    sql.exec(
      "INSERT INTO meta (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      String(m.version),
    );
    current = m.version;
  }
  return current;
}
