import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

/** Drizzle client over the D1 binding. Only the infrastructure layer may use it. */
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema, casing: 'snake_case' });
}

export type Db = ReturnType<typeof createDb>;
