import { z } from 'zod';

/** GET /api/v1/health */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  simulationVersion: z.number().int().positive(),
  environment: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
