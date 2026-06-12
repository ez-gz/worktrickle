// worktrickle marketing site — app.js

// ── terminal animation ────────────────────────────────────────────────────────

const DIAGRAM = [
  ['box', '╔════════════════════════════════════════════════════════════════╗'],
  ['box', '║ worktrickle: "migrate logging to structlog"                     ║'],
  ['box', '╚════════════════════════════════════════════╤═══════════════════╝'],
  ['box', '                                             ▼'],
  ['box', '                                ┌─────────────────────────┐'],
  ['box', '                                │ scout                   │'],
  ['box', '                                │ haiku · ~10k            │'],
  ['box', '                                │ read-only src/          │'],
  ['box', '                                └────────────┬────────────┘'],
  ['box', '                                             │ [2 viable strategies]'],
  ['box', '                                             ▼'],
  ['box', '                                ┌─────────────────────────┐'],
  ['box', '                                │ plan: 3 partitions      │'],
  ['box', '                                │ inline · ~3k            │'],
  ['box', '                                └────────────┬────────────┘'],
  ['box', '                                             │ [user approval gate]'],
  ['box', '                                             ▼'],
  ['box', '                                ┌─────────────────────────┐'],
  ['box', '                                │ arbitrate strategy      │'],
  ['box', '                                │ ◆ fable · ~3k ($0.07)   │'],
  ['box', '                                │ shim vs big-bang        │'],
  ['box', '                                └────────────┬────────────┘'],
  ['box', '                 ┌─────────────────────────┬─┴───────────────────────┐'],
  ['box', '                 ▼                         ▼                         ▼'],
  ['box', '      ┌─────────────────────┐   ┌─────────────────────┐   ┌─────────────────────┐'],
  ['box', '      │ worker: api/        │   │ worker: core/       │   │ worker: jobs/       │'],
  ['box', '      │ sonnet · ~19k       │   │ sonnet · ~19k       │   │ haiku · ~13k        │'],
  ['box', '      │ writes src/api/     │   │ writes src/core/    │   │ mechanical swap     │'],
  ['box', '      └──────────┬──────────┘   └──────────┬──────────┘   └──────────┬──────────┘'],
  ['box', '                 └─────────────────────────┼─────────────────────────┘'],
  ['box', '                                           │ [3 reports ≤700 tok each]'],
  ['box', '                                           ▼'],
  ['box', '                                ┌─────────────────────────┐'],
  ['box', '                                │ verify                  │'],
  ['box', '                                │ sonnet · ~13k           │'],
  ['box', '                                │ sees diff+criteria only │'],
  ['box', '                                └────────────┬────────────┘'],
  ['box', '                                             ▼'],
  ['box', '                                ┌─────────────────────────┐'],
  ['box', '                                │ synthesize + ledger     │'],
  ['box', '                                │ inline · ~3k            │'],
  ['box', '                                └─────────────────────────┘'],
  ['budget', '  legend: ◆ = direct Fable 5 API call (skipped if no ANTHROPIC_API_KEY)'],
  ['budget', '  budget: ~86k est ≈ $0.31 (+$0.07 fable) · effort low · conc 3/4'],
];

const PROGRESS = [
  ['approve', '  Approve and run / Edit plan / Cancel?'],
  ['prompt', '> approve'],
  ['wt', 'wt: fable arbitration → decision: A (shim) — "reversible, ships behind a flag"'],
  ['wt', 'wt: wave 1 — spawning 3 workers in one turn (cache-warm)...'],
  ['done', 'wt: worker api/  DONE  (3 files, pytest tests/api -q: 41 passed)'],
  ['done', 'wt: worker core/ DONE  (7 files, pytest tests/core -q: 88 passed)'],
  ['done', 'wt: worker jobs/ DONE  (2 files, mechanical swap verified)'],
  ['done', 'wt: verify → PASS.'],
];

