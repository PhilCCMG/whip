import { ERROR_HTTP_STATUS, type ErrorCode } from '@whip/contracts';

/**
 * Typed application error. Thrown by use-case services and the HTTP layer; mapped to the shared
 * error envelope `{ error: { code, message, details?, requestId } }` by http/errors.ts.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return ERROR_HTTP_STATUS[this.code];
  }
}
