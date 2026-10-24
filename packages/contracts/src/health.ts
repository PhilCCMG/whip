import { z } from 'zod';

/** Dotted numeric version, e.g. `1.0.0` (no pre-release tags). */
const VersionString = z.string().regex(/^\d+(\.\d+){0,2}$/);

/** GET /api/v1/health */
export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  simulationVersion: z.number().int().positive(),
  environment: z.string(),
  /**
   * API contract version (`MAJOR.MINOR.PATCH`). The desktop client ships independently of the
   * Worker (ADR-0011) and uses it to detect an incompatible server. Optional only so older
   * servers and fixtures still parse; the Worker always sends it.
   */
  apiVersion: VersionString.optional(),
  /** Oldest desktop client version the API still supports; older clients must update. */
  minDesktopVersion: VersionString.optional(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
