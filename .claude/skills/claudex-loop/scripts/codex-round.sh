#!/usr/bin/env bash
# claudex-loop · one adversarial review round against the OpenAI Codex CLI.
#
#   codex-round.sh --plan PATH --round N [--max N] [--log PATH]
#                  [--mode plan|diff] [--diff PATH] [--out PATH] [--fresh] [--dry-run]
#
# plan mode: Codex attacks the plan.  diff mode: Codex grades a diff against the locked plan.
# --fresh forces a new Codex session (phase 3 requires it when Claude built).
# --dry-run prints the assembled attack prompt and exits without calling codex
#           (also usable as the prompt for an explicitly opted-in fallback reviewer).
#
# exit codes: 0 = reviewer output on stdout · 2 = codex CLI missing · 3 = codex run failed

set -u

PLAN="" LOG="" ROUND="" MAX="5" MODE="plan" DIFF="" OUT="" FRESH=0 DRY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --plan) PLAN="$2"; shift 2 ;;
    --log) LOG="$2"; shift 2 ;;
    --round) ROUND="$2"; shift 2 ;;
    --max) MAX="$2"; shift 2 ;;
    --mode) MODE="$2"; shift 2 ;;
    --diff) DIFF="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    --dry-run) DRY=1; shift ;;
    *) echo "codex-round.sh: unknown argument: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$PLAN" ] || [ -z "$ROUND" ]; then
  echo "usage: codex-round.sh --plan PATH --round N [--max N] [--log PATH] [--mode plan|diff] [--diff PATH] [--out PATH] [--fresh] [--dry-run]" >&2
  exit 1
fi
[ -f "$PLAN" ] || { echo "codex-round.sh: plan not found: $PLAN" >&2; exit 1; }
if [ "$MODE" = "diff" ] && [ ! -f "${DIFF:-/nonexistent}" ]; then
  echo "codex-round.sh: --mode diff requires --diff PATH (an existing file)" >&2
  exit 1
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT
[ -n "$OUT" ] || OUT="$WORKDIR/last-message.txt"
PROMPT_FILE="$WORKDIR/prompt.txt"

{
  if [ "$MODE" = "diff" ]; then
    cat <<EOF
You are the adversarial reviewer in a cross-model loop. The plan below is LOCKED and was already hardened. Another model implemented it; you are grading the finished diff. You never modify files — report findings only. You have read-only access to the repository: verify claims against the actual code, do not take the diff's word for it.

ROUND $ROUND of $MAX.

ATTACK SURFACE
- Divergence: anything the diff does that the plan does not say, or the plan requires that the diff does not do.
- Correctness: bugs, unhandled failure modes, broken contracts, data-model violations.
- Security: authz gaps, injection, secrets handling, unsafe defaults.
- Proof: acceptance criteria in the plan's Proof section that the diff cannot satisfy.
EOF
  else
    cat <<EOF
You are the adversarial reviewer in a cross-model plan-hardening loop. Another model wrote the implementation plan below; your job is to attack it. You never modify files — report findings only. You have read-only access to the repository: verify the plan's claims against the actual code where possible.

ROUND $ROUND of $MAX.

ATTACK SURFACE
- Feasibility: contradictions that make the plan unbuildable as written (these are FATAL).
- Data models: anything wrong or underspecified enough to corrupt, strand, or lose data later.
- Missing subsystems: any consumed data with no producer, any component with no owner or data source.
- Access paths: auth boundaries, schema access, API contracts that cannot work as described.
- Sequencing: milestones that block themselves or hide a migration/backfill.
- Security and operations: holes, failure modes, rollout gaps.
EOF
  fi

  cat <<EOF

RULES OF THE FIGHT
- Product decisions in the plan's "Decisions" section are LOCKED. Do not relitigate them; flag one only if it is internally impossible or contradicts the rest of the plan.
- The plan was revised between rounds; fixes accepted from your earlier findings are part of it now — attack them too.
- If the review log shows one of your findings was REJECTED with reasoning, concede it or escalate with a stronger argument; do not repeat it unchanged.
- No praise, no summaries, no restating the plan. Findings only.

RESPONSE FORMAT — exactly this, nothing else:
FINDINGS:
1. [FATAL|HIGH|MEDIUM|LOW] <one-line title> — <what breaks, why, and where>
2. ...
If you cannot find anything materially wrong, write exactly: FINDINGS: none
VERDICT: REVISE        <- if there are any findings
VERDICT: APPROVED      <- only if FINDINGS is none

SEVERITY: FATAL = cannot be built/shipped as written. HIGH = breaks or corrupts data later. MEDIUM = will surface mid-implementation. LOW = worth fixing, not blocking.

=== THE PLAN (current revision) ===
EOF
  cat "$PLAN"

  if [ "$MODE" = "diff" ]; then
    printf '\n=== THE DIFF UNDER REVIEW ===\n'
    cat "$DIFF"
  fi

  printf '\n=== REVIEW LOG SO FAR ===\n'
  if [ -n "$LOG" ] && [ -f "$LOG" ]; then
    cat "$LOG"
  else
    echo "(round 1 — no log yet)"
  fi
} > "$PROMPT_FILE"

if [ "$DRY" -eq 1 ]; then
  cat "$PROMPT_FILE"
  exit 0
fi

if ! command -v codex >/dev/null 2>&1; then
  cat >&2 <<'EOF'
codex-round.sh: the OpenAI Codex CLI is not installed.
  install : npm install -g @openai/codex      (or: brew install codex)
  auth    : codex login                       (headless: codex login --api-key ... or export OPENAI_API_KEY)
EOF
  exit 2
fi

MODEL_ARGS=()
[ -n "${CLAUDEX_CODEX_MODEL:-}" ] && MODEL_ARGS+=(-m "$CLAUDEX_CODEX_MODEL")

run_fresh() {
  codex exec --sandbox read-only --output-last-message "$OUT" \
    ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} "$(cat "$PROMPT_FILE")" >&2
}
run_resume() {
  codex exec resume --last --sandbox read-only --output-last-message "$OUT" \
    ${MODEL_ARGS[@]+"${MODEL_ARGS[@]}"} "$(cat "$PROMPT_FILE")" >&2
}

if [ "$FRESH" -eq 0 ] && [ "$ROUND" -gt 1 ]; then
  if ! run_resume; then
    echo "codex-round.sh: resume failed; starting a fresh session (the log carries memory)" >&2
    run_fresh || { echo "codex-round.sh: codex run failed" >&2; exit 3; }
  fi
else
  run_fresh || { echo "codex-round.sh: codex run failed" >&2; exit 3; }
fi

if [ ! -s "$OUT" ]; then
  echo "codex-round.sh: no reviewer output captured" >&2
  exit 3
fi
cat "$OUT"
