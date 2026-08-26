---
name: claudex-loop
description: Adversarial plan hardening — "claudex this plan". Claude scouts the codebase, locks intent with the user through load-bearing questions, then OpenAI Codex (a rival lab's coding agent) attacks the plan in read-only review rounds until it converges or a deadlock is flagged; every finding, rejection, and revision is logged to PLAN-REVIEW-LOG.md. Optional build phase where one model implements and the rival grades the diff. Use when the user says "claudex" anything, asks to harden, pressure-test, or adversarially review a plan or spec before building, or wants cross-model review of a plan or a diff.
---

# Claudex Loop — plan hardening

One rule holds everywhere: **whoever wrote it never grades it.** Claude writes the plan → Codex attacks it. Codex builds → Claude reviews. Claude builds → a fresh Codex session inspects. A model reviewing its own output has the same blind spots that produced the output; a rival model has nothing to defend.

The user enters at exactly four points — everything else runs without them:

1. Confirm the Assumptions Ledger (one reply).
2. Answer the load-bearing questions (one at a time).
3. Veto the cosmetic defaults (one batched reply).
4. Sign off on the hardened plan — always before any code.

Escape hatch, honored at any moment: **"accept all remaining recommendations"** ends all questioning and takes every committed recommendation.

Honesty rules (non-negotiable):

- A flagged deadlock beats a fake approved. Never soften findings, never claim convergence that did not happen.
- Every finding, every rejection with its reasoning, every revision goes in the log. The log is the argument, kept forever.
- The user signs off before any code is written. Phase 3 never starts on its own.

## Files in this skill

| file | purpose |
|---|---|
| `references/plan-template.md` | required plan structure (the Decisions and Proof sections are load-bearing) |
| `references/log-format.md` | PLAN-REVIEW-LOG.md format, with an example round |
| `references/codex-cli.md` | installing and driving the Codex CLI: flags, headless auth, troubleshooting |
| `scripts/codex-round.sh` | runs one adversarial round (handles session resume, fallbacks, missing codex) |

## Entry points

- Feature described in chat → start at Phase 0.
- Existing draft plan (a path or pasted text) → Phase 0 recon validates it; its implicit assumptions feed the ledger; continue normally from there.
- `/claudex-review <plan>` or "review this plan" on a finished plan → minimal recon (enough to arbitrate findings against the codebase), then straight to Phase 2.
- `/claudex-build <plan>` on an APPROVED plan → Phase 3.
- MAX_ROUNDS defaults to 5; the user can override it ("claudex this plan, 8 rounds").

## Phase 0 — RECON (scout before asking)

Never ask a question the code already answered.

1. Parse the ask into a one-line feature statement.
2. Codebase recon: search for what already exists — schema and migrations, stack and frameworks, auth model, prior or adjacent implementations of anything the feature touches, project conventions. Record findings with file paths.
3. Greenfield or novel domain (nothing relevant in the repo): offer the research gate with AskUserQuestion — **Skip** / **Quick** (a few targeted web searches for prior art and known pitfalls) / **Deep** (subagent research). The user picks the depth.
4. Build the **Assumptions Ledger**: numbered A1…An, one falsifiable assumption per line, each marked:
   - `✓ verified` — proven from code or config (cite the path). Stated, not asked.
   - `● inferred` — needs the user's confirmation.
5. Present the ledger: "Confirm all in ONE reply — or correct any line." (Entry point 1.)

## Phase 1 — INTERROGATE (only the questions that matter)

Every question must justify its existence.

1. Draft the **Decision Map**: every open decision the plan needs, classified.
   - **LOAD-BEARING** — hard to undo later: schema forks, money models, auth/tenancy, data lifecycle and retention, external contracts, system-of-record choices.
   - **COSMETIC** — changeable in an afternoon: naming, ordering, defaults, styling.
   The test: if we guess wrong, is the fix a rebuild or an edit?
2. Ask load-bearing questions **one at a time** with AskUserQuestion. Each must carry:
   - **WHY IT MATTERS** — one line
   - **RECOMMENDATION** — committed, not a menu; listed first and marked "(Recommended)"
   - **IF WE GUESS WRONG** — the concrete cost
   (Entry point 2.)
3. Cosmetic decisions: one batched message of committed defaults, veto-by-exception — "these are the defaults unless you object." (Entry point 3.)
4. Write the plan using `references/plan-template.md`. Location: beside an existing plan file if one was given; otherwise `docs/plans/<slug>/PLAN.md`. Product choices go in the **Decisions** section — locked; the reviewer may not relitigate them.

## Phase 2 — REVIEW (Codex attacks the plan)

The rules of the fight:

- Read-only sandbox — Codex never touches a file.
- Memory — the same Codex session is resumed where possible, and the full review log is fed back every round regardless; it remembers every finding either way.
- It attacks its own accepted fixes — the revised plan is fair game in full.
- Claude arbitrates — every finding is ACCEPTED (plan revised) or REJECTED (counter-argument logged).
- MAX_ROUNDS cap — a deadlock is flagged, never faked.

Procedure — for round R = 1…MAX_ROUNDS:

1. Run one round (rounds can take minutes — use a generous Bash timeout, up to 600000 ms):

       bash <this-skill-dir>/scripts/codex-round.sh --plan <plan> --log <log> --round R --max MAX_ROUNDS

   The script exits 2 if the codex CLI is missing — see "If Codex is unavailable" below. `--dry-run` prints the assembled attack prompt without calling codex.
2. Parse `FINDINGS:` and `VERDICT:` from the output.
3. Arbitrate every finding on the merits — verify its claims against the actual codebase before deciding. ACCEPT → revise the plan now. REJECT → write the counter-argument. Never rubber-stamp in either direction.
4. Append the round to the log per `references/log-format.md`: verdict, each finding with severity, its arbitration, and what changed in the plan.
5. Stop when:
   - `VERDICT: APPROVED` → set the plan's Status to **APPROVED — CONVERGED**.
   - R = MAX_ROUNDS with findings still arriving → set Status to **DEADLOCKED**, list the open findings and their arbitration state in the log, and report it plainly.
6. Present the argument to the user (entry point 4): findings per round (e.g. 26 → 15 → 12 → 2 → 0), fatal count, the most important accepted fixes, every rejection and why, and the deadlock state if any. The user signs off — or redirects — before any code.

## Phase 3 — BUILD (optional — the models swap jobs)

Only after sign-off. Ask the user to pick the builder (AskUserQuestion). Isolate the build on a git branch (in managed/remote sessions, the session's designated branch).

**Codex builds** — full write access, gated hard:

1. `codex exec --sandbox workspace-write --full-auto "Implement the plan at <path>, exactly as written."` (details in `references/codex-cli.md`).
2. Claude reads **every line** of `git diff`, then runs the plan's **Proof** commands.
3. Claude's findings: fix directly when small and clear; otherwise arbitrate with the user.

**Claude builds**:

1. Implement the plan exactly as written.
2. A **fresh** Codex session — never `resume`, no shared context — grades the diff against the locked plan:

       git diff <base>... > /tmp/build.diff
       bash <this-skill-dir>/scripts/codex-round.sh --mode diff --plan <plan> --diff /tmp/build.diff --log <log> --round R --max MAX_ROUNDS --fresh

3. Arbitrate and log each finding (same log, `## Build round` sections); revise; repeat until the rival approves or a deadlock is flagged.

Either path ends the same way: the Proof commands pass, and **the user approves the final diff** before it lands on a shared branch.

## If Codex is unavailable

The cross-provider reviewer is the point — a same-model reviewer shares the blind spots that wrote the plan. When `codex` is missing or unauthenticated:

1. Say so, and give the fix: `npm install -g @openai/codex`, then `codex login` (headless: `codex login --api-key …` or set `OPENAI_API_KEY`). Details in `references/codex-cli.md`.
2. Offer, only as an explicit opt-in, the degraded fallback: a fresh-context Claude subagent running the same attack prompt (produce it with `--dry-run`). If the user accepts, the log header must record: `Reviewer: same-provider fallback (fresh context) — weaker independence guarantee`.

Never substitute silently.
