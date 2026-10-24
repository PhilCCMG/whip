import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';
import { validationError } from './errors';

/**
 * `zValidator` wrapper that turns failures into the shared VALIDATION_FAILED envelope.
 * Usage: `app.post('/x', validate('json', CreateCampaignRequestSchema), (c) => c.req.valid('json'))`
 */
export function validate<T extends z.ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw validationError(result.error);
    }
  });
}
