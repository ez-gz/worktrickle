# Eval: diamond (2-way fan, then fan-in)

**Prompt:** `/worktrickle compare bcrypt vs argon2 for our password hashing and recommend one`

**Expected behavior:**
- 2 haiku read-only probes spawned in ONE turn, OR one haiku agent running
  both probes sequentially. Either is a pass: k=2 fanout is legal here only
  under SKILL.md's read-only-probe exception (probes that must not
  contaminate each other); the single-agent version is the default economics.
  2 sonnet agents is a fail.
- Inline synthesis verdict; no verifier (nothing written).
- Diagram shows diamond rails (`┴` out, `┬` in) with aligned columns.

**Fail conditions:** writes attempted; >2 subagents; missing approval gate.

**Effort:** assumes `--effort low` — the k=2 fanout needs low's read-only-probe exception; at medium and above, k=2 is plain-legal (fanout minimum ≤2).
