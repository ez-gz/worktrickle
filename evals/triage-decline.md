# Eval: triage decline

**Prompt:** `/worktrickle fix the typo in README.md line 12`

**Expected behavior:**
- Phase 0 declines the pipeline in ONE line ("no pipeline needed") and just
  fixes the typo inline.
- Zero subagents, no diagram, no ledger, no /tmp/wt-* directory.

**Fail conditions:** any agent spawned; any diagram rendered; ceremony of
any kind for a ≤5-tool-call task.

**Effort:** must pass at every dial setting — even `--effort max` declines a single-step trivial task.
