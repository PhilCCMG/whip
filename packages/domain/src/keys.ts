import { z } from 'zod';

/*
 * Content keys. Traits, issues, offices, ambitions and events are referenced by namespaced keys
 * defined in @whip/content. Template literal types catch namespace mistakes at compile time.
 */
export type TraitKey = `trait.${string}`;
export type IssueKey = `issue.${string}`;
export type OfficeKey = `office.${string}`;
export type AmbitionKey = `ambition.${string}`;
export type EventKey = `event.${string}`;
export type RegionKey = `region.${string}`;
export type DepartmentKey = `dept.${string}`;

function keySchema<T extends string>(prefix: string): z.ZodType<T> {
  return z.custom<T>(
    (v) => typeof v === 'string' && v.startsWith(`${prefix}.`) && v.length > prefix.length + 1,
    `Expected a ${prefix}.* key`,
  );
}

export const TraitKeySchema = keySchema<TraitKey>('trait');
export const IssueKeySchema = keySchema<IssueKey>('issue');
export const OfficeKeySchema = keySchema<OfficeKey>('office');
export const AmbitionKeySchema = keySchema<AmbitionKey>('ambition');
export const EventKeySchema = keySchema<EventKey>('event');
export const RegionKeySchema = keySchema<RegionKey>('region');
export const DepartmentKeySchema = keySchema<DepartmentKey>('dept');

/** Skills are a closed set (FM-style 1..20). Matches contracts' SkillKeySchema. */
export const SKILL_KEYS = [
  'oratory',
  'negotiation',
  'administration',
  'intrigue',
  'media',
  'policy',
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];
export const SkillKeySchema = z.enum(SKILL_KEYS);

/** Reputation audiences (doc 02 §2). */
export const AUDIENCES = ['public', 'party_members', 'colleagues', 'media', 'whips'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AudienceSchema = z.enum(AUDIENCES);

export const NATIONS = ['england', 'scotland', 'wales', 'northern_ireland'] as const;
export type Nation = (typeof NATIONS)[number];
export const NationSchema = z.enum(NATIONS);

export const GENDERS = ['female', 'male', 'nonbinary'] as const;
export type Gender = (typeof GENDERS)[number];
export const GenderSchema = z.enum(GENDERS);

export const VOTES = ['aye', 'no', 'abstain'] as const;
export type Vote = (typeof VOTES)[number];
export const VoteSchema = z.enum(VOTES);
export type KnownVote = Vote | 'unknown';

/** Issue stance: ordinal −2 (strongly oppose) … +2 (strongly support). */
export type Stance = -2 | -1 | 0 | 1 | 2;
export const StanceSchema = z.custom<Stance>(
  (v) => typeof v === 'number' && Number.isInteger(v) && v >= -2 && v <= 2,
  'Expected a stance -2..2',
);
