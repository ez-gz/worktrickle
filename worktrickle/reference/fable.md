# Fable escalation runbook

Fable 5 (`claude-fable-5`) is not in the Claude Code subscription but is the
best available judgment. worktrickle uses it the only economical way: **one
tiny, high-leverage decision per run, by direct API call.** $10/$50 per MTok;
the call below is ≤2k in, and output (thinking tokens bill as output and are
bounded by `max_tokens: 8000`) is typically ~1k ≈ **$0.07 typical, ~$0.42
worst case** — the answer JSON itself is tiny; thinking is the variable.

## Triggers — exactly two, nothing else ever calls Fable

1. **Plan arbitration.** Scouting revealed ≥2 genuinely viable approaches AND
   the choice is expensive to reverse (architecture, migration strategy, API
   shape). Draft both candidates as ≤150-word summaries; Fable picks.
2. **Final-design adjudication.** Verifier and implementation disagree on a
   design-level point the orchestrator can't resolve with evidence.

**Hard cap: one Fable call per run** at low/medium/high effort; xhigh and max
permit each trigger to fire once (max two calls). The triggers themselves
never loosen with the dial — the dial scales included-model spend, Fable is
metered dollars. Every call appears in the approved diagram as a `◆ fable`
node — never a surprise charge. `--fable` pre-authorizes but it is still
drawn.

## Mechanics

1. Write the question to `/tmp/wt-<run>/fable-q.json`:

```json
{
  "task": "<one-line task statement>",
  "option_a": "<=150-word summary",
  "option_b": "<=150-word summary",
  "constraints": ["<=5 bullets", "..."]
}
```

2. Execute (never Read the script — only its output enters context). Invoke
   it via this skill's actual directory — the directory you loaded SKILL.md
   from:

```
bash <this skill's directory>/scripts/fable_arbitrate.sh /tmp/wt-<run>/fable-q.json
```

3. Exit codes:

| Exit | Meaning | Stdout |
|---|---|---|
| 0 | Decision made | `{"decision":"A"\|"B","rationale":"...","risks":[...]}` |
| 2 | Error: no key / payload >12KB / network / non-200 / truncated (`max_tokens`) / malformed JSON | `{"fallback":"<reason>"}` |
| 3 | Fable safety refusal (`stop_reason: "refusal"`, HTTP 200) | `{"fallback":"refusal"}` |

## API rules the script enforces (do not "fix" them)

- `thinking` param **omitted entirely** — always-on for Fable; explicit
  `disabled` is a 400.
- `temperature` / `top_p` / `top_k` omitted — unnecessary for a constrained
  pick, and sampler params are restricted on newer thinking models.
- `output_config: {"effort": "high"}`, `max_tokens: 8000` — adaptive thinking
  counts against `max_tokens` (no `budget_tokens` on Fable), so the ceiling
  must leave room for thinking plus the answer.
- Payload file >12 KB (≈3k tokens) ⇒ refuses to send. Small input is the
  whole point — trim the option summaries, never raise the guard.
- `stop_reason` checked before content is read: `"refusal"` ⇒ exit 3,
  `"max_tokens"` ⇒ `{"fallback":"truncated"}`, exit 2.

## Graceful degradation ladder (check in order)

1. `ANTHROPIC_API_KEY` unset ⇒ don't mention Fable in the diagram at all; the
   arbitration renders as an inline-decision node instead.
2. Script exit ≠ 0 (network, 4xx/5xx, refusal) ⇒ make the same A/B decision
   **inline with the session model**, using the identical option summaries
   already drafted. The run never blocks on Fable.
3. JSON parse failure on the decision ⇒ same inline fallback.

Every fallback gets a ledger line: `fable | skipped (<reason>) — decided inline`.

## Decision artifact

Whoever decided (Fable or inline), write the decision + rationale + risks to
`/tmp/wt-<run>/decision.md`, pass its path into downstream worker contracts
that depend on it, and quote it in the final report.
