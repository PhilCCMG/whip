import { describe, expect, it } from 'vitest';
import { ERROR_HTTP_STATUS, ErrorCodeSchema, ErrorEnvelopeSchema } from './errors';

describe('error envelope', () => {
  it('maps every code to an HTTP status', () => {
    for (const code of ErrorCodeSchema.options) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
    }
  });

  it('parses the documented example', () => {
    const parsed = ErrorEnvelopeSchema.parse({
      error: {
        code: 'REVISION_CONFLICT',
        message: 'Campaign has advanced on another device.',
        details: { currentRevision: 42 },
        requestId: 'req-1',
      },
    });
    expect(parsed.error.code).toBe('REVISION_CONFLICT');
  });
});
