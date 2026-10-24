import { ErrorEnvelopeSchema, type ErrorCode } from '@whip/contracts';

/** Client-side failure codes in addition to the server's error codes. */
export type ClientErrorCode = 'NETWORK_ERROR' | 'INVALID_RESPONSE';
export type ApiErrorCode = ErrorCode | ClientErrorCode;

/** Every failed API call rejects with an ApiError carrying the parsed error envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;
  readonly requestId: string | null;

  constructor(init: {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId?: string | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId ?? null;
  }

  /** `ACTION_INELIGIBLE` carries `details.reasons`; return them as strings. */
  get reasons(): string[] {
    const d = this.details;
    if (d && typeof d === 'object' && 'reasons' in d && Array.isArray(d.reasons)) {
      return (d.reasons as unknown[]).map((r) =>
        typeof r === 'string'
          ? r
          : r && typeof r === 'object' && 'message' in r
            ? String(r.message)
            : JSON.stringify(r),
      );
    }
    return [];
  }

  /** `REVISION_CONFLICT` carries `details.currentRevision`. */
  get currentRevision(): number | null {
    const d = this.details;
    if (d && typeof d === 'object' && 'currentRevision' in d) {
      return typeof d.currentRevision === 'number' ? d.currentRevision : null;
    }
    return null;
  }

  /** Worth retrying with the same idempotency key (network blip, overload, server fault). */
  get retryable(): boolean {
    return this.code === 'NETWORK_ERROR' || this.status === 429 || this.status >= 500;
  }
}

export function isApiError(e: unknown, code?: ApiErrorCode): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

/** Turn a non-2xx response body into an ApiError. Unknown shapes become INTERNAL. */
export function errorFromResponse(status: number, body: unknown): ApiError {
  const parsed = ErrorEnvelopeSchema.safeParse(body);
  if (parsed.success) {
    const { code, message, details, requestId } = parsed.data.error;
    return new ApiError({ status, code, message, details, requestId });
  }
  return new ApiError({
    status,
    code: 'INTERNAL',
    message: `Request failed with status ${status}`,
  });
}
