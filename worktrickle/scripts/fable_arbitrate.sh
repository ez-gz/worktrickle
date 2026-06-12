#!/usr/bin/env bash
# worktrickle: one-shot Fable 5 plan arbitration.
# Usage: fable_arbitrate.sh /tmp/wt-<run>/fable-q.json
#   fable-q.json: {"task": str, "option_a": str, "option_b": str, "constraints": [str, ...]}
# Stdout: arbiter JSON {"decision":"A"|"B","rationale":...,"risks":[...]} on success,
#         {"fallback":"<reason>"} otherwise.
# Exit:   0 ok · 2 error (no key / oversize / network / non-200 / truncated / malformed) · 3 refusal.
set -u

Q="${1:?usage: fable_arbitrate.sh <fable-q.json>}"
[ -n "${ANTHROPIC_API_KEY:-}" ] || { echo '{"fallback":"ANTHROPIC_API_KEY unset"}'; exit 2; }
[ -f "$Q" ] || { echo '{"fallback":"payload file not found"}'; exit 2; }
SIZE=$(wc -c < "$Q" | tr -d ' ')
[ "$SIZE" -le 12288 ] || { echo "{\"fallback\":\"payload ${SIZE}B > 12288B cap; trim the options\"}"; exit 2; }

REQ=$(python3 - "$Q" 2>/dev/null <<'PY'
import json, sys
q = json.load(open(sys.argv[1]))
user = (f"{q['task']}\n\nOPTION A:\n{q['option_a']}\n\nOPTION B:\n{q['option_b']}\n\n"
        "CONSTRAINTS:\n" + "\n".join(f"- {c}" for c in q.get("constraints", [])))
body = {
    "model": "claude-fable-5",
    # max_tokens must leave room for adaptive thinking: thinking tokens bill
    # as output and count against max_tokens (budget_tokens is removed on
    # Fable). 8000 bounds worst-case spend at ~$0.40 out; the answer JSON
    # itself is tiny.
    "max_tokens": 8000,
    "output_config": {"effort": "high"},
    # No "thinking" param: always-on for Fable; explicit disabled => 400.
    # Omit temperature/top_p/top_k: unnecessary for a constrained pick, and
    # sampler params are restricted on newer thinking models.
    "system": ('You are an arbiter. Pick one option. Output ONLY JSON: '
               '{"decision": "A"|"B", "rationale": "<=120 words", '
               '"risks": ["<=3 one-line risks of the chosen option"]}'),
    "messages": [{"role": "user", "content": user}],
}
print(json.dumps(body))
PY
) || { echo '{"fallback":"malformed fable-q.json"}'; exit 2; }

RESP=$(curl -sS --max-time 120 https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "$REQ") || { echo '{"fallback":"network error"}'; exit 2; }

RESP="$RESP" python3 <<'PY'
import json, os, sys
try:
    r = json.loads(os.environ["RESP"])
except Exception:
    print('{"fallback":"unparseable API response"}'); sys.exit(2)
if r.get("type") == "error":
    msg = r.get("error", {}).get("message", "api error")[:200]
    print(json.dumps({"fallback": msg})); sys.exit(2)
if r.get("stop_reason") == "refusal":          # safety classifiers, HTTP 200
    print('{"fallback":"refusal"}'); sys.exit(3)
if r.get("stop_reason") == "max_tokens":       # thinking ate the budget; answer truncated
    print('{"fallback":"truncated"}'); sys.exit(2)
text = "".join(b.get("text", "") for b in r.get("content", [])
               if b.get("type") == "text").strip()
if text.startswith("```"):                      # tolerate fenced JSON
    text = text.strip("`\n")
    if text.startswith("json"):
        text = text[4:]
try:
    d = json.loads(text)
    assert d.get("decision") in ("A", "B")
    assert isinstance(d.get("rationale"), str)
except Exception:
    print('{"fallback":"malformed decision JSON"}'); sys.exit(2)
print(json.dumps(d))
PY
