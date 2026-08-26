# Driving the OpenAI Codex CLI

The reviewer is `codex`, OpenAI's coding agent CLI — a rival lab's model, which is the point: cross-provider review means nothing to defend.

## Install & auth

- Install: `npm install -g @openai/codex` (or `brew install codex`)
- Interactive machines: `codex login` (ChatGPT account sign-in)
- Headless / CI / cloud sessions: `codex login --api-key <key>`, or set `OPENAI_API_KEY` in the environment. For claude.ai/code remote sessions, add `OPENAI_API_KEY` to the environment's variables in its settings.
- Smoke test: `codex exec --sandbox read-only "reply with exactly: OK"`

## The calls this skill makes

One review round (wrapped by `scripts/codex-round.sh`):

    codex exec --sandbox read-only --output-last-message <file> "<attack prompt>"

Continuing the same session for memory across rounds (the script tries this for round > 1):

    codex exec resume --last --sandbox read-only --output-last-message <file> "<attack prompt>"

Phase 3 with Codex as builder (only after user sign-off, on an isolated branch):

    codex exec --sandbox workspace-write --full-auto "Implement the plan at <path>, exactly as written."

## Flags that matter

| flag | effect |
|---|---|
| `exec` | non-interactive run; never prompts for approval |
| `--sandbox read-only` | may read the repo and run read commands; cannot write files |
| `--sandbox workspace-write` | may write inside the workspace; network stays off by default |
| `--output-last-message <f>` | writes the agent's final message to a file (what the script captures) |
| `resume --last` / `resume <id>` | continue a previous `exec` session |
| `-m <model>` | model override — the script forwards `CLAUDEX_CODEX_MODEL` if set |
| `-C <dir>` | run against another directory |

## Behavior notes

- Rounds routinely take 1–5 minutes. Use a generous Bash timeout (up to 600000 ms) or run in the background.
- Read-only is not a limitation, it is a feature: the reviewer can verify the plan's claims against the actual codebase instead of taking the plan's word for it.
- The CLI evolves. If a flag is rejected, check `codex exec --help` and adapt; the script already falls back from `resume` to a fresh session, and the review log fed into every prompt carries the memory either way.

## Troubleshooting

- `codex: command not found` → install per above (the script exits 2 with the same hint).
- Auth errors → `codex login` locally; `OPENAI_API_KEY` or `codex login --api-key` headless.
- `resume` unsupported (older CLI) → harmless; fresh sessions plus log-as-memory are equivalent for this loop.
- Very large plans/logs → the prompt is passed as one argument; if the shell complains about length, trim the log to the last two rounds plus the Outcome-relevant open findings (never trim silently — note it in the log).
