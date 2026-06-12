# worktrickle diagram grammar

The diagram is the run's contract — rendered before execution, approved by
the user, saved to `/tmp/wt-<run>/plan.txt`. The grammar is fixed; no
stylistic freedom. A crooked box is a shipping bug.

## Character set

| Purpose | Chars |
|---|---|
| Box borders + connectors | `─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼` |
| Arrowhead (always before a box top) | `▼` |
| Run boundary (this use ONLY) | `╔ ═ ╗ ║ ╚ ╝ ╤` |
| Fable node marker | `◆` |
| Warning | `⚠` |

Never mix `+-|` ASCII with Unicode in one diagram. Plain-ASCII fallback for
non-UTF terminals (same layout rules): `+ - |` for boxes, `v` for arrows,
`=` for the run boundary, `*` for fable, `!` for warnings.

## Layout rules

- Vertical Sugiyama ranks, one rank per phase/step. Flow strictly top→bottom.
- Width ≤ 100 columns hard, 76 target. Node titles 1–3 words.
- Node = 2–3 interior lines: title / `model · est-tokens` / optional flag line
  (`read-only`, `writes src/x/`, `◆ fable · ~3k ($0.07)`, `⚠`).
- All boxes in a rank padded to equal width so connectors land on exact
  column centers.
- Edge labels: sparse, bracketed, one space right of the vertical connector:
  `│ [user approval gate]`, `│ [findings ≤400 tok]`.
- Footer: legend line + budget line, always. Budget shows total est tokens,
  ≈$ figure, the run's effort level (`effort low|medium|high|xhigh|max`),
  ledger path; add `(+$0.07 fable)`, `concurrency N/<dial cap>`, and
  `headroom on` when applicable. Estimate above the dial's heavy threshold
  (150k low / 400k medium / 1M high / never at xhigh+) ⇒ `⚠ HEAVY RUN` line
  above the footer.

## Column math (do this with arithmetic, not eyeballing)

- Give every box an ODD interior width `w`; total width `w+2`; its center
  column (0-indexed, relative to box left edge) is `(w+2)//2` — exact.
- A bottom connector replaces the bottom border with
  `└ + ─×(c-1) + ┬ + ─×(w-c) + ┘` where `c = (w+2)//2`.
- Single-column flow: pick one center column `C`; every box's left margin is
  `C - (w+2)//2`; every `│`, `▼`, and `╤` sits at column `C`.
- Side-by-side rank of k boxes (total width T, gap g): child centers are
  `c_i = margin_i + (T//2)`. Choose g so the parent center `p` is an integer:
  - k odd: put the middle child's center at `p`.
  - k even: `p = (c_k/2 + c_k/2+1) / 2` — needs `T+g` even, so pick g odd
    when T is odd.

## Fan-out / fan-in construction

Fan-out (parent center `p`, child centers `c_1..c_k`), top to bottom:

1. Parent bottom border with `┬` at `p`.
2. Optional label line `│ [..]` at `p`.
3. Rail line: `┌` at `c_1`, `┐` at `c_k`, `─` between, with:
   `┼` at `p` if a child center coincides with `p` (k odd),
   else `┴` at `p`; `┬` at every other child center.
4. Arrow line: `▼` at every `c_i`.
5. The rank of boxes.

Fan-in is the mirror: each child's bottom border has `┬` at its own center;
rail line has `└` at `c_1`, `┘` at `c_k`, `┴` at interior child centers,
`┬` at `p` (or `┼` if coincident); then `│ [label]` and `▼` at `p`.

**Verification pass (mandatory before showing the user):** for every `▼`,
`│`, `╤`, `┬`, `┴`, `┼`, confirm the character directly above/below it in the
adjacent structural line sits in the same column. Count the longest line;
must be ≤100.

## Worked example 1 — linear

Input: scoped task, one unknown area ⇒ 1 scout + 1 worker + verifier.

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

## Worked example 2 — diamond (even fanout: `┴`/`┬` rails)

Input: compare two libraries ⇒ 2 read-only probes, inline verdict. Note the
rail centers: k=2 (even), so `p` is the midpoint and carries `┴` (out) / `┬`
(in) with corners at the child centers.

k=2 is plain-legal at medium effort and above (fanout minimum ≤2); at low it
needs SKILL.md's read-only-probe exception (probes that must not contaminate
each other). At low, 2 *write* items always batch into one worker — never
copy this layout for low-effort write work.

```
╔════════════════════════════════════════════════════════╗
║ worktrickle: "compare auth libs X and Y"               ║
╚════════════════════════════════╤═══════════════════════╝
                                 ▼
                    ┌─────────────────────────┐
                    │ plan: 2 probes          │
                    │ inline · ~3k            │
                    └────────────┬────────────┘
                   ┌─────────────┴─────────────┐
                   ▼                           ▼
        ┌─────────────────────┐     ┌─────────────────────┐
        │ probe lib X         │     │ probe lib Y         │
        │ haiku · ~10k        │     │ haiku · ~10k        │
        │ read-only           │     │ read-only           │
        └──────────┬──────────┘     └──────────┬──────────┘
                   └─────────────┬─────────────┘
                                 │ [2 reports ≤400 tok]
                                 ▼
                    ┌─────────────────────────┐
                    │ synthesize verdict      │
                    │ inline · ~3k            │
                    └─────────────────────────┘

  legend: inline = main session · boxes = subagents
  budget: ~26k tokens est ≈ $0.09 · effort low · concurrency 2/4
```

## Worked example 3 — wide fanout (k=4, even: `┴`/`┬` at midpoint, `┬`/`┴` at inner children)

Input: mechanical dependency bump across 4 independent packages ⇒ 4 haiku
workers, one wave at the concurrency cap.

```
╔════════════════════════════════════════════════════════════════════╗
║ worktrickle: "bump dep + fix call sites in 4 pkgs"                 ║
╚════════════════════════════════════════════╤═══════════════════════╝
                                             ▼
                                ┌─────────────────────────┐
                                │ scout                   │
                                │ haiku · ~10k            │
                                │ read-only packages/     │
                                └────────────┬────────────┘
                                             │ [findings ≤400 tok]
                                             ▼
                                ┌─────────────────────────┐
                                │ plan: 4 partitions      │
                                │ inline · ~3k            │
                                └────────────┬────────────┘
                                             │ [user approval gate]
            ┌─────────────────────┬──────────┴──────────┬─────────────────────┐
            ▼                     ▼                     ▼                     ▼
    ┌───────────────┐     ┌───────────────┐     ┌───────────────┐     ┌───────────────┐
    │ worker: pkg-a │     │ worker: pkg-b │     │ worker: pkg-c │     │ worker: pkg-d │
    │ haiku · ~13k  │     │ haiku · ~13k  │     │ haiku · ~13k  │     │ haiku · ~13k  │
    │ mech. swap    │     │ mech. swap    │     │ mech. swap    │     │ mech. swap    │
    └───────┬───────┘     └───────┬───────┘     └───────┬───────┘     └───────┬───────┘
            └─────────────────────┴──────────┬──────────┴─────────────────────┘
                                             │ [4 reports ≤700 tok each]
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

  legend: inline = main session · boxes = subagents
  budget: ~84k tokens est ≈ $0.22 · effort low · concurrency 4/4 · ledger: /tmp/wt-9f3e/
```

## Final checklist (copy of SKILL.md's, run before every render)

1. Compute ranks (one per step).
2. Size boxes — equal width per rank, odd interior widths.
3. Draw rails with the recipes above.
4. Verify every connector column aligns (the mandatory pass).
5. Count columns — longest line ≤100.
6. Append legend + budget footer.
