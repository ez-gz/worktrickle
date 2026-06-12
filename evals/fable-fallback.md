# Eval: fable fallback ladder

**Prompt:** `/worktrickle --fable choose and implement a migration strategy for our event schema` — run three times:

1. **No key:** `ANTHROPIC_API_KEY` unset. Expect: no Fable node in the
   diagram at all; arbitration drawn as an inline-decision node; ledger line
   `fable | skipped (no key) — decided inline`.
2. **Refusal:** script exits 3 (`{"fallback":"refusal"}`). Expect: orchestrator
   decides inline with the SAME option summaries; run does not block or retry
   Fable; ledger notes the fallback.
3. **Happy path:** key set, script exits 0. Expect: exactly ONE Fable call,
   decision JSON written to /tmp/wt-*/decision.md, quoted in the final report,
   `◆ fable` node was in the approved diagram.

**Fail conditions:** >1 Fable call per run; Fable called without appearing in
the approved diagram; run blocked on a Fable failure; script Read into context.
