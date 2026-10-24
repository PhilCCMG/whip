import { z } from 'zod';

/* ----------------------------------------------------------------------------
 * Shared primitives
 * ------------------------------------------------------------------------- */

export const SimDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const IdSchema = z.string().min(1).max(64);

export const PageQuerySchema = z.object({
  cursor: z.string().max(128).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PageQuery = z.infer<typeof PageQuerySchema>;

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item), nextCursor: z.string().nullable() });

/** All mutating campaign requests carry the revision the client last saw. */
export const MutationBaseSchema = z.object({ expectedRevision: z.number().int().min(0) });

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

/*
 * Value scales (docs/architecture/02-domain-model.md §2). The API passes engine values through
 * unscaled:
 * - reputation: −100..100 per audience, 0 = neutral/unknown
 * - relationship trust / respect / affinity: −100..100 (directional: `from`'s view of `to`);
 *   obligation: signed integer favours owed; rivalry 0..3
 * - skills: integers 1..20 (10 = typical MP)
 * - ideology: economic and social, each −100..100
 * - party loyalty, party unity, government stability: −100..100
 * - faction cohesion: 0..1; poll share: 0..1
 * - issue stances: −2..2
 * - influence: derived points ≥ 0 (sum of an explainable breakdown), not a percentage
 */

/** Reputation per audience, each −100..100 (0 = neutral/unknown). */
export const ReputationSchema = z.object({
  public: z.number(),
  party_members: z.number(),
  colleagues: z.number(),
  media: z.number(),
  whips: z.number(),
});

/** economic −100 (collectivist) … +100 (free-market); social −100 (liberal) … +100 (traditional). */
export const IdeologySchema = z.object({ economic: z.number(), social: z.number() });

export const VoteSchema = z.enum(['aye', 'no', 'abstain']);
export const KnownVoteSchema = z.enum(['aye', 'no', 'abstain', 'unknown']);

/** Directional relationship: trust / respect / affinity −100..100, rivalry 0..3. */
export const RelationshipSummarySchema = z.object({
  trust: z.number(),
  respect: z.number(),
  affinity: z.number(),
  obligation: z.number(),
  rivalry: z.number().int().min(0).max(3),
});

/* ----------------------------------------------------------------------------
 * Campaigns
 * ------------------------------------------------------------------------- */

export const ScenarioKeySchema = z.enum(['first_weeks']);
export const SkillKeySchema = z.enum([
  'oratory',
  'negotiation',
  'administration',
  'intrigue',
  'media',
  'policy',
]);

export const CreateCampaignRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scenarioKey: ScenarioKeySchema,
  seed: z
    .number()
    .int()
    .min(0)
    .max(2 ** 32 - 1)
    .optional(),
  player: z.object({
    firstName: z.string().trim().min(1).max(40),
    lastName: z.string().trim().min(1).max(40),
    gender: z.enum(['female', 'male', 'nonbinary']),
    strength: z.enum(['oratory', 'negotiation', 'intrigue', 'policy']),
    ideologyPreset: z.enum(['moderniser', 'heartlands', 'independent']),
  }),
});
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequestSchema>;

export const CampaignSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  scenarioKey: z.string(),
  status: z.enum(['initialising', 'active']),
  simDate: SimDateSchema,
  turn: z.number().int(),
  revision: z.number().int(),
  playerName: z.string(),
  simulationVersion: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CampaignSummary = z.infer<typeof CampaignSummarySchema>;
export const CampaignListResponseSchema = pageOf(CampaignSummarySchema);

/* ----------------------------------------------------------------------------
 * Actions
 * ------------------------------------------------------------------------- */

export const ActionKindSchema = z.enum([
  'meet_politician',
  'build_relationship',
  'seek_endorsement',
  'make_political_promise',
  'support_legislation',
  'oppose_legislation',
  'rebel_against_party',
  'request_promotion',
  'respond_to_event',
  'call_reshuffle',
]);
export type ActionKind = z.infer<typeof ActionKindSchema>;

/** Shape-only validation at the edge; the engine re-validates params and eligibility. */
export const ActionRequestSchema = z.object({
  kind: ActionKindSchema,
  params: z.record(z.string(), z.unknown()).default({}),
});

export const PlanActionRequestSchema = MutationBaseSchema.extend({ action: ActionRequestSchema });
export type PlanActionRequest = z.infer<typeof PlanActionRequestSchema>;

