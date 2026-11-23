// Home headline (site-design-system.md §4.1): "Good design is" stays still, followed by a
// phrase that changes every 3.5s with a split-flap wave.
//
// How it works
// - The sentence keeps the exact look of normal text: every character is drawn at the
//   position the browser itself gives it (kerning included), measured from a hidden copy.
// - The static part is drawn once and never moves. Each character of the phrase is a "cell"
//   that pairs the old character with the new one; cells beyond a phrase's length flip to
//   or from blank.
// - A flip runs bottom to top: the bottom half of the old character folds up (150ms, ease-in)
//   and the new top half swings up into place on spring-state. Cell n starts 35ms after cell n-1 (a left-to-right
//   wave).
// - Wide screens: the sentence sits on one line. The width of the longest sentence is
//   reserved and centred, so "Good design is" stays put; the font size is lowered only as far
//   as needed for that sentence to fit. Below 768px the phrase sits on its own line under
//   "Good design is", both centred (the longest phrase fitted the same way).
// - Reduced motion: no flips; the phrase cross-fades (200ms).

import { SPRINGS, reduceMotion } from "./spring.js";

const SWITCH_EVERY = 3500;       // ms between the start of two switches
const FLIP_TOP = 150;            // first half: old bottom half folds up (ms), ease-in
const WAVE = 35;                 // ms between neighbouring cells
const FADE = 200;                // reduced-motion cross-fade (ms)

// Analytic spring (same response / damping maths as spring.js) for the bottom half's landing.
const { response, damping } = SPRINGS.state;
const W = 2 * Math.PI / response;
const WD = W * Math.sqrt(1 - damping * damping);
const springAt = t => 1 - Math.exp(-damping * W * t) * (Math.cos(WD * t) + (damping * W / WD) * Math.sin(WD * t));
const SETTLE = Math.log(1000) / (damping * W) * 1000;          // ms until within 0.1%