const LEDGER_HEADER = '  ┌─────────────┬────────┬──────┬─────────┬──────────────────────┐';
const LEDGER_TITLE  = '  │ step        │ status │ est  │ actual≈ │ note                 │';
const LEDGER_SEP    = '  ├─────────────┼────────┼──────┼─────────┼──────────────────────┤';
const LEDGER_ROWS   = [
  '  │ scout-1     │ done   │ 10k  │ 11k     │ 312 call sites       │',
  '  │ fable       │ done   │  3k  │  3k     │ decision: A (shim)   │',
  '  │ worker-api  │ done   │ 19k  │ 17k     │ 41 tests pass        │',
  '  │ worker-core │ done   │ 19k  │ 22k     │ 88 tests pass        │',
  '  │ worker-jobs │ done   │ 13k  │ 12k     │ mechanical           │',
  '  │ verify      │ done   │ 13k  │ 13k     │ PASS                 │',
  '  │ inline ×3   │ done   │  9k  │  9k     │ triage/plan/synth    │',
  '  ├─────────────┼────────┼──────┼─────────┼──────────────────────┤',
  '  │ total       │        │ 86k  │ 87k     │ ≈ $0.31 (+$0.07 fable│',
  '  └─────────────┴────────┴──────┴─────────┴──────────────────────┘',
];

