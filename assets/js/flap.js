// Opening statements on Home (site-design-system.md §4.1): two statements, centred,
// switching every 5 seconds with a split-flap (flip clock) animation.
//
// How it works
// - The statement keeps the exact look of normal text: every character is drawn at the
//   position the browser itself gives it (kerning included), measured from a hidden copy.
// - Each character position is a "cell" that pairs the old character with the new one.
//   A flip folds the top half of the old character down and swings the new bottom half
//   into place.
// - Every character that changes flips exactly once, and all of them flip together: one
//   clock, one start frame, one curve, so every character lands at the same moment.
// - Reduced motion: no flips; the statements cross-fade (200ms).

import { SPRINGS, reduceMotion } from "./spring.js";

const SWITCH_EVERY = 5000;       // ms between the start of two switches
const FLIP_TOP = 150;            // top half falls (ms), ease-in

// Analytic spring (same response / damping maths as spring.js) for the bottom half's landing.
const { response, damping } = SPRINGS.state;
const W = 2 * Math.PI / response;
const WD = W * Math.sqrt(1 - damping * damping);
const springAt = t => 1 - Math.exp(-damping * W * t) * (Math.cos(WD * t) + (damping * W / WD) * Math.sin(WD * t));
const SETTLE = Math.log(1000) / (damping * W) * 1000;          // ms until within 0.1%

