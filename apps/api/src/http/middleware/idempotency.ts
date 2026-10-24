import { IDEMPOTENCY_HEADER, IdempotencyKeySchema } from '@whip/contracts';
import type { Context } from 'hono';
import { AppError } from '../../application/errors';
import type { AppEnv } from '../../env';

function invalidKey(): AppError {
  return new AppError(
    'VALIDATION_FAILED',
    `A valid ${IDEMPOTENCY_HEADER} header (8-128 chars of A-Z a-z 0-9 _ -) is required.`,
  );
}

/** Required `Idempotency-Key` header for campaign mutations. */
export function requireIdempotencyKey(c: Context<AppEnv>): string {
  const parsed = IdempotencyKeySchema.safeParse(c.req.header(IDEMPOTENCY_HEADER));
  if (!parsed.success) throw invalidKey();
  return parsed.data;
}

/** Optional `Idempotency-Key` (campaign create): absent ⇒ undefined, present but invalid ⇒ 400. */
export function optionalIdempotencyKey(c: Context<AppEnv>): string | undefined {
  const raw = c.req.header(IDEMPOTENCY_HEADER);
  if (raw === undefined) return undefined;
  const parsed = IdempotencyKeySchema.safeParse(raw);
  if (!parsed.success) throw invalidKey();
  return parsed.data;
}
