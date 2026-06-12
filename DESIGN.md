# worktrickle — Design Document

**Version:** 1.0 (2026-06-12)
**Status:** Approved for implementation
**Premise:** A Claude Code skill that delivers ~95% of the Workflow tool's value — dynamic subagent fanout plus intelligent multi-step planning — at a fraction of the tokens. The Workflow tool's known failure mode is cost (~15x chat tokens, community-reported ~2x over-spawning). worktrickle wins by being *conservative about fanout, terse about outputs, and cache-aware about spawning*, and by making the plan visible (ASCII diagram) before a single worker token is spent.

Design north star: **the cheapest agent is the one never spawned.**

---

## 1. Product Shape

### 1.1 What it is

A skill directory installed at `~/.claude/skills/worktrickle/` (or `.claude/skills/worktrickle/` per-project):

```
worktrickle/
├── SKILL.md                      # core orchestration rules (always loaded on invoke)
├── reference/
│   ├── contracts.md              # delegation templates + output-compression rules
│   ├── diagrams.md               # full diagram grammar, char tables, worked examples
│   └── fable.md                  # Fable escalation protocol + exact curl
└── scripts/
    └── fable_arbitrate.sh        # bundled Fable 5 call (executed, never read into context)
```

No binary, no runtime, no daemon. The orchestrator is the main Claude Code session itself; workers are ordinary `Agent` tool spawns with model overrides. Progressive disclosure is enforced: SKILL.md is < 450 lines; `reference/*` files load only when the run actually reaches the phase that needs them (diagrams.md only at diagram time, fable.md only if a Fable step is proposed).

### 1.2 Invocation

- `/worktrickle <task>` — explicit. `$ARGUMENTS` is the task statement.
- `/worktrickle --effort low|medium|high|xhigh|max <task>` — sets the master effort dial (§2.5), mirroring Claude's own effort levels. Resolution: flag > `WORKTRICKLE_EFFORT` env var > default **high**.
- `/worktrickle --fable <task>` — same, with the Fable arbitration step pre-authorized (still rendered in the diagram; still requires plan approval).
- `/worktrickle --headroom <task>` — asserts the headroom compression proxy is active (§3.5); auto-detection runs regardless of the flag.
- Model-invoked: frontmatter description front-loads triggers — *"Plans and runs token-efficient multi-step workflows with tiered subagents. Use when the user asks to trickle, orchestrate, fan out, or run a workflow/multi-agent task cheaply."*

Frontmatter:

```yaml
---
name: worktrickle
description: Plans and runs token-efficient multi-step workflows with tiered
  subagents (haiku scouts, opus implementors, sonnet/haiku for routine work,
  inline synthesis in the main session). Renders an ASCII plan diagram with
  per-step model tier and token estimates for approval before executing. Use
  when the user asks to trickle, orchestrate, fan out, parallelize, or run a
  workflow or multi-agent task cheaply.
argument-hint: "[--effort low|medium|high|xhigh|max] [--headroom] [--fable] <task description>"
allowed-tools: Task, Read, Write, Edit, Grep, Glob, AskUserQuestion, Bash(bash *worktrickle/scripts/fable_arbitrate.sh *), Bash(mkdir -p /tmp/wt-*), Bash(test -n "$ANTHROPIC_API_KEY"*)
---
```

### 1.3 End-to-end UX

1. User: `/worktrickle migrate the logging layer in src/ to structlog`
2. **Triage** (inline, seconds): is this worth a pipeline at all? If not, say so and just do it.
3. **Scout** (1–2 Haiku agents, ~30s): map the territory, return ≤400-token structured findings.
4. **Plan** (inline): orchestrator drafts the step DAG with model tiers and token estimates.
5. **Diagram + approve**: render the ASCII diagram (§5), show estimated total cost, ask the user via AskUserQuestion: **Approve / Edit plan / Cancel**. Nothing executes before approval.
6. **Execute**: spawn workers per the approved DAG; ledger updated per step.
7. **Verify**: one fresh-context reviewer sees only the diff + acceptance criteria.
8. **Synthesize** (inline): final report with the actual-vs-estimated token ledger appended.

