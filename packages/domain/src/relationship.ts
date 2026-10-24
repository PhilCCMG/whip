import { z } from 'zod';
import { PoliticianIdSchema, type PoliticianId, type TurnNumber } from './ids';

export const MEMORY_KINDS = [
  'met',
  'worked_together',
  'flattered',
  'endorsed',
  'refused_endorsement',
  'promised',
  'kept_promise',
  'broke_promise',
  'rebelled',
  'rebelled_together',
  'lobbied',
  'stayed_loyal',
  'appointed',
  'passed_over',
  'sacked',
  'warned_whips',
  'reassured_whips',
  'new_intake',
  'regional_group',
  'faction_comrade',
  'old_colleague',
] as const;
export type MemoryKind = (typeof MEMORY_KINDS)[number];
export const MemoryKindSchema = z.enum(MEMORY_KINDS);

/**
 * Something `from` remembers about `to`. `weight` is signed (−100..100: positive = fond memory).
 * Each turn |weight| shrinks by `decaysBy`; the memory is dropped at 0. Betrayals decay slowly.
 */
export interface Memory {
  turn: TurnNumber;
  kind: MemoryKind;
  weight: number;
  decaysBy: number;
  /** Optional reference, e.g. the division a rebellion happened on. */
  refId: string | null;
}
export const MemorySchema: z.ZodType<Memory> = z.strictObject({
  turn: z.number().int().min(0),
  kind: MemoryKindSchema,
  weight: z.number().min(-100).max(100),
  decaysBy: z.number().min(0),
  refId: z.string().nullable(),
});

/** Directional edge `from → to` (doc 02 §4). A→B and B→A are independent. */
export interface Relationship {
  from: PoliticianId;
  to: PoliticianId;
  /** −100..100 belief that `to` keeps their word. */
  trust: number;
  /** −100..100 regard for `to`'s competence/standing. */
  respect: number;
  /** −100..100 personal warmth. */
  affinity: number;
  /** Integer favours `from` owes `to` (negative = `to` owes `from`). */
  obligation: number;
  /** 0 none … 3 bitter. */
  rivalry: number;
  /** Capped list, newest last. */
  memories: Memory[];
}
const bounded = z.number().min(-100).max(100);
export const RelationshipSchema: z.ZodType<Relationship> = z.strictObject({
  from: PoliticianIdSchema,
  to: PoliticianIdSchema,
  trust: bounded,
  respect: bounded,
  affinity: bounded,
  obligation: z.number().int(),
  rivalry: z.number().int().min(0).max(3),
  memories: z.array(MemorySchema),
});

/** Edge key `from>to`. */
export type RelationshipKey = string;
export function relationshipKey(from: PoliticianId, to: PoliticianId): RelationshipKey {
  return `${from}>${to}`;
}

/** Sparse table: only meaningful edges are stored; others derive from party/faction/ideology. */
export interface RelationshipTable {
  edges: Record<RelationshipKey, Relationship>;
}
export const RelationshipTableSchema: z.ZodType<RelationshipTable> = z.strictObject({
  edges: z.record(z.string(), RelationshipSchema),
});

export const MAX_MEMORIES_PER_EDGE = 6;
