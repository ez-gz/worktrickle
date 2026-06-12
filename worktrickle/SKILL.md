---
name: worktrickle
description: Plans and runs token-efficient multi-step workflows with tiered
  subagents (haiku scouts, opus implementors, sonnet/haiku for routine work,
  inline synthesis in the main session). Renders an ASCII plan diagram with
  per-step model tier and token
  estimates for approval before executing. Use when the user invokes
  /worktrickle or asks to trickle, orchestrate, fan out, parallelize, or run
  a token-efficient workflow or multi-agent task cheaply.
argument-hint: "[--effort low|medium|high|xhigh|max] [--headroom] [--fable] <task description>"
allowed-tools: Task, Read, Write, Edit, Grep, Glob, AskUserQuestion, Bash(bash *worktrickle/scripts/fable_arbitrate.sh *), Bash(mkdir -p /tmp/wt-*), Bash(test -n "$ANTHROPIC_API_KEY"*), Bash(test -n "$ANTHROPIC_BASE_URL"*), Bash(test -n "$HEADROOM_PROJECT"*), Bash(command -v headroom*), Bash(curl -sf http://127.0.0.1:8787/health*)
---

# worktrickle — token-frugal workflow orchestration

You (the main session) are the orchestrator. Workers are ordinary Agent-tool
spawns with explicit model overrides. North star: **the cheapest agent is the
one never spawned.** Multi-agent runs burn ~15x chat tokens when done naively;
every rule below exists to claw that back. How hard each rule bites is set by
one knob — the **effort dial** (next section); every numbered limit in this
file reads from your dial column.

The user sees exactly two big artifacts: the pre-flight ASCII diagram and the
final report. Everything in between is one-line progress notes.

## Run setup

1. Parse `$ARGUMENTS`. `--effort low|medium|high|xhigh|max` sets the dial —
   flag > `WORKTRICKLE_EFFORT` env var > default **high**. `--fable`
   pre-authorizes Fable arbitration (still drawn in the diagram, still inside
   the approval gate). `--headroom` asserts headroom proxy benefits (below).
2. `RUN=wt-<4 hex chars>`; `mkdir -p /tmp/$RUN`. Ledger, scratch files, and the
   approved plan all live there.
3. Headroom detection (cheap, always): if `HEADROOM_PROJECT` is set, or
   `ANTHROPIC_BASE_URL` points at localhost (confirm with
   `curl -sf http://127.0.0.1:8787/health`), the session runs through the
   headroom compression proxy — note `headroom on` in the diagram footer and
   ledger. If `--headroom` was passed but the proxy is NOT detected: **read
   `reference/headroom.md`** and follow its not-active path (you cannot
   retro-route a running session; report, offer to continue without).

## The effort dial — one knob

The levels mirror Claude's own effort vocabulary: **low / medium / high /
xhigh / max**. Included-model tokens (haiku/sonnet/opus) are subscription
tokens — nearly free — so the dial scales ONLY those. Fable is metered
dollars: its trigger conditions never loosen with the dial (xhigh/max merely
let both triggers fire). Pick the column once at run start; it holds for the
whole run.

| Parameter | low | medium | high (default) | xhigh | max |
|---|---|---|---|---|---|
| Triage: just do it inline when | ≤ ~5 tool calls | ≤ ~3 tool calls | ≤ ~3 tool calls | single-step trivia only | single-step trivia only |
| Fanout minimum (independent items) | 3 | 2 | 2 | any clean partition | any clean partition |
| Agents: max concurrent / total | 4 / 10 | 6 / 16 | 8 / 24 | 10 / 40 | uncapped (harness limit) |
| Output caps scout/worker/verifier | 400/700/500 | 800/1500/1000 | 1500/3000/2000 | 3000/6000/4000 | none (grammar still applies) |
| Scout tier | haiku | haiku | haiku (sonnet if ambiguous) | sonnet | sonnet |
| Default worker tier | haiku mech / sonnet judgment | sonnet (haiku for mech) | opus judgment / sonnet routine / haiku mech | opus (sonnet routine / haiku mech) | opus (sonnet/haiku only where trivial) |
| Verification of write work | 1 verifier | 1 verifier | 1 verifier | 2 lenses | 2 lenses (correctness + spec) |
| ⚠ HEAVY banner threshold | 150k | 400k | 1M | never | never |
| Circuit breaker | pause at 2× est | pause at 3× est | pause at 4× est | ⚠ ledger note, no pause | off |
| Fable calls (when key set) | ≤1 | ≤1 | ≤1 | ≤2 (one per trigger) | ≤2 (one per trigger) |

**max is for Max-plan users:** no agent caps beyond the harness's own limits,
no output caps (the grammars remain as format guidance), no banner, no
breaker. The ledger is still written — visibility never turns off.

**Naming note:** this is the RUN effort dial. The per-spawn `effort: low` /
`medium` in the tiering tables below is the model-level API option on an
individual agent — a different knob; don't conflate them.

**Dial-invariant, at every level:** the approval gate, the frozen contract
preamble, verbatim-preservation and unsafe-to-compress rules, never two
concurrent writers on one file, max 1 delegation level, and Fable's triggers.

## Phase machine

| # | Phase | Runs | Model | Purpose |
|---|-------|------|-------|---------|
| 0 | Triage | inline | session | Pipeline vs. direct execution. Hard gate. |
| 1 | Scout | subagent(s) | haiku | Read-only recon: file map, symbols, scope size. |
| 2 | Plan | inline | session | Step DAG, tiers, token estimates. Optional Fable arbitration. |
| 3 | Diagram + Approve | inline | session | Render ASCII DAG, show budget, block on approval. |
| 4 | Execute | subagents | dial tier (opus/sonnet/haiku) | Do the work. Fanout happens here and only here. |
| 5 | Verify | subagent | sonnet | Fresh-context review: diff + criteria only. |
| 6 | Synthesize | inline | session | Final report + actual-vs-estimate ledger. |

**Inline vs. subagent — the rule:** triage, planning, diagramming, and
synthesis need the accumulated run context, are sequential, and produce small
outputs — spawning an agent for them re-pays the fixed per-agent context cost
for zero parallelism gain. Scouting (exploration noise), execution items
(parallelizable), and verification (must NOT see implementer reasoning) get
fresh windows because fresh context is the feature.

## Phase 0 — Triage (hard gate)

**Decline to build a pipeline** when ANY of these hold — say "no pipeline
needed" in one line and just do the work:

- Task fits under the dial's inline threshold of direct work (single-file
  edit, lookup, one grep-and-fix).