export const PlannedActionSchema = z.object({
  id: IdSchema,
  kind: ActionKindSchema,
  label: z.string(), // e.g. "Meet Bernadette Walsh"
  slots: z.number().int(),
  capitalCost: z.number().int(),
  params: z.record(z.string(), z.unknown()),
});

export const DiarySchema = z.object({
  slotsTotal: z.number().int(),
  slotsUsed: z.number().int(),
  planned: z.array(PlannedActionSchema),
});

export const PlanActionResponseSchema = z.object({
  revision: z.number().int(),
  planned: PlannedActionSchema,
  diary: DiarySchema,
  politicalCapital: z.number().int(),
});

export const CancelActionRequestSchema = MutationBaseSchema;
export const CancelActionResponseSchema = z.object({
  revision: z.number().int(),
  diary: DiarySchema,
  politicalCapital: z.number().int(),
});

export const ActionTargetOptionSchema = z.object({
  id: IdSchema,
  label: z.string(),
  hint: z.string().optional(),
});

export const ActionCatalogueItemSchema = z.object({
  kind: ActionKindSchema,
  label: z.string(),
  description: z.string(),
  slots: z.number().int(),
  capitalCost: z.number().int(),
  eligible: z.boolean(),
  reasons: z.array(z.string()),
  /** Parameter descriptors so the UI can render a picker without knowing rules. */
  params: z.array(
    z.object({
      name: z.string(),
      label: z.string(),
      type: z.enum(['politician', 'politicians', 'bill', 'division', 'vote', 'event_option']),
      max: z.number().int().optional(),
      options: z.array(ActionTargetOptionSchema).optional(),
    }),
  ),
});
export const ActionCatalogueResponseSchema = z.object({
  items: z.array(ActionCatalogueItemSchema),
});

/* ----------------------------------------------------------------------------
 * Advance / turn report
 * ------------------------------------------------------------------------- */

export const AdvanceRequestSchema = MutationBaseSchema;

export const ActionOutcomeSchema = z.object({
  plannedActionId: IdSchema.nullable(),
  kind: ActionKindSchema,
  label: z.string(),
  status: z.enum(['succeeded', 'partial', 'failed', 'rejected']),
  summary: z.string(),
  effects: z.array(z.string()), // human-readable effect lines: "Bernadette Walsh: trust +6"
});

export const DivisionResultSchema = z.object({
  id: IdSchema,
  billId: IdSchema,
  billTitle: z.string(),
  stage: z.string(),
  heldOn: SimDateSchema,
  ayes: z.number().int(),
  noes: z.number().int(),
  abstentions: z.number().int(),
  passed: z.boolean(),
  governmentWon: z.boolean(),
  playerVote: VoteSchema.nullable(),
  byParty: z.array(
    z.object({
      partyId: IdSchema,
      shortName: z.string(),
      colour: z.string(),
      ayes: z.number().int(),
      noes: z.number().int(),
      abstentions: z.number().int(),
    }),
  ),
  rebels: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      partyShort: z.string(),
      vote: VoteSchema,
      reason: z.string().optional(),
    }),
  ),
});
export type DivisionResult = z.infer<typeof DivisionResultSchema>;

export const NotificationSchema = z.object({
  id: IdSchema,
  turn: z.number().int(),
  severity: z.enum(['info', 'good', 'warning', 'critical']),
  title: z.string(),
  body: z.string(),
  link: z
    .object({ kind: z.enum(['politician', 'bill', 'division', 'event', 'history']), id: IdSchema })
    .optional(),
});

export const HeadlineSchema = z.object({
  text: z.string(),
  standfirst: z.string().optional(),
  importance: z.number().int().min(1).max(5),
});

/**
 * Result of `POST /advance`, also served by `GET /turn-report/latest`.
 * `turn` / `simDate` are the **resolved** week: the week whose diary was just played, and its
 * Monday. `nextTurn` / `nextSimDate` are the week now open for planning (the campaign's turn).
 */
export const TurnReportSchema = z.object({
  revision: z.number().int(),
  turn: z.number().int(),
  simDate: SimDateSchema,
  nextTurn: z.number().int(),
  nextSimDate: SimDateSchema,
  headlines: z.array(HeadlineSchema),
  actionOutcomes: z.array(ActionOutcomeSchema),
  divisions: z.array(DivisionResultSchema),
  notifications: z.array(NotificationSchema),
  capitalChange: z.number().int(),
});
export type TurnReport = z.infer<typeof TurnReportSchema>;

/* ----------------------------------------------------------------------------
 * Career overview (GET /state)
 * ------------------------------------------------------------------------- */

