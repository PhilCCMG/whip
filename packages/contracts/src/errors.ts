import { z } from 'zod';

/** Error codes from docs/architecture/05-api-auth-frontend.md §1 "Errors". */
export const ErrorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'NOT_FOUND',
  'REVISION_CONFLICT',
  'IDEMPOTENCY_KEY_REUSED',
  'ACTION_INELIGIBLE',
  'PAYLOAD_TOO_LARGE',
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

/** HTTP status for each error code. NOT_FOUND is also used for campaigns the caller does not own. */
export const ERROR_HTTP_STATUS = {
  VALIDATION_FAILED: 400,
  UNAUTHENTICATED: 401,
  NOT_FOUND: 404,
  REVISION_CONFLICT: 409,
  IDEMPOTENCY_KEY_REUSED: 409,
  ACTION_INELIGIBLE: 422,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

export type ErrorHttpStatus = (typeof ERROR_HTTP_STATUS)[ErrorCode];

/** `{ error: { code, message, details?, requestId } }` */
export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ErrorCodeSchema,
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
