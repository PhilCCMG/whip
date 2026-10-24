/**
 * Balance constants for vote utility and the systems that feed it. Changing any of these changes
 * outcomes: bump SIMULATION_VERSION and re-record golden hashes. The balance test (07 §6.6) checks
 * that the government wins the second reading in roughly 60–95% of seeds with no player input.
 */
export const VOTE = {
  /** |utility| ≤ this ⇒ abstain (07 §4.2). */
  threshold: 0.15,
  /** Weight of Σ(bill stance × MP stance)/8. */
  ideology: 0.45,
  /** Whip pull = line × (whipStrength/5) × loyaltyFactor × whip. */
  whip: 0.95,
  lineWeight: { three_line: 1, two_line: 0.6, free: 0, none: 0 } as const,
  /** Extra pull for ministers and PPSs (collective responsibility). */
  payroll: 0.8,
  /** Careerists fear crossing the whips: intensity/5 × career × (1 − 0.2·risk). */
  career: 0.25,
  /** Cap on accumulated lobbying pressure. */
  pressureCap: 0.6,
  /** Faction line: mean(demandValue) × cohesion × faction. */
  faction: 0.6,
  /** Per-faction, per-division seeded mood (correlates members' votes), ± this × cohesion. */
  factionMood: 1.0,
  /** Personal cause (ambition.policy_cause): demandValue(cause) × intensity/5 × cause. */
  cause: 0.5,
  /** Σ(bill/2 × local concern) × marginality × constituency. */
  constituency: 0.3,
  /** NPC promise to vote a certain way (soft commitment). */
  promise: 0.5,
  /** Individual seeded noise ± this. */
  noise: 0.12,
  /** An "abstain" whip shrinks utility towards zero by min(0.9, pull × this). */
  abstainDampen: 3,
  /** Low-interest members (no party whip) abstain unless |utility| exceeds this. */
  lowInterestThreshold: 0.6,
} as const;

export const LOBBY = {
  /** Base pressure per lobbying action on one target (scaled by receptiveness and skills). */
  base: 0.05,
  /** Rebellion recruitment pressure on allies (trust ≥ 20). */
  recruit: 0.1,
  /** Whip operation pressure per session on a waverer (scaled by whip intrigue). */
  whipOperation: 0.04,
  /** How many waverers each whip leans on per week. */
  whipTargets: 10,
} as const;
