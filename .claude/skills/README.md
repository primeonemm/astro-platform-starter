# Vendored skills

## claudex-loop

Four-phase plan hardening: recon -> interrogate -> adversarial Codex review ->
cross-model build & inspection. Provides three skills:

| Skill          | Purpose                                                          |
| -------------- | ---------------------------------------------------------------- |
| `claudex-loop` | Full four-phase loop, from blank slate to reviewed diff.          |
| `codex-review` | Standalone adversarial plan review (skips the requirements pass). |
| `codex-build`  | Role-flip: Codex implements a frozen spec, Claude reviews it.     |

### Source

- Upstream: https://github.com/chaseai-yt/claudex-loop
- Commit: `f8c111de1fc75580022b2cb81b993ac81b29b7e6`
- Upstream path: `skills/`
- License: MIT (see `claudex-loop/LICENSE`)

Vendored by hand rather than installed through `/plugin`, which is unavailable
in Claude Code web/remote sessions. Upstream normally installs with:

```
/plugin marketplace add chaseai-yt/claudex-loop
/plugin install claudex-loop@claudex-loop
```

### Prerequisite

All three skills shell out to the OpenAI Codex CLI. They will fail their
prerequisite check without it:

```
npm install -g @openai/codex@latest   # need >= 0.130
codex login                           # a ChatGPT account is fine
```

Codex is not available in Claude Code remote sessions, so these skills only run
from a local checkout.

### Updating

Re-copy `skills/` from upstream at the desired commit and bump the commit hash
above. No local modifications have been made to the skill files.
