import { index, integer, numeric, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * D1 (`whip-core`) schema. Generate migrations with `pnpm db:generate`, apply with
 * `pnpm db:migrate:local` (wrangler). See docs/architecture/04-persistence.md §1.
 */

/** Campaign index: a derived projection of each Campaign DO (the DO is the source of truth). */
export const campaigns = sqliteTable(
  'campaigns',
  {
    id: text().primaryKey(),
    /** Better Auth `user.id`, or a `dev:<name>` identity locally (hence no FK). */
    ownerId: text().notNull(),
    name: text().notNull(),
    scenarioKey: text().notNull(),
    status: text({ enum: ['initialising', 'active'] })
      .notNull()
      .default('initialising'),
    revision: integer().notNull().default(0),
    /** In-game date, ISO YYYY-MM-DD. */
    simDate: text(),
    turn: integer().notNull().default(0),
    playerPoliticianId: text(),
    playerName: text(),
    simulationVersion: integer().notNull(),
    /** ISO-8601 UTC timestamps. */
    createdAt: text().notNull(),
    updatedAt: text().notNull(),
    deletedAt: text(),
    /** Set once the Campaign DO's storage wipe succeeded after a soft delete (cron retries until set). */
    wipeConfirmedAt: text(),
    /** Optional client `Idempotency-Key` of the create request (unique per owner). */
    createKey: text(),
    /** SHA-256 of the canonical create request, to detect key reuse with a different body. */
    createRequestHash: text(),
  },
  (t) => [
    index('campaigns_owner_updated_idx').on(t.ownerId, t.updatedAt),
    uniqueIndex('campaigns_owner_create_key_idx').on(t.ownerId, t.createKey),
    // Maintenance sweep lookups (stale initialising rows; unconfirmed wipes).
    index('campaigns_status_created_idx').on(t.status, t.createdAt),
    index('campaigns_deleted_wipe_idx').on(t.deletedAt, t.wipeConfirmedAt),
  ],
);

export const userPreferences = sqliteTable('user_preferences', {
  userId: text().primaryKey(),
  /** JSON document validated by a contracts schema. */
  data: text({ mode: 'json' }).notNull().$type<Record<string, unknown>>().default({}),
  updatedAt: text().notNull(),
});

/* ----------------------------------------------------------------------------
 * Better Auth 1.7.12 core tables (+ email-otp, which only uses `verification`).
 *
 * Column names/types mirror Better Auth's own `getMigrations()` output exactly (camelCase columns,
 * `date` ≙ NUMERIC affinity) because Better Auth talks to D1 natively via its Kysely adapter and
 * owns these tables. Do not rename columns without configuring Better Auth `fields` mappings.
 * ------------------------------------------------------------------------- */

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified').notNull(),
  image: text('image'),
  createdAt: numeric('createdAt').notNull(),
  updatedAt: numeric('updatedAt').notNull(),
});

export const session = sqliteTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: numeric('expiresAt').notNull(),
    token: text('token').notNull().unique(),
    createdAt: numeric('createdAt').notNull(),
    updatedAt: numeric('updatedAt').notNull(),
    ipAddress: text('ipAddress'),
    userAgent: text('userAgent'),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (t) => [index('session_userId_idx').on(t.userId)],
);

export const account = sqliteTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('accountId').notNull(),
    providerId: text('providerId').notNull(),
    userId: text('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('accessToken'),
    refreshToken: text('refreshToken'),
    idToken: text('idToken'),
    accessTokenExpiresAt: numeric('accessTokenExpiresAt'),
    refreshTokenExpiresAt: numeric('refreshTokenExpiresAt'),
    scope: text('scope'),
    password: text('password'),
    createdAt: numeric('createdAt').notNull(),
    updatedAt: numeric('updatedAt').notNull(),
  },
  (t) => [index('account_userId_idx').on(t.userId)],
);

export const verification = sqliteTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: numeric('expiresAt').notNull(),
    createdAt: numeric('createdAt').notNull(),
    updatedAt: numeric('updatedAt').notNull(),
  },
  (t) => [index('verification_identifier_idx').on(t.identifier)],
);

/**
 * Better Auth rate-limit store (`rateLimit.storage: 'database'`). Columns mirror Better Auth's own
 * schema (`id` + `key` unique, `count`, `lastRequest` epoch ms).
 */
export const rateLimit = sqliteTable('rateLimit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: integer('lastRequest').notNull(),
});

export type CampaignRow = typeof campaigns.$inferSelect;
export type NewCampaignRow = typeof campaigns.$inferInsert;
export type UserPreferencesRow = typeof userPreferences.$inferSelect;