- Task is sequential with shared state at every step (step N+1's shape depends
  on reading step N's output). One context — usually yours — does it.
- User is mid-conversation iterating. Pipelines are for cold, well-scoped tasks.

Shape table (baseline at medium/high; low trims toward fewer agents,
xhigh/max toward more — the dial's fanout minimum and agent caps govern):

| Task shape | Agents |
|---|---|
| Simple lookup / single fix | 0 (inline) |
| Scoped task, one unknown area | 1 scout + 1 worker (+ verifier when files are written) |
| Comparison / 2–4 independent areas | 1 scout + 2–4 workers |
| Broad sweep across ≥5 independent partitions | 1–2 scouts + up to 6 workers (batched) |

## Phase 1 — Scout

> **Read `reference/contracts.md` now** — before writing any delegation. Every
> contract starts with the frozen preamble in that file, byte-identical.

Spawn 1–2 scouts at the dial's scout tier with read-only tools
(Read/Grep/Glob/Bash). Pass `effort: low` only if the Agent tool accepts an
effort option; the frozen preamble carries the same behavior at prompt level
either way. Contract caps output at the dial's scout cap in locator-row
grammar. Skip scouting entirely if the territory is already known from this
conversation.

## Phase 2 — Plan

Draft the step DAG with model tier and token estimate per step. Derive 2–4
acceptance criteria for the run now — they go verbatim into the verifier
contract at Phase 5.

**Fanout rules — fan out only when ALL four hold:**

1. At least the dial's fanout minimum of work items that are *provably
   independent* (no shared file, no ordering dependency).
2. Each item's instructions can be written as a complete four-field contract
   without "see what agent 2 found".
3. Items partition on file/directory boundaries — for write work, **no two
   concurrent writers may touch the same file, ever** (dial-invariant).
   Overlap ⇒ serialize or merge the items.
4. The total plan estimate (including the new workers) stays under the dial's
   heavy-run threshold — or under whatever figure the user already approved.

Hard caps: the dial's concurrent/total agent limits, and **max 1 level** of
delegation at every dial setting (workers never spawn workers).

Below the dial's fanout minimum ⇒ one worker runs the items as sequential
steps (one context spin-up instead of two). Batch sequential same-type items
into one agent whenever combined scope fits its context — re-paying the fixed
system-prompt cost per item is the single biggest multi-agent waste; this
batching instinct holds even at max. **Low's sole exception to its ≥3
rule:** read-only probes that must not contaminate each other (e.g.
comparative evaluations where one probe's findings would anchor the other)
may fan at k=2. Never for write work.

**Model tiering** (set `model` on every spawn; never let a worker inherit the
session model by accident):

| Role | Model | Effort |
|---|---|---|
| Scout (read-only) | dial's scout tier | low |
| Mechanical worker (rename, known pattern, run tests, format) | haiku | low |
| Standard worker (implement, refactor with judgment) | dial's worker tier | medium |
| Verifier (diff + criteria review) | sonnet | medium |
| Triage / Plan / Diagram / Synthesis | inline (session) | — |
| Plan arbitration (optional) | claude-fable-5 via API | — |

The Effort column is advisory: pass it as a spawn option only if the Agent
tool accepts an effort/output_config option on this harness. The frozen
preamble's "minimize tool calls" rule delivers the same behavior at prompt
level when it doesn't.

**Token estimates** (flat heuristics — crude but honest; shown in the diagram):

| Step type | In | Out | Shown as |
|---|---|---|---|
| Haiku scout | ~10k | ~0.4k | `~10k` |
| Haiku mechanical worker | ~12k | ~0.7k | `~13k` |
| Sonnet worker | ~18k | ~0.7k | `~19k` |
| Opus worker (judgment, default at high+) | ~18k | ~1k | `~19k` |
| Sonnet verifier | ~12k | ~0.5k | `~13k` |
| Inline step | ~2k marginal | ~1k | `~3k` |
| Fable arbitration | ~2k | ~1k | `~3k ($0.07)` |

$ figure: haiku $1/$5, sonnet $3/$15, opus $5/$25, fable $10/$50 per MTok;
inline steps are priced at the session model. Estimates show the low/medium
ballpark; at higher dial levels, scale the Out side with the dial's caps and
bump tier prices where the dial bumps tiers — In dominates either way.

**Fable escalation** — exactly two triggers; one call per run at low–high
(xhigh/max: each trigger may fire once, max two):

1. Scouting revealed ≥2 genuinely viable approaches AND the choice is
   expensive to reverse (architecture / migration strategy / API shape).
2. Verifier and implementation disagree on a design point you can't resolve
   with evidence.

If a trigger fires (or `--fable` was passed) AND `ANTHROPIC_API_KEY` is set
(check with `test -n "$ANTHROPIC_API_KEY"`; the script also self-checks and
exits 2 with fallback JSON if unset): **read `reference/fable.md`** and add a
`◆ fable` node to the diagram. Key unset ⇒ don't mention Fable; render an
inline-decision node instead. The Fable call executes only **after** plan
approval, even though its decision feeds worker contracts — draw it as the
first post-gate node.

## Phase 3 — Diagram + Approve

> **Read `reference/diagrams.md` now** — full grammar, column math, fan-out
> recipes, worked examples.

Condensed rules: vertical ranks, top→bottom; ≤100 cols (76 target);
single-line box chars `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` + `▼`, double-line `╔═╗` only
for the run boundary; each node = title / `model · est tokens` / optional flag
line (`read-only`, `writes src/x/`, `◆ fable`, `⚠`); boxes in a rank padded to
equal width; sparse bracketed edge labels; legend + budget footer (which
names the run's effort level) always.

**Checklist (run it literally):** compute ranks → size boxes (equal width per
rank) → draw rails → verify every connector column aligns → count columns
≤100 → append legend/budget.

Example (linear run):

```
╔══════════════════════════════════════════════════════╗
║ worktrickle: "add request-ID middleware + tests"     ║
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

If total estimate exceeds the dial's heavy threshold (150k low / 400k medium
/ 1M high / never at xhigh+): add a `⚠ HEAVY RUN` banner line above the
budget footer and repeat the dollar figure in the approval question. When
the headroom proxy is detected, append `headroom on` to the budget line.

**Approval gate.** Ask (AskUserQuestion when available, plain question
otherwise): **Approve and run / Edit plan / Cancel.** "Edit plan" loops: user
states changes in prose, you re-render, ask again. Save the approved diagram
to `/tmp/$RUN/plan.txt` — it is the contract for the run. Any deviation during
execution (new step, tier change, extra agent) re-renders and re-asks.
**Nothing executes before approval.**

## Phase 4 — Execute

Every delegation is a four-field contract appended to the frozen preamble from
`reference/contracts.md`:

```
OBJECTIVE: <one sentence, the deliverable>
BOUNDARIES: <files/dirs in scope; explicitly out of scope; do NOT ...>
TOOLS: <which tools; search heuristic: start broad, then narrow>
OUTPUT FORMAT: <SCOUT|WORKER|VERIFIER> grammar, cap <N> tokens.
  Scratch file: /tmp/$RUN/<step-id>.txt
```

**Cache discipline (all five, every wave):**

1. One frozen preamble — byte-identical static block first, task fields after.
   Same prefix across spawns ⇒ cache hits.
2. No volatile bytes early — no timestamps, run IDs, UUIDs, or unsorted lists
   before the task-specific tail. Run ID appears only in scratch paths at the
   end.
3. Batch sibling spawns in ONE turn (parallel, within the dial's concurrency
   cap) — it saves
   orchestrator turns and keeps the wave inside the 5-minute TTL of earlier
   cache writes. (Truly simultaneous siblings race the first cache write on
   their first turn; that's acceptable — they hit it from their second turn
   on.) Never interleave a slow inline step between siblings — the TTL goes
   cold and you re-pay the write.
4. Keep your own loop warm: between-step turns are prompt one-line progress
   notes, no long deliberation. Heavy thinking happened at Plan time.
5. Same agentType per tier — varying tool sets per spawn changes the rendered
   prefix.

After each step completes, append one ledger line to `/tmp/$RUN/ledger.md`:

```
step-id | status | est | actual≈ | note
```

"actual≈" = step estimate input + measured output length (per-agent usage
isn't exposed; approximation is for trend detection). **Circuit breaker:** if
cumulative actual exceeds the dial's breaker multiple of cumulative estimate
at any step boundary — at low/medium/high, pause, show the ledger, re-confirm
with the user before continuing; at xhigh, append a `⚠ over estimate` ledger
line and keep going; at max, the breaker is off (ledger still written).

## Phase 5 — Verify

Fresh-context sonnet verification per the dial: one verifier at low–high;
at xhigh/max, two lenses for write work — one correctness-vs-criteria, one
spec/design-conformance — spawned in the same turn. Every verifier sees ONLY
the diff (or changed-file paths) + acceptance criteria — never the
implementer's reasoning or report. VERIFIER grammar, dial's verifier cap,
findings only, `PASS.` if clean.

## Phase 6 — Synthesize

Inline. Merge worker reports (pull elided detail from scratch files only if
needed), quote `/tmp/$RUN/decision.md` if an arbitration happened, write the
final report, append the full ledger table (est vs. actual per step + totals).

## Failure handling

Worker fails or returns garbage ⇒ retry once with the failure note appended to
its contract. Second failure ⇒ do that item inline yourself, or surface it in
the final report as **NOT DONE** — never silently dropped. No resume journal:
if the session dies, `/tmp/$RUN/ledger.md` is the manual restart aid, that's
the whole feature.

**Background-isolation guard:** if a worker's Write fails with "parent bg
session hasn't isolated yet, writes to the shared checkout are blocked", the
run is a background session in a git repo. Preferred fix: call
`EnterWorktree` once (before re-spawning the wave) so the whole run shares
one worktree and merges back at the end. Per-worker `isolation: "worktree"`
also works but gives each writer its own worktree to merge — only use it for
a single straggler. Repos that accept direct bg writes can instead set
`"worktree": {"bgIsolation": "none"}` in `.claude/settings.json`.

## Reference files — when to open each

| File | Open when |
|---|---|
| `reference/contracts.md` | Phase 1, before writing the first delegation. |
| `reference/diagrams.md` | Phase 3, before rendering the diagram. |
| `reference/fable.md` | Only when a Fable trigger fires or `--fable` passed (and key is set). |
| `reference/headroom.md` | Only when `--headroom` passed but the proxy is not detected. |
| `scripts/fable_arbitrate.sh` | Never read — execute via Bash only. |
