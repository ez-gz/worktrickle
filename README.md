# worktrickle

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-brightgreen)](https://gtarpenning.github.io/worktrickle/)

A Claude Code **skill** that plans and runs token-efficient multi-step
workflows with tiered subagents — ~95% of the Workflow tool's value at a
fraction of the tokens.

Marketing site and docs: **https://gtarpenning.github.io/worktrickle/**

## Install

### One-liner (curl)

```bash
curl -fsSL https://raw.githubusercontent.com/gtarpenning/worktrickle/main/install.sh | bash
```

### From a git clone

```bash
git clone https://github.com/gtarpenning/worktrickle
./worktrickle/install.sh
```

### Manual copy (no internet required)

```bash
cp -r worktrickle ~/.claude/skills/worktrickle
# or per-project:
cp -r worktrickle /path/to/project/.claude/skills/worktrickle
```

The installer copies `worktrickle/` to `~/.claude/skills/worktrickle`, backing up any previous install to `worktrickle.bak.<n>` so re-running is always safe. It never uses `sudo`.

Optional — for the Fable escalation step: `export ANTHROPIC_API_KEY=sk-ant-...` in the environment Claude Code runs in. Without it, worktrickle never proposes Fable.

## The pitch

Multi-agent orchestration burns ~15x the tokens of single-agent chat: every
spawned agent re-pays a large fixed context cost, intermediate outputs flow
back verbose, and orchestrators over-fan. worktrickle is a markdown playbook
(no runtime, no daemon) that makes the main Claude Code session the
orchestrator and claws the waste back with five levers:

- **Anti-fanout economics, on a dial** — one master effort knob mirroring
  Claude's own levels (`low | medium | high | xhigh | max`, default `high`)
  scales the fanout minimum, agent caps, and output caps. low: ≥3 independent
  file-disjoint items, 4 concurrent / 10 total. max: totally uncapped —
  built for Max-plan users. At every setting: 1 delegation level, never two
  writers on one file, and trivial tasks get no pipeline at all.
- **Model tiering** — Opus 4.8 implementors by default (at `high`+), tiering
  down to Sonnet for routine items and Haiku for scouts and mechanical work;
  the session model for inline planning/synthesis; Fable above it all for
  arbitration only.
- **Terse output contracts** — every delegation is a four-field contract with
  a rigid grammar and a dial-scaled hard cap (scouts 400–3000 tok, workers
  700–6000, verifier 500–4000; uncapped at `max`), with verbatim-preservation
  rules and filesystem-backed elision (full output to `/tmp` scratch, pointer
  in the report).
- **Prompt-cache-aware spawning** — one byte-identical contract preamble, no
  volatile bytes early, sibling spawns batched inside the 5-minute cache TTL.
- **Headroom-aware** — auto-detects the [headroom](https://github.com/chopratejas/headroom)
  compression proxy (60–95% claimed tool-token savings) and `--headroom`
  asserts it; see below.
- **Optional Fable escalation** — at most one tiny `claude-fable-5` API call
  per run (≈$0.07; two allowed at xhigh/max) for the highest-leverage
  decisions only (plan arbitration or final-design adjudication). Degrades
  gracefully to inline reasoning when `ANTHROPIC_API_KEY` is unset.

And the headline feature: **before anything executes, worktrickle renders an
ASCII diagram of the proposed workflow** — steps, fanout, model tier, and
token estimate per step, with a dollar budget — and blocks on your approval.
The approved diagram is the run's contract.

## Usage

```
/worktrickle migrate the logging layer in src/ to structlog
/worktrickle --fable redesign the plugin API          # pre-authorize Fable arbitration
/worktrickle --effort max audit the whole ingest pipeline    # uncapped — Max-plan mode
/worktrickle --effort low rename Config to Settings          # frugal mode
/worktrickle --headroom refactor services/                   # assert proxy compression
```

It also self-triggers when you ask Claude to "fan out", "orchestrate", or run
a "token-efficient workflow".

### The effort dial

One master knob mirroring Claude's own effort vocabulary:
`--effort low|medium|high|xhigh|max` (default `high`; set a session default
with the `WORKTRICKLE_EFFORT` env var). The reasoning: included-model tokens
(Haiku/Sonnet/Opus) are subscription tokens — nearly free — so higher levels
trade more of them for coverage, wider fanout, and looser output caps. At the
default `high`, judgment/implementation work runs on **Opus 4.8**, with
Sonnet and Haiku handling routine and mechanical items as fit. `low`
is the original strict mode; `max` removes the caps entirely (agents bounded
only by the harness, no output ceilings, no circuit breaker — the diagram,
approval gate, and ledger never turn off). On a Max plan, run `xhigh` or
`max` without guilt. **Fable spend never scales with the dial**: it stays
reserved for critical, hard-to-reverse decisions at every setting (xhigh/max
merely allow both of its named triggers to fire). The full per-parameter
table lives in `worktrickle/SKILL.md`.

### Headroom integration

[headroom](https://github.com/chopratejas/headroom) is a local proxy that
compresses tool results in flight (60–95% claimed savings on tool-heavy
work) — it attacks the waste stream worktrickle's contracts can't reach
(what comes *back* from tools, vs. what agents *emit*). Launch Claude Code
through it and worktrickle auto-detects it, marks `headroom on` in the
diagram footer, and quotes `headroom perf` savings in the final report:

```bash
pip install "headroom-ai[all]"   # needs Python 3.10+
headroom wrap claude             # launches Claude Code behind the proxy
```

`--headroom` asserts it: if the proxy isn't detected, worktrickle tells you
(a running session can't be re-routed) and offers to continue without or
cancel so you can relaunch wrapped.

## Example session

```
> /worktrickle migrate logging in src/ to structlog

wt: triage — multi-area write task, cold scope. Pipeline it.
    (run: wt-c7d1 · effort low)
wt: scouting src/ (1 haiku agent, read-only)...
wt: scout done — 312 call sites across api/, core/, jobs/; 2 viable
    strategies (compat shim vs big-bang). Proposing Fable arbitration.

╔════════════════════════════════════════════════════════════════╗
║ worktrickle: "migrate logging in src/ to structlog"            ║
╚════════════════════════════════════════════╤═══════════════════╝
                                             ▼
                                ┌─────────────────────────┐
                                │ scout                   │
                                │ haiku · ~10k            │
                                │ read-only src/          │
                                └────────────┬────────────┘
                                             │ [2 viable strategies]
                                             ▼
                                ┌─────────────────────────┐
                                │ plan: 3 partitions      │
                                │ inline · ~3k            │
                                └────────────┬────────────┘
                                             │ [user approval gate]
                                             ▼
                                ┌─────────────────────────┐
                                │ arbitrate strategy      │
                                │ ◆ fable · ~3k ($0.07)   │
                                │ shim vs big-bang        │
                                └────────────┬────────────┘
                 ┌───────────────────────────┼───────────────────────────┐
                 ▼                           ▼                           ▼
      ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
      │ worker: api/        │     │ worker: core/       │     │ worker: jobs/       │
      │ sonnet · ~19k       │     │ sonnet · ~19k       │     │ haiku · ~13k        │
      │ writes src/api/     │     │ writes src/core/    │     │ mechanical swap     │
      └──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘
                 └───────────────────────────┼───────────────────────────┘
                                             │ [3 reports ≤700 tok each]
                                             ▼
                                ┌─────────────────────────┐
                                │ verify                  │
                                │ sonnet · ~13k           │
                                │ sees diff+criteria only │
                                └────────────┬────────────┘
                                             ▼
                                ┌─────────────────────────┐
                                │ synthesize + ledger     │
                                │ inline · ~3k            │
                                └─────────────────────────┘

  legend: ◆ = direct Fable 5 API call (skipped if no ANTHROPIC_API_KEY)
  budget: ~86k est ≈ $0.31 (+$0.07 fable) · effort low · conc 3/4 · ledger: /tmp/wt-c7d1/

  Approve and run / Edit plan / Cancel?

> approve

wt: fable arbitration → decision: A (shim) — "reversible, ships behind a
    flag" (/tmp/wt-c7d1/decision.md)
wt: wave 1 — spawning 3 workers in one turn (cache-warm)...
wt: worker api/  DONE  (3 files, pytest tests/api -q: 41 passed)
wt: worker core/ DONE  (7 files, pytest tests/core -q: 88 passed)
wt: worker jobs/ DONE  (2 files, mechanical swap verified)
wt: verify → PASS.

## Final report
Strategy: compat shim (Fable-arbitrated). 312 call sites migrated across 12
files; all suites green; verifier PASS.

| step        | status | est  | actual≈ | note                    |
|-------------|--------|------|---------|-------------------------|
| scout-1     | done   | 10k  | 11k     | 312 call sites          |
| fable       | done   | 3k   | 3k      | decision: A (shim)      |
| worker-api  | done   | 19k  | 17k     | 41 tests pass           |
| worker-core | done   | 19k  | 22k     | 88 tests pass           |
| worker-jobs | done   | 13k  | 12k     | mechanical              |
| verify      | done   | 13k  | 13k     | PASS                    |
| inline ×3   | done   | 9k   | 9k      | triage/plan/synth       |
| **total**   |        | 86k  | 87k     | ≈ $0.31 (+$0.07 fable)  |
```

For comparison, the Workflow tool on the same task typically spawns 6–10
full-context agents with unconstrained outputs — several hundred thousand
tokens before synthesis.

## Repo layout

```
worktrickle/              # the skill — symlink THIS directory
├── SKILL.md              # orchestration playbook (always loaded on invoke)
├── reference/
│   ├── contracts.md      # frozen cache-anchor preamble + output grammars
│   ├── diagrams.md       # diagram grammar, column math, worked examples
│   ├── fable.md          # Fable escalation runbook + fallback ladder
│   └── headroom.md       # headroom proxy detection + relaunch runbook
└── scripts/
    └── fable_arbitrate.sh  # the one Fable 5 API call (executed, never read)
evals/                    # dev-only scenarios; not shipped with the skill
DESIGN.md                 # full design document
```

## What it deliberately doesn't do

No JS runtime, no resume journal, no 16-way concurrency, no nested
delegation, no schema enforcement, no live token TUI. That 5% only pays off
at fanout scales worktrickle refuses to reach — refusing is the product.
