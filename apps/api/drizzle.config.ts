import { defineConfig } from 'drizzle-kit';

// drizzle-kit 0.31 writes flat `migrations/NNNN_name.sql` files (+ `migrations/meta/` journal),
// which is exactly the layout `wrangler d1 migrations apply` reads. Generate, review, then apply
// with wrangler — never with `drizzle-kit migrate/push` (wrangler tracks applied migrations in D1).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/infrastructure/db/schema.ts',
  out: './migrations',
  casing: 'snake_case',
});