const easeIn = u => u * u * u;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export function initFlap(el) {
  const statements = JSON.parse(el.dataset.flap || "[]");
  if (statements.length < 2) return;

  // Screen readers get both statements once, as plain text; the moving board is hidden.
  const spoken = document.createElement("span");
  spoken.className = "visually-hidden";
  spoken.textContent = statements.join(" ");
  const board = document.createElement("span");
  board.className = "flap";
  board.setAttribute("aria-hidden", "true");
  const measurer = document.createElement("span");
  measurer.className = "flap__measure";
  measurer.setAttribute("aria-hidden", "true");

  let current = 0;               // index of the statement on screen
  let layouts = [];              // per statement: [{ ch, x, y, line, index }]
  let cells = [];                // DOM cells, reused
  let anim = null;               // running switch, if any
  let timer = 0, raf = 0;
  let visible = true;
  let cellH = 100;

  // ---------- Measuring: where the browser puts every character ----------
  function measure() {
    measurer.textContent = "";
    const blocks = statements.map(s => {
      const block = document.createElement("span");
      block.className = "flap__measure-statement";
      // Break after the comma first ("Small details," / "big feelings."); each half
      // wraps further by itself only when it does not fit.
      s.split(/(?<=,)\s+/).forEach(half => {
        const line = document.createElement("span");
        line.className = "flap__measure-half";
        line.textContent = half;
        block.appendChild(line);
      });
      measurer.appendChild(block);
      return block;
    });

    const origin = measurer.getBoundingClientRect();
    const range = document.createRange();
    const raw = blocks.map(block => {
      const glyphs = [];
      block.querySelectorAll(".flap__measure-half").forEach(half => {
        const node = half.firstChild, text = node.data;
        for (let i = 0; i < text.length; i++) {
          range.setStart(node, i); range.setEnd(node, i + 1);
          const rects = range.getClientRects();
          const r = rects[rects.length - 1] || range.getBoundingClientRect();
          glyphs.push({ ch: text[i], x: r.left - origin.left, top: r.top - origin.top });
        }
      });
      // Group into visual lines by their top edge; drop spaces at line ends.
      const lines = [];
      for (const g of glyphs) {
        let line = lines.find(l => Math.abs(l.top - g.top) < 2);
        if (!line) lines.push(line = { top: g.top, glyphs: [] });
        line.glyphs.push(g);
      }
      lines.sort((a, b) => a.top - b.top);
      for (const l of lines) {
        while (l.glyphs.length && l.glyphs[0].ch === " ") l.glyphs.shift();
        while (l.glyphs.length && l.glyphs[l.glyphs.length - 1].ch === " ") l.glyphs.pop();
      }
      return lines.filter(l => l.glyphs.length);
    });

    // Every statement is centred vertically in the same box, so neither one moves the page.
    const lh = parseFloat(getComputedStyle(measurer).lineHeight);
    const rows = Math.max(...raw.map(lines => lines.length));
    board.style.height = rows * lh + "px";
    layouts = raw.map(lines => {
      const offset = (rows - lines.length) / 2 * lh;
      const out = [];
      lines.forEach((l, li) => l.glyphs.forEach((g, gi) =>
        out.push({ ch: g.ch, x: g.x, y: offset + li * lh, line: li, index: gi })));
      return out;
    });
    return lh;
  }

  // ---------- Cells: five layers each (rest, two static halves, two flaps) ----------
  function layer(cls) {
    const s = document.createElement("span");
    s.className = "flap__g " + cls;
    return s;
  }
  function ensureCells(n) {
    while (cells.length < n) {
      const c = {
        rest: layer("flap__g--rest"),
        topStatic: layer("flap__g--top"),
        bottomStatic: layer("flap__g--bottom"),
        topFlap: layer("flap__g--top"),
        bottomFlap: layer("flap__g--bottom"),
      };
      c.all = [c.rest, c.topStatic, c.bottomStatic, c.topFlap, c.bottomFlap];
      c.all.forEach(l => board.appendChild(l));
      c.text = new Map();
      cells.push(c);
    }
    cells.slice(n).forEach(c => c.all.forEach(l => (l.style.opacity = 0)));
  }
  function put(cell, key, g, angle, opacity) {
    const l = cell[key];
    if (!g || opacity <= 0) { if (l.style.opacity !== "0") l.style.opacity = 0; return; }
    if (cell.text.get(key) !== g.ch) { l.textContent = g.ch; cell.text.set(key, g.ch); }
    l.style.transform = angle
      ? `translate(${g.x}px, ${g.y}px) perspective(${4 * cellH}px) rotateX(${angle}deg)`
      : `translate(${g.x}px, ${g.y}px)`;
    l.style.opacity = opacity >= 1 ? 1 : opacity;
  }

  // Resting state: each character drawn once, whole.
  function showRest(idx) {
    const glyphs = layouts[idx];
    ensureCells(glyphs.length);
    glyphs.forEach((g, i) => {
      const c = cells[i];
      put(c, "rest", g, 0, 1);
      put(c, "topStatic", null); put(c, "bottomStatic", null);
      put(c, "topFlap", null); put(c, "bottomFlap", null);
    });
  }

  // Pair old and new characters by line and position in the line.
  function pairs(from, to) {
    const key = g => g.line + ":" + g.index;
    const map = new Map();
    layouts[from].forEach(g => map.set(key(g), { from: g, to: null }));
    layouts[to].forEach(g => {
      const p = map.get(key(g));
      if (p) p.to = g; else map.set(key(g), { from: null, to: g });
    });
    return [...map.values()].map(p => ({
      ...p,
      changes: (p.from ? p.from.ch : " ") !== (p.to ? p.to.ch : " "),
    }));
  }

  // The flip of one cell at time t (ms since the switch began). Every cell uses the same
  // timing, so they all fall and land together.
  function drawFlip(c, a, b, t) {
    put(c, "rest", null);
    if (t < FLIP_TOP) {
      const u = clamp01(t / FLIP_TOP);
      const e = easeIn(u);
      put(c, "topFlap", a, -90 * e, 1 - 0.4 * e);
      put(c, "topStatic", b, 0, u);
      put(c, "bottomStatic", a, 0, 1);
      put(c, "bottomFlap", null);
    } else {
      const angle = 90 * (1 - springAt((t - FLIP_TOP) / 1000));   // 90 → 0, small spring settle
      put(c, "topFlap", null);
      put(c, "topStatic", b, 0, 1);
      put(c, "bottomFlap", b, angle, 1);
      put(c, "bottomStatic", a, 0, clamp01(angle / 90));
    }
  }

  function render(now) {
    if (!anim) return;
    const t = now - anim.start;
    anim.cells.forEach((p, i) => {
      if (p.changes) drawFlip(cells[i], p.from, p.to, t);
      else put(cells[i], "rest", p.to || p.from, 0, 1);
    });
    if (t >= FLIP_TOP + SETTLE) {
      anim = null;
      showRest(current);
      return;
    }
    raf = requestAnimationFrame(render);
  }

  function next() {
    const from = current, to = (current + 1) % statements.length;
    current = to;
    if (reduceMotion.matches) {
      board.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: "ease-in" })
        .finished.then(() => {
          showRest(to);
          board.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 100, easing: "ease-out" });
        });
      return;
    }
    const list = pairs(from, to);
    ensureCells(list.length);
    anim = { start: performance.now(), cells: list };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(render);
  }

  // ---------- Timing: every 5s while the opening is on screen and the tab is visible ----------
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
