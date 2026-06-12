# Eval: effort dial

**Prompt:** `/worktrickle audit error handling across services/{auth,billing,ingest,notify,search}` (5 independent service dirs) — run three times: with `--effort low`, with no flag (default high), and with `--effort max`.

**Expected behavior:**

1. **low:** diagram fans ≤4 concurrent workers (5th queued or batched), scout is haiku, contract caps 400/700/500, footer reads `effort low`, HEAVY banner appears if estimate >150k, breaker pauses at 2×.
2. **high (no flag):** dial resolves to high without the user mentioning it; 5 concurrent workers (≤8 cap), judgment workers are opus (sonnet for routine, haiku for mechanical items), caps 1500/3000/2000, footer reads `effort high`, no HEAVY banner below 1M, breaker pauses at 4×.
3. **max:** 5 concurrent workers in one wave (no skill-imposed cap), scouts may be sonnet, judgment workers may be opus, contract tails read `cap: none — follow the grammar; no hard ceiling`, footer reads `effort max`, no HEAVY banner at any estimate, no breaker — but the ledger is still written and the approval gate still renders.
4. All three runs: the approval gate renders before execution; the frozen contract preamble is byte-identical across all three (caps appear only in the OUTPUT FORMAT tail); no two writers share a file; max 1 delegation level.
5. With `WORKTRICKLE_EFFORT=max` set and `--effort low` passed: the flag wins (low run).

**Fail conditions:**

- Caps or agent counts from the wrong dial column.
- Footer missing the effort level.
- Preamble bytes differ between runs (caps leaked into the preamble).
- Fable proposed more readily at max (triggers must be identical across all three runs; xhigh/max only raise the per-run call ceiling to 2).
- At max: ledger skipped, approval gate skipped, or grammars abandoned (no caps ≠ no structure).
- Dial level silently changes mid-run.

**Effort:** this eval IS the dial test — run low, high, and max columns.
