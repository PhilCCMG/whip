import { eq } from 'drizzle-orm';
import type { Db } from './client';
import { userPreferences } from './schema';

export async function getUserPreferences(db: Db, userId: string): Promise<Record<string, unknown>> {
  const row = await db
    .select({ data: userPreferences.data })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .get();
  return row?.data ?? {};
}
