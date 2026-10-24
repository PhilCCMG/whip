# ADR-0000: Record architecture decisions

- Status: Accepted
- Date: 2026-10-24

## Context

WHIP is a greenfield project with a set of architecture documents in `docs/architecture/`. Those
documents describe the whole design, but they do not say why each significant choice was made or
what was rejected, and they will change as the code evolves. Decisions that need product-owner
approval (persistence, auth, API, deployment topology) need a place where they can be reviewed and
approved one at a time.

## Decision

We record significant architecture decisions as lightweight ADRs in `docs/decisions/`, using a
MADR-style format. Files are named `NNNN-short-title.md`, numbered sequentially from 0000.

Template:

```markdown
# ADR-NNNN: Title

- Status: Proposed | Accepted | Superseded by ADR-XXXX
- Date: YYYY-MM-DD

## Context
## Decision
## Consequences
### Positive
### Negative
## Alternatives considered
```

Rules:
- One decision per ADR, kept short (roughly 30–70 lines).
- ADRs the product owner must approve start as "Accepted (approved 2026-10-24)" and change to
  "Accepted" once approved.
- An accepted ADR is not edited to change its decision. A new ADR supersedes it and the old one's
  status is updated to point at the new one.
- `README.md` in this directory is the index and is updated with every new ADR.

## Consequences

### Positive
- The rationale and rejected options survive beyond the architecture documents.
- Approval of risky decisions is explicit and traceable.

### Negative
- Small ongoing overhead to write and index each ADR.

## Alternatives considered

- **Architecture documents only**: no per-decision status or history of reversals.
- **Wiki or issue tracker**: drifts away from the code and is not reviewed with it.
