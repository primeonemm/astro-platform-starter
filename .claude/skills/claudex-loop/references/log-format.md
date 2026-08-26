# PLAN-REVIEW-LOG.md — format

Append-only. It lives beside the plan and is the permanent record of the argument: every finding, every rejection with its reasoning, every revision. Never rewrite past rounds — the why is kept forever.

## Header (written once)

```markdown
# Plan Review Log — <feature>

- **Plan:** <path>
- **Reviewer:** OpenAI Codex (`codex exec`, read-only sandbox)
- **Builder (phase 3):** unset | codex | claude
- **MAX_ROUNDS:** 5
- **Started:** <YYYY-MM-DD>
```

If the user opted into the fallback reviewer, the Reviewer line must say so:
`Reviewer: same-provider fallback (fresh context) — weaker independence guarantee`.

## Per round

```markdown
## Round <N> — codex

**Verdict:** REVISE | APPROVED — CONVERGED
**Findings:** <count> (<f> fatal / <h> high / <m> medium / <l> low)

### <N>.<i> [FATAL] <one-line title>
> The finding, condensed but faithful; quote the reviewer where the wording matters.
**Arbitration:** ACCEPTED — <the revision made, naming the plan section> | REJECTED — <the counter-argument>
```

## Outcome (written once, at the end of phase 2)

```markdown
## Outcome

**CONVERGED** after <N> rounds | **DEADLOCK** at MAX_ROUNDS=<N> — open findings: <list>
Findings per round: 26 → 15 → 12 → 2 → 0
Fatal: <n> · Accepted: <n> · Rejected: <n>
Product decisions touched: none — every locked decision survived (or list what the user re-decided)
```

## Build review (phase 3, if run)

Same structure with `## Build round <N> — <reviewer>` headings — findings graded against the locked plan, arbitrated and logged — and it closes with:

```markdown
**Proof:** <commands run and their result>
**Final diff approved by user:** <YYYY-MM-DD>
```

## Example round (abridged)

```markdown
## Round 1 — codex

**Verdict:** REVISE
**Findings:** 3 (1 fatal / 1 high / 1 medium)

### 1.1 [FATAL] Private-schema access path cannot be built as written
> The plan queries the `private` schema through the service_role client, but the API layer
> as specified never exposes that schema; the access path does not exist.
**Arbitration:** ACCEPTED — Data model §3: tables moved to an exposed schema behind RLS; access path rewritten.

### 1.2 [HIGH] `payments.status` has no terminal state for refunds
> The refund flow writes a status the state machine never defines; rows will be stranded.
**Arbitration:** ACCEPTED — state machine extended with `refunded` terminal state (§4).

### 1.3 [MEDIUM] Nightly rollup has no data source
> The rollup subsystem consumes `events_daily`, which nothing in the plan produces.
**Arbitration:** REJECTED — `events_daily` is produced by the existing cron in `jobs/rollup.py:14`; verified in-repo.
```
