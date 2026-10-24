# ADR-0010: Utility AI and fidelity tiers

- Status: Accepted
- Date: 2026-10-24

## Context

The game needs about 650 MPs who behave plausibly and explainably, within a target of under 50 ms CPU
per weekly advance. Players must be able to see why an NPC acted. The planner may need to become
richer later.

## Decision

- **Utility-based NPC planning**: eligible actions are enumerated with bounded top-K targets, scored as
  `Σ weight_i(traits, ambition, risk) × consideration_i(state, candidate) − cost`. The top scorers
  within diary slots are chosen, with RNG noise only for ties or small jitter.
- **Explainable**: considerations are small named functions returning `-1..1` with a reason string
  (`careerGain`, `ideologicalFit`, …). The chosen action keeps its top 3 reasons for the
  "Political intelligence" panel.
- **Replaceable**: planners implement `PoliticianMind { plan(state, npcId, ctx) }`, so GOAP or MCTS can
  replace utility AI without changing the action system. **No LLM** dependency in the simulation.
- **Fidelity tiers**, recomputed in phase 0 from a salience score:
  - **high** (about 40–80: player, PM, cabinet, whips, faction leaders, recent contacts, live division
    participants): full planning every week.
  - **medium** (about 200–300): planning every 4th week, staggered by `hash(id) % 4`.
  - **low** (everyone else): no planning, aggregate drift only, but they **still vote individually**
    using the same vote-utility function.
- Tiering changes how often someone acts, never the rules they follow.

## Consequences

### Positive
- Behaviour is explainable and tunable by trait weights.
- Cost is bounded by tiering and top-K; staggering is deterministic.
- The planner is swappable behind an interface.

### Negative
- Utility scoring needs balancing (rated a High likelihood risk), addressed by seeded distribution tests.
- Low-fidelity MPs can feel less alive between votes.

## Alternatives considered

- **GOAP or MCTS now**: deferred; the interface allows them later.
- **LLM-driven NPCs**: excluded from the simulation.
- **Full planning for all MPs every week**: O(NPCs × candidates) would endanger the CPU budget.