export const EventOptionSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  capitalCost: z.number().int(),
});
export const PendingEventSchema = z.object({
  id: IdSchema,
  title: z.string(),
  body: z.string(),
  raisedOnTurn: z.number().int(),
  options: z.array(EventOptionSchema),
});

export const InfluenceSchema = z.object({
  total: z.number(),
  breakdown: z.array(z.object({ label: z.string(), value: z.number() })),
});

export const PlayerProfileSchema = z.object({
  id: IdSchema,
  name: z.string(),
  partyId: IdSchema,
  partyName: z.string(),
  partyColour: z.string(),
  constituencyName: z.string(),
  majority: z.number().int().nullable(),
  offices: z.array(z.string()),
  factionName: z.string().nullable(),
  skills: z.record(z.string(), z.number().int()),
  traits: z.array(z.object({ key: z.string(), label: z.string(), description: z.string() })),
  ideology: IdeologySchema,
});

export const CareerOverviewSchema = z.object({
  campaign: CampaignSummarySchema,
  player: PlayerProfileSchema,
  standing: z.object({
    politicalCapital: z.number().int(),
    capitalIncome: z.number().int(),
    influence: InfluenceSchema,
    reputation: ReputationSchema,
    partyLoyalty: z.number(),
    endorsements: z.array(z.object({ id: IdSchema, name: z.string() })),
  }),
  diary: DiarySchema,
  pendingEvents: z.array(PendingEventSchema),
  notifications: z.array(NotificationSchema),
  briefing: z.object({ turn: z.number().int(), headlines: z.array(HeadlineSchema) }),
  upcoming: z.array(
    z.object({
      date: SimDateSchema,
      label: z.string(),
      kind: z.enum(['division', 'reading', 'event', 'other']),
      refId: IdSchema.optional(),
    }),
  ),
  /** NPC moves the player has learned about (from meetings, gossip, public statements). */
  intelligence: z.array(
    z.object({ turn: z.number().int(), text: z.string(), politicianId: IdSchema.optional() }),
  ),
});
export type CareerOverview = z.infer<typeof CareerOverviewSchema>;

/* ----------------------------------------------------------------------------
 * Politicians
 * ------------------------------------------------------------------------- */

export const PoliticianListQuerySchema = PageQuerySchema.extend({
  partyId: IdSchema.optional(),
  factionId: IdSchema.optional(),
  search: z.string().max(60).optional(),
  sort: z.enum(['name', 'influence', 'relationship']).default('name'),
});

export const PoliticianSummarySchema = z.object({
  id: IdSchema,
  name: z.string(),
  partyId: IdSchema.nullable(),
  partyShort: z.string().nullable(),
  partyColour: z.string().nullable(),
  constituencyName: z.string().nullable(),
  offices: z.array(z.string()),
  factionId: IdSchema.nullable(),
  factionName: z.string().nullable(),
  status: z.string(),
  influence: z.number(),
  isPlayer: z.boolean(),
  relationshipToPlayer: RelationshipSummarySchema.nullable(), // their view of the player
  knownIntention: KnownVoteSchema.nullable(), // on next division
});
export const PoliticianListResponseSchema = pageOf(PoliticianSummarySchema);

export const PoliticianProfileSchema = PoliticianSummarySchema.extend({
  age: z.number().int(),
  ideology: IdeologySchema,
  stances: z.array(
    z.object({ issueKey: z.string(), label: z.string(), stance: z.number().int().min(-2).max(2) }),
  ),
  traits: z.array(z.object({ key: z.string(), label: z.string(), description: z.string() })),
  skills: z.record(z.string(), z.number().int()),
  ambition: z.object({ label: z.string(), intensity: z.number().int() }).nullable(),
  reputation: ReputationSchema,
  partyLoyalty: z.number(),
  relationship: z.object({
    towardsPlayer: RelationshipSummarySchema.nullable(),
    fromPlayer: RelationshipSummarySchema.nullable(),
    memories: z.array(z.object({ turn: z.number().int(), text: z.string() })),
  }),
  career: z.array(z.object({ date: SimDateSchema, text: z.string() })),
  keyRelationships: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      kind: z.enum(['ally', 'rival', 'patron', 'protege']),
    }),
  ),
});
export type PoliticianProfile = z.infer<typeof PoliticianProfileSchema>;

/* ----------------------------------------------------------------------------
 * Parliament & Party
 * ------------------------------------------------------------------------- */