The user sees exactly two "big" artifacts: the pre-flight diagram and the final report. Everything in between is terse one-line progress notes.

---

## 2. The Trickle Pipeline

### 2.1 Canonical phases

| # | Phase | Runs | Model | Purpose |
|---|-------|------|-------|---------|
| 0 | **Triage** | inline | session model | Decide pipeline vs. direct execution. Hard gate. |
| 1 | **Scout** | subagent(s) | haiku | Read-only reconnaissance: file map, symbol locations, scope size. |
| 2 | **Plan** | inline | session model | Build the step DAG, assign tiers, estimate tokens. Optional Fable arbitration here (§4). |
| 3 | **Diagram + Approve** | inline | session model | Render ASCII DAG, show budget, block on user approval. |
| 4 | **Execute** | subagents | dial tier (opus/sonnet/haiku) | Do the work. Fanout happens here and only here. |
| 5 | **Verify** | subagent | sonnet | Fresh-context review of diff vs. criteria only. |
| 6 | **Synthesize** | inline | session model | Merge results, write final report + ledger. |

**Inline vs. subagent — the rule and why:**

- **Inline** (orchestrator's own context): triage, planning, diagramming, synthesis. These steps *need* the accumulated run context, are sequential, and produce small outputs. Spawning an agent for them would re-pay the fixed per-agent context cost for zero parallelism gain. This is Anthropic's own finding: coding-adjacent work has shared-context dependencies that make orchestrator-worker fanout a poor fit — so the "thinking" stays in one context.
- **Subagent**: scouting (pollutes context with exploration noise — exactly what fresh windows are for), execution work items (parallelizable, partitionable), and verification (must NOT see the implementer's reasoning — fresh context is the feature, not a cost).

### 2.2 Phase 0: Triage — when NOT to trickle

The skill **must decline to build a pipeline** when any of these hold:

- The task fits under the dial's inline threshold (§2.5; low ≤ ~5 tool calls, medium/high ≤ ~3, xhigh/max: single-step trivia only) of direct work (single-file edit, lookup, one grep-and-fix). Do it inline; say "no pipeline needed" in one line.
- The task is sequential with shared state at every step (e.g., a refactor where step N+1's shape depends on reading step N's output). One agent — usually the orchestrator itself — does it.
- The user is mid-conversation iterating on something. Pipelines are for cold, well-scoped tasks.

Shape table (hard-coded into SKILL.md, adapted from Anthropic's production rules; baseline at medium/high — low trims toward fewer agents, xhigh/max toward more, per the §2.5 dial):

| Task shape | Agents |
|---|---|
| Simple lookup / single fix | 0 (inline) |
| Scoped task, one unknown area | 1 scout + 1 worker (+ verifier when files are written) |
| Comparison / 2–4 independent areas | 1 scout + 2–4 workers |
| Broad sweep across ≥5 independent partitions | 1–2 scouts + up to 6 workers (batched) |

### 2.3 Fanout decision rules (Phase 4)

Fan out **only when ALL of these are true**:

1. At least the dial's fanout minimum (§2.5: 3 at low / 2 at medium-high / any clean partition at xhigh+) of work items that are *provably independent* (no shared file, no ordering dependency).
2. Each item's instructions can be written as a complete four-field contract (§3.2) without "see what agent 2 found".
3. Items partition cleanly on file/directory boundaries — for write work, **no two concurrent writers may touch the same file**, ever. If partitions overlap, serialize or merge the items.
4. The total plan estimate (including the new workers) stays under the dial's heavy-run threshold (§2.5, §3.4) — or under whatever figure the user already approved.

Hard caps (dial-scaled; `max` removes them — that's the point of max):

- Max concurrent / total subagents per the §2.5 dial: **4/10 low, 6/16 medium, 8/24 high, 10/40 xhigh, uncapped at max** (harness limits still apply).
- **Max 1 level** of delegation at every dial setting: workers never spawn workers.

Below the dial's fanout minimum → run the items as sequential steps in one worker (one context spin-up instead of two). Sequential same-type items batch into one agent whenever combined scope fits comfortably in its context — re-paying the fixed system-prompt cost per item is the single biggest waste in the Workflow tool, and the batching instinct holds even at max. Low's sole exception to its ≥3 rule: read-only probes that must not contaminate each other (comparative evaluations where one probe's findings would anchor the other) may fan at k=2 — never for write work.

### 2.4 Failure handling

No resume journal (§7). Each step's result is appended to `/tmp/wt-<run-id>/ledger.md` as it completes. If a worker fails or returns garbage: retry once with the failure note appended to its contract; on second failure, the orchestrator does that item inline or surfaces it in the final report as NOT DONE — never silently dropped. If the session dies mid-run, the ledger file is the (manual) restart aid; that's all.

### 2.5 The effort dial — one master knob

The levels deliberately mirror Claude's own effort vocabulary (`output_config.effort`): **low / medium / high / xhigh / max** — users already know what these words mean, and `max` means what it means there too: spend whatever it takes. (v2 of the dial shipped as `lean/standard/deep`; those map to `low/medium/xhigh` and are gone.)

Rationale: included-model tokens (Haiku/Sonnet/Opus) come out of the Claude Code subscription — at the margin they are nearly free, and for Max-plan users effectively free at any volume. Fable tokens are metered API dollars. So worktrickle exposes exactly **one** knob, and that knob scales only included-model spend: `low` is the strict frugal mode (the original v1 defaults), `high` (the default) loosens limits because plan tokens are cheap, and `max` is totally uncapped — no agent caps beyond the harness's own, no output caps, no breaker — built for Max-plan users for whom any cap is just lost capability. **Fable's trigger conditions never loosen**: it remains reserved for critical, hard-to-reverse decisions at every setting; xhigh/max merely permit both named triggers (§4.1) to fire as separate calls.

Resolution order: `--effort` flag > `WORKTRICKLE_EFFORT` env var > `high`. The level is fixed for the whole run, named in the diagram's budget footer, and recorded in the ledger.

| Parameter | low | medium | high (default) | xhigh | max |
|---|---|---|---|---|---|
| Triage: do inline instead when | ≤ ~5 tool calls | ≤ ~3 tool calls | ≤ ~3 tool calls | single-step trivia only | single-step trivia only |
| Fanout minimum (independent items) | 3 (k=2 read-only-probe exception) | 2 | 2 | any clean partition | any clean partition |
| Agents: max concurrent / total | 4 / 10 | 6 / 16 | 8 / 24 | 10 / 40 | uncapped (harness limit) |
| Output caps scout/worker/verifier | 400/700/500 | 800/1500/1000 | 1500/3000/2000 | 3000/6000/4000 | none (grammar still applies) |
| Scout tier | haiku | haiku | haiku (sonnet if ambiguous) | sonnet | sonnet |
| Default worker tier | haiku mech / sonnet judgment | sonnet (haiku for mech) | opus judgment / sonnet routine / haiku mech | opus (sonnet routine / haiku mech) | opus (sonnet/haiku only where trivial) |
| Verification of write work | 1 verifier | 1 verifier | 1 verifier | 2 lenses | 2 lenses (correctness + spec) |
| ⚠ HEAVY banner threshold | 150k | 400k | 1M | never | never |
| Circuit breaker | pause at 2× est | pause at 3× est | pause at 4× est | ⚠ ledger note, no pause | off |
| Fable calls (when key set) | ≤1 | ≤1 | ≤1 | ≤2 (one per trigger) | ≤2 (one per trigger) |

**Naming hazard, handled:** the dial is RUN effort; the per-spawn `effort: low|medium` option on an individual agent (§3.1) is the model-level API knob. SKILL.md and contracts.md label the latter "model effort" to keep them apart.

**Dial-invariant at every level:** the diagram approval gate, the frozen contract preamble (v3 — caps moved to the contract tail so the preamble is byte-identical across dial settings), verbatim-preservation and unsafe-to-compress rules, the no-two-writers-per-file rule, max 1 delegation level, the ledger, and Fable's triggers. The dial changes how much the skill spends, never how safe or transparent it is.

---

## 3. Token Economy

This is the heart of the skill. Four policies, all mandatory.

### 3.1 Model tiering

Set via the Agent tool's `model` override on every spawn. Never let a worker inherit the session model by accident.

| Role | Model | Why |
|---|---|---|
| Scout (read-only: Read/Grep/Glob/Bash) | `haiku` | Structured locator output is constrained enough that Haiku suffices; ~1/3 Sonnet cost, ~1/5 session-Opus cost. Community-reported 40–85% total savings come almost entirely from this row. |
| Mechanical worker (rename, apply known pattern, run tests, format) | `haiku` | The contract specifies the exact edit; no judgment needed. |
| Standard worker (implement, refactor with judgment) | dial worker tier — `opus` (4.8) by default at high+, `sonnet` at medium and below / for routine items, `haiku` for mechanical | Implementation quality is the product; opus tokens are subscription-included, so at the default dial the only reason to tier down is that the item is routine (sonnet) or fully specified (haiku) — not cost. Fable stays above this row for arbitration only (§4). |
| Verifier (diff + criteria review) | `sonnet` | Review needs competence, not frontier capability. |
| Triage / Plan / Diagram / Synthesis | inherit (session model, typically Opus) | Runs inline; costs zero extra fixed context. |
| Plan arbitration (optional, §4) | `claude-fable-5` via direct API | Tiny input, tiny output, maximum judgment per dollar. |

Effort: pass `effort: low` for mechanical work and scouts (fewer consolidated tool calls, no preamble) and `medium` for standard workers — but only if the Agent tool accepts an effort/output_config option on the harness; it is not part of the documented option set, so the frozen contract preamble also encodes the same behavior at prompt level ("minimize tool calls: batch reads, no exploratory detours, no preamble"), and the saving survives either way. The orchestrator itself never changes its own effort.

### 3.2 Terse output contracts

Every delegation is a **four-field contract** — vague task strings are a bug:

```
OBJECTIVE: <one sentence, the deliverable>
BOUNDARIES: <files/dirs in scope; explicitly out of scope; do NOT…>
TOOLS: <which tools, search heuristic: start broad, then narrow>
OUTPUT FORMAT: <exact grammar + hard cap, below>
```

Output grammar (borrowed from cavecrew, validated by caveman's evals showing structured formats beat generic "be concise" by ~2x):

- **Scouts** (cap dial-scaled, **400→3000 tokens, none at max**): rows of `<path>:<line> — \`symbol\` — ≤6-word note`, grouped under one-word headers (`Defs:` `Refs:` `Tests:` `Config:`); totals line (`14 refs, 3 defs.`); `No match.` for empty results. No prose.
- **Workers** (cap dial-scaled, **700→6000 tokens, none at max**): `DONE|PARTIAL|FAIL` + files-touched list (`path — one-line what-changed`) + verification evidence (test command + pass/fail line, verbatim) + `NOTES:` ≤3 bullets.
- **Verifier** (cap dial-scaled, **500→4000 tokens, none at max**): findings only, each `path:line — severity — ≤15-word issue`; `PASS.` if clean. Instructed to report only correctness-affecting gaps — no style nits, no praise.

**Universal preservation list** (in every contract, verbatim): code symbols, file paths, error strings, commands, URLs, version numbers are preserved exactly — never paraphrased.

**Elision sentinel** (the headroom CCR pattern, filesystem edition): anything cut to meet the cap is replaced with a machine-readable marker — `[+212 similar entries omitted; full list: /tmp/wt-<run>/scout-1.txt]` — and the worker writes the full raw output to that scratch file first. Downstream agents get the path, not the payload. The orchestrator proactively passes the relevant scratch path into a later contract when that step needs the elided detail (don't make the worker rediscover it's missing).

**Where compression is UNSAFE** (suspension clauses, in every contract):

- Error messages and stack traces: **verbatim, always**, even past the cap.
- Security findings, irreversible-action warnings, and genuine ambiguity: drop terse mode, write full sentences, and *keep hedging* — stripped uncertainty markers make a guess read like a fact, which is precisely what the orchestrator must not receive before a risky decision.
- Source code a downstream step must analyze/review/fix: never summarized — pass paths.
- Payloads already under ~300 tokens: don't compress; instruction overhead exceeds savings.

### 3.3 Cache-awareness

Prompt caching is a strict prefix match with a 5-minute TTL on the ephemeral tier; the skill's spawning discipline is built around that:

1. **One frozen preamble.** All worker contracts begin with the same byte-identical static block (the contract rules + preservation list + grammar from contracts.md, ~600 tokens). Task-specific fields come *after* it. Same tier → same prefix → cache hits across spawns.
2. **No volatile bytes early.** No timestamps, run IDs, UUIDs, or unsorted lists anywhere before the task-specific tail. The run ID appears only in scratch paths at the end of the contract.
3. **Batch spawns back-to-back.** All workers of a wave are spawned in one orchestrator turn, parallel within the 4-cap — this saves orchestrator-turn overhead and keeps the whole wave inside the 5-minute TTL of earlier cache writes (the scout's, the previous wave's). Note the honest caveat: a cache entry is only available once the first request with that prefix has begun processing, so truly simultaneous siblings race the write and pay it on their first turn; they read it from their second turn onward, which is where the preamble savings actually accrue. Never interleave a slow inline step between sibling spawns — a >5-minute gap goes cold and repays the write.
4. **Keep the orchestrator loop warm.** During execution, the orchestrator emits its between-step turns promptly (one-line progress notes, no long deliberation) so its own session cache stays inside the TTL. Heavy thinking happened at Plan time, on purpose.
5. **Same agentType per tier.** Scouts all use one agent definition, workers another — varying tool sets per spawn would change the rendered prefix.

### 3.4 Token budget ledger

**Estimation (at Plan time, shown in the diagram).** Flat per-step heuristics — crude but honest, documented in SKILL.md so they aren't voodoo constants:

| Step type | Est. input | Est. output | Shorthand shown |
|---|---|---|---|
| Haiku scout | ~10k | ~0.4k | `~10k` |
| Haiku mechanical worker | ~12k | ~0.7k | `~13k` |
| Sonnet worker | ~18k | ~0.7k | `~19k` |
| Opus worker (judgment, default at high+) | ~18k | ~1k | `~19k` |
| Sonnet verifier | ~12k | ~0.5k | `~13k` |
| Inline step | ~2k marginal | ~1k | `~3k` |
| Fable arbitration | ~2k | ~1k | `~3k ($0.07)` |

Total estimate and a rough $ figure (tier prices: haiku $1/$5, sonnet $3/$15, fable $10/$50 per MTok; inline steps priced at the session model, opus 4.8 $5/$25) appear under the diagram, alongside the run's effort level (and `headroom on` when the proxy is detected, §3.5). If the estimate exceeds the dial's heavy threshold (**150k low / 400k medium / 1M high / never at xhigh+**), the diagram carries a `⚠ HEAVY RUN` banner and the approval question repeats the dollar figure.

**Tracking (during execution).** `/tmp/wt-<run-id>/ledger.md`, one line per completed step: `step-id | status | est | actual≈ | note`. "Actual" is approximated as estimated-input + measured output length (the harness doesn't expose per-agent usage to the skill; approximation is good enough for trend detection). **Circuit breaker:** if cumulative actual exceeds the dial's breaker multiple (§2.5: 2× low / 3× medium / 4× high) of cumulative estimate at any step boundary, pause, show the ledger, and re-confirm with the user before continuing; at xhigh, append a `⚠ over estimate` ledger line instead of pausing; at max the breaker is off (the ledger is still written). Final report appends the full ledger table.

### 3.5 Headroom integration

[headroom](https://github.com/chopratejas/headroom) (`pip install "headroom-ai[all]"`) is a local compression proxy: `headroom wrap claude` starts it on port 8787 and launches Claude Code with `ANTHROPIC_BASE_URL` pointed at `http://127.0.0.1:8787` (plus `HEADROOM_PROJECT` for attribution). It compresses tool results in flight — SmartCrusher for JSON, AST-aware code compression, a cache-prefix aligner, reversible CCR — with claimed savings of 60–95% on tool-heavy workloads.

It is **complementary, not redundant**: headroom compresses what comes back from tools (model *inputs*); worktrickle's contracts cap what agents emit (*outputs*) and what gets spawned (fanout). Different waste streams. With headroom active, even `--effort max` runs keep tool-result compression.

Design decisions:

- **Detection always, assertion on demand.** At run setup the skill checks `HEADROOM_PROJECT` / a localhost `ANTHROPIC_BASE_URL` (+ `/health` probe). Detected ⇒ `headroom on` in the diagram footer + a ledger line; nothing else changes. `--headroom` asserts it: if absent, report (a running session's base URL cannot be re-routed — wrapping is a launch-time decision), and fold continue-without/cancel-and-relaunch into the approval gate. Never block, never try to start the proxy mid-session.
- **No behavioral coupling.** Caps and tiers do not relax when headroom is on — its savings are on a stream the dial doesn't govern, and coupling them would make runs non-reproducible across environments.
- **Report actuals.** When active, quote `headroom perf` savings in the final report so the benefit is visible, not assumed.

Runbook with exact detection order, the not-active message, and caveats (Python 3.10+, local process required, first-run model downloads): `worktrickle/reference/headroom.md` — loaded only when `--headroom` is passed but no proxy is detected.

---

## 4. The Fable Escalation (optional)

Fable 5 is not in the Claude Code subscription, but it is the best available judgment. worktrickle uses it the only way that's economical: **one tiny, high-leverage decision per run, by direct API call.**

### 4.1 When it triggers

Exactly two trigger conditions — nothing else ever calls Fable:

1. **Plan arbitration.** Scouting revealed ≥2 genuinely viable approaches AND the choice is expensive to reverse (architecture/migration-strategy/API-shape class decisions). The orchestrator drafts both candidates as ≤150-word summaries and lets Fable pick.
2. **Final-design adjudication.** The verifier and the implementation disagree on a design-level point the orchestrator can't resolve with evidence.

**Hard cap: one Fable call per run** at low/medium/high effort; xhigh and max permit each trigger to fire once (max two calls). The trigger conditions themselves never loosen with the dial (§2.5). Every proposed call appears in the diagram as a `◆ fable` node — it is part of what the user approves, never a surprise charge. Auto-proposed only when a trigger condition is met; pre-authorized by `--fable` but still drawn.

### 4.2 Mechanics

Bundled script (`scripts/fable_arbitrate.sh`) executed via Bash — its code never enters context, only its JSON output. The orchestrator writes the question to `/tmp/wt-<run>/fable-q.json` and runs the script.

Request shape (the exact contract the script implements):

```bash
curl -s https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-fable-5",
    "max_tokens": 8000,
    "output_config": {"effort": "high"},
    "system": "You are an arbiter. Pick one option. Output ONLY JSON: {\"decision\": \"A\"|\"B\", \"rationale\": \"<=120 words\", \"risks\": [\"<=3 one-line risks of the chosen option\"]}",
    "messages": [{"role": "user", "content": "<task 1-liner>\n\nOPTION A:\n<=150w summary\n\nOPTION B:\n<=150w summary\n\nCONSTRAINTS:\n<=5 bullets"}]
  }'
```

Rules baked in:

- **`thinking` param omitted entirely** — Fable's thinking is always on; an explicit `disabled` is a 400.
- `temperature`/`top_p`/`top_k` omitted — unnecessary for a constrained pick, and sampler params are restricted on newer thinking models.
- `max_tokens: 8000` — adaptive thinking tokens bill as output and count against `max_tokens` (`budget_tokens` is removed on Fable), so the ceiling must leave room for thinking plus the answer. Input ≤ ~2k tokens. Typical cost: 2k×$10/M + ~1k×$50/M ≈ **$0.07**; worst case ≈ $0.42 if thinking fills the ceiling. The script refuses to send if the payload file exceeds 12 KB (≈3k tokens) — small input is the whole point.
- **Check `stop_reason` before reading content.** `"refusal"` (Fable's safety classifiers, HTTP 200) → script exits 3 with `{"fallback": "refusal"}`. `"max_tokens"` (thinking consumed the budget; answer truncated) → exit 2 with `{"fallback": "truncated"}`. Malformed/missing key/non-200 → exit 2.

### 4.3 Graceful degradation

Checked in this order; every fallback is logged in the ledger as `fable: skipped (<reason>) — decided inline`:

1. `ANTHROPIC_API_KEY` unset → don't even mention Fable in the diagram; the arbitration node renders as an inline-decision node instead.
2. Script exit ≠ 0 (network, 4xx/5xx, refusal) → orchestrator makes the same A/B decision **inline with the session model**, using the identical option summaries it already drafted. The run never blocks on Fable.
3. JSON parse failure → same inline fallback.

The decision artifact (whoever made it) is written to `/tmp/wt-<run>/decision.md` and quoted in the final report.

---

## 5. ASCII Diagrams — first-class feature

The diagram is the product's face: it is **always rendered before execution** and is the object of the approval gate. Full grammar lives in `reference/diagrams.md`; SKILL.md carries the condensed rules + one example.

### 5.1 Grammar (fixed — no stylistic freedom)

- **Layout:** vertical, Sugiyama-style ranks, one rank per phase/step. Flow strictly top→bottom.
- **Width:** ≤ 100 columns hard, 76 target. Node titles 1–3 words.
- **Characters:** single-line box set only — `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` with `▼` arrowheads. Double-line `╔═╗` reserved exclusively for the run boundary. Never mix `+-|` ASCII style with Unicode in one diagram (plain-ASCII fallback mode exists for non-UTF terminals: `+ - | v`, same layout rules).
- **Nodes:** 3 interior lines — title / `model · est tokens` / optional flag line (`read-only`, `writes src/log/`, `◆ fable`, `⚠`). All boxes in a rank padded to equal width so connectors land on exact column centers.
- **Fan-out:** drop from the parent via `└─┬─┘`, horizontal rail, `┬` tees into side-by-side boxes. **Fan-in:** mirrored `┴` rail into the consumer.
- **Edge labels:** sparse, bracketed, beside the vertical connector: `│ [on approval]`, `│ findings ≤400 tok`.
- **Footer:** legend + budget line, always.
- **Checklist** (copied into SKILL.md as a literal sequence): compute ranks → size boxes (equal width per rank) → draw rails → verify every connector column aligns → count columns ≤100 → append legend/budget.

### 5.2 Example 1 — linear run

```
╔══════════════════════════════════════════════════════╗
║  worktrickle: "add request-ID middleware + tests"    ║
╚══════════════════════════╤═══════════════════════════╝
                           ▼
              ┌─────────────────────────┐
              │ scout                   │
              │ haiku · ~10k            │
              │ read-only src/server/   │
              └────────────┬────────────┘
                           │ [findings ≤400 tok]
                           ▼
              ┌─────────────────────────┐
              │ plan + diagram          │
              │ inline · ~3k            │
              └────────────┬────────────┘
                           │ [user approval gate]
                           ▼
              ┌─────────────────────────┐
              │ implement               │
              │ sonnet · ~19k           │
              │ writes src/server/      │
              └────────────┬────────────┘
                           ▼
              ┌─────────────────────────┐
              │ verify                  │
              │ sonnet · ~13k           │
              │ sees diff+criteria only │
              └────────────┬────────────┘
                           ▼
              ┌─────────────────────────┐
              │ synthesize              │
              │ inline · ~3k            │
              └─────────────────────────┘

  legend: inline = main session · boxes = subagents
  budget: ~48k tokens est ≈ $0.19 · effort low · ledger: /tmp/wt-a1b2/
```

### 5.3 Example 2 — parallel fanout with Fable arbitration

```
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
  budget: ~86k est ≈ $0.31 (+$0.07 fable) · effort low · concurrency 3/4
```

### 5.4 Approval gate

After rendering, the skill asks (AskUserQuestion when available, plain question otherwise): **Approve and run / Edit plan / Cancel.** "Edit plan" loops: user states changes in prose, orchestrator re-renders the diagram, asks again. The diagram shown at approval is recorded to `/tmp/wt-<run>/plan.txt` and is the contract for the run — execution that needs to deviate (new step, tier change, extra agent) re-renders and re-asks.

---

## 6. File Manifest

| File | Lines (≈) | Purpose |
|---|---|---|
| `worktrickle/SKILL.md` | 420 | Always-loaded core: frontmatter, phase machine, triage + fanout rules, tiering table, contract skeleton, condensed diagram rules + checklist, ledger format, circuit breaker. |
| `worktrickle/reference/contracts.md` | 180 | The frozen byte-identical contract preamble (cache anchor), full output grammars per role, compression-unsafe list, elision-sentinel spec, 3 filled-in example contracts. Loaded at Plan time. |
| `worktrickle/reference/diagrams.md` | 200 | Full character tables, column-math rules, fan-out/fan-in construction recipes, plain-ASCII fallback, 3 worked input→diagram pairs (linear, diamond, wide fanout). Loaded at Diagram time. |
| `worktrickle/reference/fable.md` | 90 | Trigger conditions, payload schema, refusal/fallback ladder, cost math. Loaded only when a trigger condition fires. |
| `worktrickle/reference/headroom.md` | 60 | Headroom proxy detection order, the proxy-not-active path, relaunch instructions, caveats. Loaded only when `--headroom` is passed but no proxy detected. |
| `worktrickle/scripts/fable_arbitrate.sh` | 60 | Reads `fable-q.json`, size-guards, curls `claude-fable-5` (no thinking param), checks `stop_reason`, emits decision JSON or typed exit code. Executed via Bash; never read. |

Nothing else. No agents/ directory (worker contracts are inline prompts over the cached preamble — custom agent files would fragment the cache prefix per type and add install friction). Eval scenarios (linear, diamond, wide-fanout, triage-decline, fable-fallback) live in the repo's `evals/` for development but do not ship in the skill.

---

## 7. What We Explicitly Don't Build (anti-scope)

| Not built | Workflow tool has it | Why we skip it |
|---|---|---|
| **JS orchestration runtime** | Deterministic script, vars outside context | The orchestrator-as-model already holds the loop; a runtime would re-create the thing we're replacing. Our determinism substitute is the approved diagram + ledger file. |
| **Resume journal / result caching** | Per-agent result cache, resumable runs | Worth it at 1,000 agents; at our ≤10-agent cap, re-running a failed step costs less than maintaining journal correctness. The ledger file is a manual restart aid and that's the whole feature. |
| **16-way concurrency / 1,000-agent runs** | Yes | Over-fanning is the documented #1 cost failure. 4 concurrent / 10 total covers every coding-adjacent task shape Anthropic's own guidance endorses. |
| **Nested workflows / workers spawning workers** | One level of nesting | Multiplies fixed context costs geometrically; one level of delegation is the budget's load-bearing wall. |
| **Schema-enforced structured outputs** | `schema` option forces a StructuredOutput call | Prompt-level grammars + caps get ~90% of the compliance at zero machinery; the orchestrator tolerantly parses and retries once on garbage. |
| **Live token TUI** | `/workflows` panel | The pre-flight estimate, per-step ledger lines, and the 2× circuit breaker are the cost controls that matter; a dashboard is decoration. |

**The 5% we give up, named:** crash-resumability of long runs, wall-clock speed beyond 4-way parallelism, and hard schema guarantees on worker outputs. That is the right 5% because all three only pay off at fanout scales worktrickle deliberately refuses to reach — and refusing to reach them is the product.

---

## Appendix A — Implementation order

1. `SKILL.md` skeleton + triage/fanout rules + tiering (testable with no reference files).
2. `reference/contracts.md` + frozen preamble; wire scouts end-to-end.
3. `reference/diagrams.md` + approval gate; eval the 3 diagram scenarios against the checklist.
4. Ledger + circuit breaker.
5. `scripts/fable_arbitrate.sh` + `reference/fable.md`; test all three fallback paths (no key, refusal, malformed).
6. Five eval scenarios; baseline the session model *without* the skill on each; iterate on real failures.