const easeIn = u => u * u * u;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function initFlap(el) {
  const phrases = JSON.parse(el.dataset.flap || "[]");
  const lead = el.dataset.flapStatic || "";
  if (phrases.length < 2) return;

  // Screen readers get the first sentence once, as plain text; the moving board is hidden.
  const spoken = document.createElement("span");
  spoken.className = "visually-hidden";
  spoken.textContent = lead + " " + phrases[0];
  const board = document.createElement("span");
  board.className = "flap";
  board.setAttribute("aria-hidden", "true");
  const measurer = document.createElement("span");
  measurer.className = "flap__measure";
  measurer.setAttribute("aria-hidden", "true");

  let current = 0;               // index of the phrase on screen
  let still = [];                // glyphs of the static part
  let layouts = [];              // per phrase: [{ ch, x, y }]
  let cells = [];                // DOM cells, reused; cells[0..still.length) hold the static part
  let anim = null;               // running switch, if any
  let timer = 0, raf = 0;
  let visible = true;
  let cellH = 100;

  // ---------- Measuring: where the browser puts every character ----------
  function layoutOnce() {
    measurer.textContent = "";
    const blocks = phrases.map(p => {
      const block = document.createElement("span");
      block.className = "flap__measure-sentence";
      const a = document.createElement("span");
      a.className = "flap__measure-static";
      a.textContent = lead;
      const b = document.createElement("span");
      b.className = "flap__measure-phrase";
      b.textContent = p;
      block.append(a, " ", b);
      measurer.appendChild(block);
      return { block, a, b };
    });
    const origin = measurer.getBoundingClientRect();
    const range = document.createRange();
    const glyphsOf = node => {
      const out = [], text = node.data;
      for (let i = 0; i < text.length; i++) {
        range.setStart(node, i); range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        out.push({ ch: text[i], x: r.left - origin.left, y: r.top - origin.top });
      }
      return out;
    };
    // Widest line: the whole sentence on wide screens, the longest line when split.
    const width = Math.max(...blocks.map(({ block, a, b }) =>
      Math.max(block.getBoundingClientRect().width, a.getBoundingClientRect().width, b.getBoundingClientRect().width)));
    return { blocks, glyphsOf, width };
  }

  function measure() {
    el.style.fontSize = "";
    board.style.width = "";
    const avail = el.clientWidth;
    let m = layoutOnce();
    const split = getComputedStyle(m.blocks[0].b).display === "block";
    const lineW = split
      ? Math.max(...m.blocks.map(({ a, b }) => Math.max(a.getBoundingClientRect().width, b.getBoundingClientRect().width)))
      : Math.max(...m.blocks.map(({ block }) => block.getBoundingClientRect().width));
    if (lineW > avail) {
      // Lower the size only as far as needed (to the half pixel below), then measure again.
      const base = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = Math.floor(base * avail / lineW * 2) / 2 + "px";
      m = layoutOnce();
    }
    const lh = parseFloat(getComputedStyle(measurer).lineHeight);
    still = m.glyphsOf(m.blocks[0].a.firstChild);
    const minY = still[0].y;
    still = still.filter(g => g.ch !== " ");
    layouts = m.blocks.map(({ b }) => m.glyphsOf(b.firstChild));
    [still, ...layouts].forEach(list => list.forEach(g => (g.y -= minY)));
    const bottom = Math.max(...layouts.flat().map(g => g.y)) + lh;
    board.style.height = bottom + "px";
    if (!split) {
      // Reserve the longest sentence's width and centre that block.
      board.style.width = Math.ceil(Math.max(...m.blocks.map(({ block }) => block.getBoundingClientRect().width))) + "px";
    }
    return lh;
  }

  // ---------- Cells: six layers each (rest, fade, two static halves, two flaps) ----------
  function layer(cls) {
    const s = document.createElement("span");
    s.className = "flap__g " + cls;
    return s;
  }
  function ensureCells(n) {
    while (cells.length < n) {
      const c = {
        rest: layer("flap__g--rest"),
        fade: layer("flap__g--rest"),
        topStatic: layer("flap__g--top"),
        bottomStatic: layer("flap__g--bottom"),
        topFlap: layer("flap__g--top"),
        bottomFlap: layer("flap__g--bottom"),
      };
      c.all = [c.rest, c.fade, c.topStatic, c.bottomStatic, c.topFlap, c.bottomFlap];
      c.all.forEach(l => board.appendChild(l));
      c.text = new Map();
      cells.push(c);
    }
    cells.slice(n).forEach(c => c.all.forEach(l => (l.style.opacity = 0)));
  }
  function put(cell, key, g, angle, opacity) {
    const l = cell[key];
    if (!g || g.ch === " " || opacity <= 0) { if (l.style.opacity !== "0") l.style.opacity = 0; return; }
    if (cell.text.get(key) !== g.ch) { l.textContent = g.ch; cell.text.set(key, g.ch); }
    l.style.transform = angle
      ? `translate(${g.x}px, ${g.y}px) perspective(${4 * cellH}px) rotateX(${angle}deg)`
      : `translate(${g.x}px, ${g.y}px)`;
    l.style.opacity = opacity >= 1 ? 1 : opacity;
  }
  function clear(c, ...keys) { keys.forEach(k => put(c, k, null)); }

  const phraseCell = i => cells[still.length + i];

  // Resting state: the static part and the current phrase, each character drawn once, whole.
  function showRest(idx) {
    const glyphs = layouts[idx];
    ensureCells(still.length + glyphs.length);
    still.forEach((g, i) => {
      put(cells[i], "rest", g, 0, 1);
      clear(cells[i], "fade", "topStatic", "bottomStatic", "topFlap", "bottomFlap");
    });
    glyphs.forEach((g, i) => {
      const c = phraseCell(i);
      put(c, "rest", g, 0, 1);
      clear(c, "fade", "topStatic", "bottomStatic", "topFlap", "bottomFlap");
    });
  }

  // Pair old and new characters by their position in the phrase.
  function pairs(from, to) {
    const a = layouts[from], b = layouts[to];
    return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => {
      const f = a[i] || null, t = b[i] || null;
      const same = f && t && f.ch === t.ch && Math.abs(f.x - t.x) < 0.5 && Math.abs(f.y - t.y) < 0.5;
      return { from: f, to: t, changes: !same };
    });
  }

  // The flip of one cell at time t (ms since that cell began).
  function drawFlip(c, a, b, t) {
    put(c, "rest", null); put(c, "fade", null);
    if (t <= 0) {
      put(c, "rest", a, 0, 1);
      clear(c, "topStatic", "bottomStatic", "topFlap", "bottomFlap");
    } else if (t < FLIP_TOP) {
      const u = clamp01(t / FLIP_TOP);
      const e = easeIn(u);
      put(c, "bottomFlap", a, 90 * e, 1 - 0.4 * e);              // old bottom half folds up
      put(c, "bottomStatic", b, 0, u);                            // new bottom half revealed
      put(c, "topStatic", a, 0, 1);
      put(c, "topFlap", null);
    } else {
      const angle = -90 * (1 - springAt((t - FLIP_TOP) / 1000));  // -90 → 0, small spring settle
      put(c, "bottomFlap", null);
      put(c, "bottomStatic", b, 0, 1);
      put(c, "topFlap", b, angle, 1);                             // new top half swings up into place
      put(c, "topStatic", a, 0, clamp01(-angle / 90));
    }
  }

  function render(now) {
    if (!anim) return;
    const t = now - anim.start;
    let done;
    if (anim.fade) {
      const u = clamp01(t / FADE);
      anim.cells.forEach((p, i) => {
        const c = phraseCell(i);
        clear(c, "topStatic", "bottomStatic", "topFlap", "bottomFlap");
        put(c, "rest", p.to, 0, u);
        put(c, "fade", p.from, 0, 1 - u);
      });
      done = t >= FADE;
    } else {
      anim.cells.forEach((p, i) => {
        if (p.changes) drawFlip(phraseCell(i), p.from, p.to, t - i * WAVE);
        else put(phraseCell(i), "rest", p.to, 0, 1);
      });
      done = t >= (anim.cells.length - 1) * WAVE + FLIP_TOP + SETTLE;
    }
    if (done) {
      anim = null;
      showRest(current);
      return;
    }
    raf = requestAnimationFrame(render);
  }

  function next() {
    const from = current, to = (current + 1) % phrases.length;
    current = to;
    const list = pairs(from, to);
    ensureCells(still.length + list.length);
    anim = { start: performance.now(), cells: list, fade: reduceMotion.matches };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  // ---------- Timing: every 3.5s while the opening is on screen and the tab is visible ----------
  function schedule() {
    clearTimeout(timer);
    if (visible && !document.hidden) timer = setTimeout(() => { next(); schedule(); }, SWITCH_EVERY);
  }
  document.addEventListener("visibilitychange", schedule);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; schedule(); }).observe(el);

  // ---------- Build, and rebuild when the width changes ----------
  function build() {
    if (anim) { cancelAnimationFrame(raf); anim = null; }
    cellH = measure();
    showRest(current);
  }

  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load(`400 1em "Cal Sans"`), document.fonts.ready]).catch(() => {})
    : Promise.resolve();
  fontsReady.then(() => {
    el.textContent = "";
    el.append(spoken, board, measurer);
    el.classList.add("is-flap");
    build();
    let lastW = el.clientWidth;
    new ResizeObserver(() => {
      if (el.clientWidth === lastW) return;
      lastW = el.clientWidth;
      build();
    }).observe(el);
    schedule();
  });
}