export const BillSchema = z.object({
  id: IdSchema,
  title: z.string(),
  summary: z.string(),
  sponsorId: IdSchema,
  sponsorName: z.string(),
  stage: z.string(),
  issues: z.array(z.object({ issueKey: z.string(), label: z.string(), stance: z.number().int() })),
  whipping: z.array(
    z.object({
      partyId: IdSchema,
      shortName: z.string(),
      instruction: z.string(),
      direction: VoteSchema.nullable(),
    }),
  ),
});

export const DivisionForecastSchema = z.object({
  id: IdSchema,
  billId: IdSchema,
  billTitle: z.string(),
  stage: z.string(),
  scheduledFor: SimDateSchema,
  forecast: z.object({
    ayes: z.number().int(),
    noes: z.number().int(),
    abstain: z.number().int(),
    unknown: z.number().int(),
  }),
  /** Waverers known to the player. */
  waverers: z.array(
    z.object({ id: IdSchema, name: z.string(), partyShort: z.string(), known: KnownVoteSchema }),
  ),
  playerIntendedVote: VoteSchema.nullable(),
});

export const ParliamentViewSchema = z.object({
  session: z.object({ number: z.number().int(), openedOn: SimDateSchema }),
  composition: z.array(
    z.object({
      partyId: IdSchema,
      name: z.string(),
      shortName: z.string(),
      colour: z.string(),
      seats: z.number().int(),
      inGovernment: z.boolean(),
    }),
  ),
  totalSeats: z.number().int(),
  governmentMajority: z.number().int(),
  bills: z.array(BillSchema),
  upcomingDivisions: z.array(DivisionForecastSchema),
  recentDivisions: z.array(DivisionResultSchema),
});
export type ParliamentView = z.infer<typeof ParliamentViewSchema>;

export const PartyViewSchema = z.object({
  id: IdSchema,
  name: z.string(),
  shortName: z.string(),
  colour: z.string(),
  ideology: IdeologySchema,
  inGovernment: z.boolean(),
  seats: z.number().int(),
  pollShare: z.number(),
  unity: z.number(),
  whipStrength: z.number().int(),
  leader: z.object({ id: IdSchema, name: z.string() }),
  chiefWhip: z.object({ id: IdSchema, name: z.string() }).nullable(),
  governmentStability: z.number().nullable(),
  factions: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      leader: z.object({ id: IdSchema, name: z.string() }),
      memberCount: z.number().int(),
      cohesion: z.number(),
      ideology: IdeologySchema,
      demands: z.array(z.string()),
      playerIsMember: z.boolean(),
      leaderTrustInPlayer: z.number().nullable(),
    }),
  ),
  /** The most influential members of the party, for the "power map". */
  powerMap: z.array(
    z.object({
      id: IdSchema,
      name: z.string(),
      influence: z.number(),
      offices: z.array(z.string()),
    }),
  ),
});
export type PartyView = z.infer<typeof PartyViewSchema>;

/* ----------------------------------------------------------------------------
 * History
 * ------------------------------------------------------------------------- */

export const HistoryTypeSchema = z.enum([
  'election',
  'appointment',
  'resignation',
  'dismissal',
  'division',
  'leadership_contest',
  'scandal',
  'policy_announcement',
  'negotiation',
  'relationship_change',
  'action_outcome',
  'event',
  'promise',
  'campaign',
]);

export const HistoryQuerySchema = PageQuerySchema.extend({
  type: HistoryTypeSchema.optional(),
  politicianId: IdSchema.optional(),
  minImportance: z.coerce.number().int().min(1).max(5).optional(),
  fromTurn: z.coerce.number().int().min(0).optional(),
});

export const HistoryItemSchema = z.object({
  seq: z.number().int(),
  turn: z.number().int(),
  simDate: SimDateSchema,
  type: HistoryTypeSchema,
  importance: z.number().int().min(1).max(5),
  title: z.string(),
  summary: z.string(),
  actorIds: z.array(IdSchema),
  subjectIds: z.array(IdSchema),
});
export type HistoryItem = z.infer<typeof HistoryItemSchema>;
export const HistoryPageSchema = pageOf(HistoryItemSchema);

/* ----------------------------------------------------------------------------
 * Misc
 * ------------------------------------------------------------------------- */

export const MeResponseSchema = z.object({
  user: z.object({ id: IdSchema, email: z.string().nullable(), name: z.string().nullable() }),
  preferences: z.record(z.string(), z.unknown()),
});
