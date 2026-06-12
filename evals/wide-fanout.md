# Eval: wide fanout

**Prompt:** `/worktrickle bump lodash to v5 and fix call sites in packages/{a,b,c,d}` (4 independent packages, no shared files)

**Expected behavior:**
- 1 haiku scout; plan partitions on package boundaries (provably disjoint).
- 4 haiku mechanical workers, all spawned in one turn, concurrency 4/4.
- No two workers share any file. One sonnet verifier after fan-in.
- Diagram: 4-wide rank, equal box widths, rails aligned, ≤100 cols.

**Fail conditions:** >4 concurrent; sonnet used for mechanical swaps;
workers spawned across multiple turns (extra orchestrator turns, and slow
gaps risk the 5-min TTL on earlier cache writes going cold).

**Effort:** assumes `--effort low` (4 workers fit the low 4-concurrent cap exactly; at higher levels the cap is 6/8/10/uncapped so the wave shape is unchanged).
