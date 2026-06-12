# Headroom integration runbook

[headroom](https://github.com/chopratejas/headroom) (`pip install
"headroom-ai[all]"`, Python 3.10+) is a local compression proxy: it
intercepts API traffic and compresses what flows through it — SmartCrusher
for large JSON tool results, an AST-aware CodeCompressor, a CacheAligner that
stabilizes prefixes for cache hits, and reversible CCR compression with local
storage. Its docs claim **60–95% token reduction** on tool-heavy workloads
(92% on code-search and SRE-debugging benchmarks).

**Why it composes with worktrickle instead of replacing it:** headroom
compresses what comes *back from tools* (inputs to the model); worktrickle's
contracts cap what agents *generate* (outputs) and what the skill *spawns*
(fanout). Different waste streams — run both. With headroom active, even
`--effort max` runs get tool-result compression for free.

## How it attaches (and why the skill can't do it for you)

`headroom wrap claude` starts the proxy (port 8787) and launches Claude Code
with `ANTHROPIC_BASE_URL` pointed at `http://127.0.0.1:8787`, plus
`HEADROOM_PROJECT` for per-project savings attribution and
`ENABLE_TOOL_SEARCH=true`. The base URL is read once at process start —
**a running session's traffic cannot be re-routed**, by the skill or anyone
else. Headroom is a launch-time decision.

## Detection (run at setup, costs 1–2 cheap Bash calls)

In order; first hit wins:

1. `test -n "$HEADROOM_PROJECT"` ⇒ active.
2. `test -n "$ANTHROPIC_BASE_URL"` and it contains `127.0.0.1`/`localhost`
   ⇒ probe `curl -sf http://127.0.0.1:8787/health` ⇒ active if it answers.
3. Otherwise ⇒ not active.

Active ⇒ append `headroom on` to the diagram budget footer and write one
ledger line: `headroom | on | — | — | proxy compression active`. Nothing
else changes — caps and tiers stay per the dial.

## `--headroom` passed but proxy NOT active

Do not block, do not try to start the proxy (useless for this session).
Report once, before the approval gate, in exactly this shape:

```
wt: --headroom requested but no proxy detected. This session's traffic
    can't be re-routed mid-flight. To get headroom on the next run:
      pip install "headroom-ai[all]"   # once; needs Python 3.10+
      headroom wrap claude             # relaunch Claude Code wrapped
    Continuing this run without it.
```

Then fold the choice into the approval gate: **Approve and run (no
headroom) / Cancel — I'll relaunch wrapped.** If `command -v headroom`
shows it's already installed, drop the pip line from the message.

## Caveats (from headroom's own docs)

- Local process required — sandboxed environments that can't run one are out.
- First run downloads runtime assets (ONNX Runtime, a HuggingFace model) —
  needs TLS access or offline pre-configuration.
- Savings are workload-dependent: tool-heavy runs (big greps, file reads,
  JSON-emitting tools) see the high end; chat-only runs see little.
- `headroom perf` shows measured savings — quote it in the final report when
  the proxy was active.
