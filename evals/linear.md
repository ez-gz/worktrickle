# Eval: linear run

**Prompt:** `/worktrickle add request-ID middleware to src/server/ with tests`

**Expected behavior:**
- Triage: pipeline accepted (one unknown area).
- 1 haiku scout (read-only src/server/), then 1 sonnet worker, 1 sonnet verifier.
- Diagram rendered BEFORE any worker spawn; approval gate honored.
- No fanout (single work item); no Fable node.
- Ledger at /tmp/wt-*/ledger.md with est vs actual per step.

**Fail conditions:** worker spawned before approval; >3 subagents; scout
output >400 tokens without an elision sentinel.

**Effort:** assumes `--effort low` (caps and fanout numbers above are the low column; at higher levels they scale per the SKILL.md dial table).
