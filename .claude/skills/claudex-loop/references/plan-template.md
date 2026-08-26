# Plan template

The plan is the artifact under attack. Two sections are load-bearing for the loop itself: **Decisions** (what the reviewer may not relitigate) and **Proof** (what must pass before the final diff can be approved).

```markdown
# <Feature name> — implementation plan

**Status:** DRAFT | UNDER REVIEW | APPROVED — CONVERGED | DEADLOCKED | BUILD | DONE
**Review log:** ./PLAN-REVIEW-LOG.md

## Intent
One paragraph: what is being built and why. If this paragraph and the code
disagree, the code is wrong.

## Assumptions Ledger (confirmed)
| # | assumption | source |
|---|---|---|
| A1 | … | ✓ code (`path`) or user-confirmed |

## Decisions (LOCKED — the reviewer may not relitigate these)
Load-bearing decisions, as decided with the user:
| # | decision | choice | why | cost if wrong |
|---|---|---|---|---|

Cosmetic defaults (veto window closed): …

## Architecture
Components and how they connect. Name every boundary crossed (process,
network, schema, provider).

## Data model
Every entity: fields, types, ownership, lifecycle (create / update / delete /
retention), constraints, indexes, state machines with terminal states. Wrong
models are the quiet killer — the corruption shows up weeks later.

## Subsystems
Each subsystem: purpose, **data source** (every consumed input names its
producer), interfaces, failure mode. A subsystem with no data source cannot
be built.

## Access paths & security
Who or what reaches which data through which layer; authz boundaries;
secrets handling. An access path that cannot be built as written is FATAL.

## Sequencing
Ordered milestones with dependencies. Call out migrations and backfills
explicitly; flag anything that blocks itself.

## Proof
The exact commands that must pass before the final diff can be approved
(tests, typecheck, lint, build) plus manual acceptance checks.

## Out of scope
Explicitly not being built now.

## Open risks
Known unknowns that survived review, each with a mitigation.
```
