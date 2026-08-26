---
description: Claudex Loop — recon, interrogate, Codex attacks the plan, optional cross-graded build
argument-hint: <feature to plan, or path to an existing plan>
---

Run the full Claudex Loop on: $ARGUMENTS

Invoke the `claudex-loop` skill and follow it end to end. If $ARGUMENTS is a path to an existing plan file, treat it as the draft plan (Phase 0 still validates it); if $ARGUMENTS is empty, ask what to plan. Honor a round count if the user gave one (default MAX_ROUNDS=5).
