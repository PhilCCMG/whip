import type { ErrorCode, ErrorEnvelope } from '@whip/contracts';
import { ERROR_HTTP_STATUS } from '@whip/contracts';
import type { Context, ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { z } from 'zod';
import { AppError } from '../application/errors';
import type { AppEnv } from '../env';
import { logger } from '../infrastructure/logging/logger';

function envelope(
  c: Context<AppEnv>,
  code: ErrorCode,
  message: string,
  details?: unknown,
  status: number = ERROR_HTTP_STATUS[code],
) {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId: c.get('requestId'),
    },
  };
  return c.json(body, status as ContentfulStatusCode);
}

export function validationError(error: z.core.$ZodError): AppError {
  return new AppError('VALIDATION_FAILED', 'Request validation failed.', {
    issues: z.treeifyError(error),
  });
}

export const errorHandler: ErrorHandler<AppEnv> = (err, c) => {
  if (err instanceof AppError) {
    return envelope(c, err.code, err.message, err.details);
  }
  if (err instanceof z.ZodError) {
    const v = validationError(err);
    return envelope(c, v.code, v.message, v.details);
  }
  if (err instanceof HTTPException) {
    const code: ErrorCode =
      err.status === 401
        ? 'UNAUTHENTICATED'
        : err.status === 404
          ? 'NOT_FOUND'
          : err.status === 413
            ? 'PAYLOAD_TOO_LARGE'
            : err.status === 429
              ? 'RATE_LIMITED'
              : err.status < 500
                ? 'VALIDATION_FAILED'
                : 'INTERNAL';
    return envelope(c, code, err.message || code, undefined, err.status);
  }
  logger.error('unhandled_error', {
    requestId: c.get('requestId'),
    error:
      err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : String(err),
  });
  return envelope(c, 'INTERNAL', 'An unexpected error occurred.');
};

export const notFoundHandler: NotFoundHandler<AppEnv> = (c) =>
  envelope(c, 'NOT_FOUND', `No route for ${c.req.method} ${c.req.path}.`);
