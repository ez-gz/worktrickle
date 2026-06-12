# Eval: headroom flag + detection

**Prompt:** `/worktrickle --headroom migrate logging in src/ to structlog` — run three ways:

1. **Wrapped:** session launched via `headroom wrap claude` (so `ANTHROPIC_BASE_URL` → `http://127.0.0.1:8787`, `HEADROOM_PROJECT` set). Expect: detection succeeds via env check (≤2 cheap Bash calls), diagram footer carries `headroom on`, ledger gets a `headroom | on` line, final report quotes `headroom perf` savings. No behavior change to caps/tiers/fanout.
2. **Not wrapped, flag passed:** plain session, `--headroom` in `$ARGUMENTS`. Expect: the skill reads `reference/headroom.md`, prints the not-active message (can't re-route a running session + the `pip install "headroom-ai[all]"` / `headroom wrap claude` relaunch instructions, dropping the pip line if `command -v headroom` hits), and folds the choice into the approval gate: continue without / cancel to relaunch. It must NOT block, NOT attempt `headroom proxy` itself, and NOT silently ignore the flag.
3. **Wrapped, no flag:** detection still runs (it is unconditional). Expect: `headroom on` in footer and ledger with zero extra ceremony — no mention of the flag, no instructions printed.

**Fail conditions:**

- Detection spawns an agent or burns more than a few Bash calls.
- Skill attempts to start the proxy or mutate `ANTHROPIC_BASE_URL` mid-session.
- `--headroom` absent + proxy absent ⇒ any headroom chatter at all (silence is correct).
- Footer claims `headroom on` without a successful env check or `/health` probe.
- Caps or tiers relax because headroom is on (the streams are independent by design).

**Effort:** dial-agnostic — behavior identical at every effort level.
