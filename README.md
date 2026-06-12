# worktrickle

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub Pages](https://img.shields.io/badge/docs-GitHub%20Pages-brightgreen)](https://ez-gz.github.io/worktrickle/)

**Token-efficient multi-agent workflows for Claude Code.** A skill, not a runtime.

- **What** — plans a workflow, shows you a diagram, fans out tiered subagents, reports back with a cost ledger.
- **Why** — naive multi-agent burns **~10×** the tokens of single-agent chat. worktrickle keeps ~95% of the value for a fraction of that.
- **Trust** — **nothing executes until you approve the plan.** Every step, model, and token estimate is drawn first:

```
╔════════════════════════════════════════════════════════════════╗
║ worktrickle: "migrate logging in src/ to structlog"            ║
╚════════════════════════════════════════════╤═══════════════════╝
                                             ▼
                                ┌─────────────────────────┐
                                │ scout                   │
                                │ haiku · ~10k            │
                                └────────────┬────────────┘
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
                                └────────────┬────────────┘
                 ┌───────────────────────────┼───────────────────────────┐
                 ▼                           ▼                           ▼
      ┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
      │ worker: api/        │     │ worker: core/       │     │ worker: jobs/       │
      │ sonnet · ~19k       │     │ sonnet · ~19k       │     │ haiku · ~13k        │
      └──────────┬──────────┘     └──────────┬──────────┘     └──────────┬──────────┘
                 └───────────────────────────┼───────────────────────────┘
                                             ▼
                                ┌─────────────────────────┐
                                │ verify → synthesize     │
                                │ sonnet+inline · ~16k    │
                                └─────────────────────────┘

  budget: ~86k est ≈ $0.31 (+$0.07 fable) · effort low · ledger: /tmp/wt-c7d1/
  Approve and run / Edit plan / Cancel?
```

Site: **https://ez-gz.github.io/worktrickle/**

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/ez-gz/worktrickle/main/install.sh | bash
```

<details>
<summary>Other install methods</summary>

```bash
# from a clone:
git clone https://github.com/ez-gz/worktrickle && ./worktrickle/install.sh

# manual copy (no internet):
cp -r worktrickle ~/.claude/skills/worktrickle
# or per-project:
cp -r worktrickle /path/to/project/.claude/skills/worktrickle
```

The installer backs up any previous install to `worktrickle.bak.<n>` and never uses `sudo`.
</details>

Optional: `export ANTHROPIC_API_KEY=sk-ant-...` enables the [Fable step](#-fable-escalation). Without it, Fable is simply never proposed.

## Use

```bash
/worktrickle migrate the logging layer in src/ to structlog
/worktrickle --effort max audit the whole ingest pipeline    # uncapped — Max-plan mode
/worktrickle --effort low rename Config to Settings          # frugal mode
/worktrickle --fable redesign the plugin API                 # pre-authorize Fable
/worktrickle --headroom refactor services/                   # assert proxy compression
```

Also self-triggers on "fan out", "orchestrate", or "token-efficient workflow".

## How it works

```
triage ▶ scout ▶ plan ▶ diagram + YOUR APPROVAL ▶ execute (fan-out) ▶ verify ▶ report + ledger
```

| Phase | Where | Model |
|---|---|---|
| Triage / Plan / Diagram / Synthesize | inline (main session) | session model |
| Scout (read-only recon) | subagent | haiku |
| Execute (the fan-out) | subagents | opus / sonnet / haiku by dial |
| Verify (sees diff + criteria only) | subagent | sonnet |
| Arbitrate (optional, critical decisions) | direct API call | **fable** |

## Why it's cheap

| Lever | One line |
|---|---|
| 🎚️ **Effort dial** | one knob scales fanout, caps, and tiers — see below |
| 🪜 **Model tiering** | Fable → Opus → Sonnet → Haiku; the right brain per step |
| 📏 **Terse contracts** | every subagent gets a rigid grammar + hard output cap; errors always verbatim |
| ♻️ **Cache-aware spawning** | byte-identical prompt preamble, waves batched inside the 5-min cache TTL |
| 🗜️ **Headroom-aware** | auto-detects the [headroom](https://github.com/chopratejas/headroom) proxy (60–95% claimed tool-token savings) |
| ◆ **Fable escalation** | Fable's judgment on the decisions that matter — pennies per run, not API-session prices |

## 🎚️ The effort dial

One knob, mirroring Claude's own levels: `--effort low|medium|high|xhigh|max` (or `WORKTRICKLE_EFFORT`). Plan tokens are subscription tokens — nearly free — so higher levels just trade more of them for coverage.

| | low | medium | **high** (default) | xhigh | max |
|---|---|---|---|---|---|
| Fan out when | ≥3 items | ≥2 | ≥2 | any split | any split |
| Agents (concurrent/total) | 4 / 10 | 6 / 16 | 8 / 24 | 10 / 40 | **uncapped** |
| Worker output cap (tok) | 700 | 1500 | 3000 | 6000 | **none** |
| Implementor model | sonnet | sonnet | **opus 4.8** | opus | opus |
| Cost guardrails | banner 150k · pause 2× | 400k · 3× | 1M · 4× | log only | **off** |
| Fable calls | ≤1 | ≤1 | ≤1 | ≤2 | ≤2 |

At every setting: the approval gate, the cost ledger, never two writers on one file, max 1 delegation level. On a Max plan? Run `xhigh` or `max` without guilt.

## ◆ Fable escalation

**We're all getting hooked on Fable.** It's the smartest model Anthropic ships — and it's API-only ($10/$50 per MTok), not in your Claude Code subscription. Running whole sessions on it adds up fast.

worktrickle keeps Fable's impact at a fraction of the API bill: only the decisions where frontier judgment actually changes the outcome get routed through it.

- **One tiny call** — plan arbitration between viable strategies, or final design adjudication. Small input, small output, **~$0.07 typical**.
- Always drawn in the diagram as a `◆ fable` node before you approve. Never a surprise charge.
- No `ANTHROPIC_API_KEY`? Never mentioned; the decision happens inline instead.

## 🗜️ Headroom

[headroom](https://github.com/chopratejas/headroom) compresses tool results in flight — the waste stream output caps can't reach. Launch wrapped and worktrickle auto-detects it:

```bash
pip install "headroom-ai[all]"   # Python 3.10+
headroom wrap claude
```

`--headroom` asserts it; if undetected, worktrickle explains (a running session can't be re-routed) and offers continue/cancel.

## Example session

<details>
<summary>Full transcript: 312 call-site logging migration — 87k tokens, ≈ $0.38 total</summary>

```
> /worktrickle migrate logging in src/ to structlog

wt: triage — multi-area write task, cold scope. Pipeline it.
    (run: wt-c7d1 · effort low)
wt: scouting src/ (1 haiku agent, read-only)...
wt: scout done — 312 call sites across api/, core/, jobs/; 2 viable
    strategies (compat shim vs big-bang). Proposing Fable arbitration.

  [the diagram at the top of this README renders here]

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

</details>

> The Workflow tool on the same task typically spawns 6–10 full-context agents with unconstrained outputs — several hundred thousand tokens before synthesis.

## Repo layout

```
worktrickle/              # the skill — install THIS directory
├── SKILL.md              # orchestration playbook (always loaded on invoke)
├── reference/            # loaded on demand: contracts, diagrams, fable, headroom
└── scripts/
    └── fable_arbitrate.sh  # the one Fable 5 API call (executed, never read)
evals/                    # dev-only scenarios; not shipped with the skill
DESIGN.md                 # full design document
```

## What it deliberately doesn't do

No JS runtime · no resume journal · no nested delegation · no live token TUI. That 5% only pays off at fanout scales worktrickle refuses to reach — **refusing is the product.**