function spanOf(cls, text) {
  return `<span class="${cls}">${escHtml(text)}</span>`;
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class TermAnimation {
  constructor(el) {
    this.el = el;
    this.running = false;
    this.html = '';
  }

  append(html) {
    this.html += html;
    this.el.innerHTML = this.html;
  }

  appendLine(html) {
    this.append(html + '\n');
  }

  async typeText(text, cls, delay = 40) {
    for (const ch of text) {
      if (!this.running) return;
      this.html += `<span class="${cls}">${escHtml(ch)}</span>`;
      this.el.innerHTML = this.html + '<span class="cursor"> </span>';
      await sleep(delay + Math.random() * 20);
    }
    this.el.innerHTML = this.html;
  }

  async pause(ms) {
    if (!this.running) return;
    await sleep(ms);
  }

  async run() {
    this.running = true;
    this.html = '';
    this.el.innerHTML = '';

    // user command
    this.append(spanOf('term-prompt', '> '));
    await this.typeText('/worktrickle migrate logging to structlog', 'term-prompt', 35);
    this.append('\n');
    await this.pause(400);

    // triage
    this.appendLine(spanOf('term-wt', 'wt: triage — multi-area write task, cold scope. Pipeline it.'));
    this.appendLine(spanOf('term-wt', '    (run: wt-c7d1 · effort low)'));
    await this.pause(500);
    this.appendLine(spanOf('term-wt', 'wt: scouting src/ (1 haiku agent, read-only)...'));
    await this.pause(900);
    this.appendLine(spanOf('term-wt', 'wt: scout done — 312 call sites across api/, core/, jobs/; 2 viable'));
    this.appendLine(spanOf('term-wt', '    strategies (compat shim vs big-bang). Proposing Fable arbitration.'));
    this.append('\n');
    await this.pause(600);

    // diagram draws line by line
    for (const [type, line] of DIAGRAM) {
      if (!this.running) return;
      const cls = type === 'budget' ? 'term-budget' : 'term-box';
      this.appendLine(spanOf(cls, line));
      await this.pause(type === 'budget' ? 200 : 55);
    }

    await this.pause(500);

    // approval and progress
    for (const [type, line] of PROGRESS) {
      if (!this.running) return;
      let cls = 'term-wt';
      if (type === 'approve') cls = 'term-approve';
      if (type === 'prompt') cls = 'term-prompt';
      if (type === 'done') cls = 'term-done';
      this.appendLine(spanOf(cls, line));
      await this.pause(type === 'prompt' ? 120 : 380);
    }

    await this.pause(400);
    this.append('\n');

    // ledger
    this.appendLine(spanOf('term-table', LEDGER_HEADER));
    this.appendLine(spanOf('term-table', LEDGER_TITLE));
    this.appendLine(spanOf('term-table', LEDGER_SEP));
    await this.pause(200);
    for (const row of LEDGER_ROWS) {
      if (!this.running) return;
      this.appendLine(spanOf('term-table', row));
      await this.pause(140);
    }

    await this.pause(4000);
    if (this.running) this.run();
  }

  stop() { this.running = false; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── bar animation ─────────────────────────────────────────────────────────────

function animateBars() {
  const naiveFill = document.getElementById('bar-naive');
  const wtFill    = document.getElementById('bar-wt');
  const naiveNum  = document.getElementById('num-naive');
  const wtNum     = document.getElementById('num-wt');

  if (!naiveFill) return;

  // Naive: ~1,290,000 tokens (~15x), worktrickle: ~87,000
  const naiveTarget = 1290000;
  const wtTarget    = 87000;
  const duration    = 1800;
  const start       = performance.now();

  function frame(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);

    naiveFill.style.width = (ease * 100) + '%';
    wtFill.style.width    = (ease * (wtTarget / naiveTarget) * 100) + '%';

    const nv = Math.round(ease * naiveTarget);
    const wv = Math.round(ease * wtTarget);
    naiveNum.textContent = nv >= 1000 ? (nv / 1000).toFixed(0) + 'k' : nv;
    wtNum.textContent    = wv >= 1000 ? (wv / 1000).toFixed(0) + 'k' : wv;

    if (t < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

// ── effort dial ───────────────────────────────────────────────────────────────

const EFFORT_DATA = {
  low: {
    caps: '4 concurrent / 10 total',
    scout: '400 tok',
    worker: '700 tok',
    verifier: '500 tok',
    model: 'haiku scouts + haiku mechanical',
    breaker: 'pause at 2x est',
  },
  medium: {
    caps: '6 concurrent / 16 total',
    scout: '600 tok',
    worker: '1200 tok',
    verifier: '800 tok',
    model: 'haiku scouts + sonnet workers',
    breaker: 'pause at 3x est',
  },
  high: {
    caps: '8 concurrent / 24 total',
    scout: '1000 tok',
    worker: '3000 tok',
    verifier: '2000 tok',
    model: 'haiku scouts + sonnet workers/verifiers',
    breaker: 'pause at 4x est',
  },
  xhigh: {
    caps: '10 concurrent / 40 total',
    scout: '2000 tok',
    worker: '5000 tok',
    verifier: '3000 tok',
    model: 'sonnet scouts + sonnet/opus workers',
    breaker: 'pause at 5x est',
  },
  max: {
    caps: 'uncapped',
    scout: '3000 tok',
    worker: '6000 tok',
    verifier: '4000 tok',
    model: 'sonnet scouts + opus workers',
    breaker: 'none (Max plan)',
  },
};

function setEffort(level) {
  const d = EFFORT_DATA[level];
  document.getElementById('r-caps').textContent     = d.caps;
  document.getElementById('r-scout').textContent    = d.scout;
  document.getElementById('r-worker').textContent   = d.worker;
  document.getElementById('r-verifier').textContent = d.verifier;
  document.getElementById('r-model').textContent    = d.model;
  document.getElementById('r-breaker').textContent  = d.breaker;

  document.querySelectorAll('.dial-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.level === level);
  });
}

// ── pipeline IntersectionObserver ─────────────────────────────────────────────

function initPipeline() {
  const phases = document.querySelectorAll('.phase');
  if (!phases.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('visible');
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.2 });

  phases.forEach((p, i) => {
    setTimeout(() => obs.observe(p), i * 80);
  });
}

// ── bars IntersectionObserver ─────────────────────────────────────────────────

function initBarObs() {
  const track = document.getElementById('bar-naive');
  if (!track) return;
  let fired = false;
  const obs = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting && !fired) {
      fired = true;
      animateBars();
      obs.disconnect();
    }
  }, { threshold: 0.3 });
  obs.observe(track.parentElement);
}

// ── copy button ───────────────────────────────────────────────────────────────

function initCopy() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = btn.dataset.copy;
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'copy';
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });
}

// ── init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  // terminal
  const termOut = document.getElementById('term-output');
  if (termOut) {
    const anim = new TermAnimation(termOut);
    anim.run();

    const replay = document.getElementById('replay-btn');
    if (replay) {
      replay.addEventListener('click', () => {
        anim.stop();
        setTimeout(() => anim.run(), 50);
      });
    }
  }

  // effort dial
  document.querySelectorAll('.dial-btn').forEach(btn => {
    btn.addEventListener('click', () => setEffort(btn.dataset.level));
  });
  setEffort('high');

  // pipeline
  initPipeline();

  // bars
  initBarObs();

  // copy
  initCopy();
});
