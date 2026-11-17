// Lab (site-design-system.md §6): filters, the card grid, and the prototypes hosted live.
//
// - Cards are built from /content/lab.json; adding a prototype = its folder + one entry.
// - Each card hosts lab/<id>/index.html unchanged, in a same-origin frame, so the prototype
//   keeps its own code, sizes and feel and is operated directly (mouse, finger, keyboard).
// - Theme: the frame starts in the page's theme (?theme=) and switches in the same frame as
//   the page; while it switches, the page hands its live colours to the frames each frame,
//   so both arrive together. Only colours are synced; the prototypes' design is untouched.
// - Performance: a frame loads when its card comes within one screen of view; once loaded,
//   its animation frames are held while the card is more than one screen away.
// - Filters: one spring (spring-travel) drives every card at once (leaving, moving, arriving),
//   so they all land together. Interruptible: a new filter starts from where cards are.

import { createSpring, reduceMotion } from "./spring.js";
import { smoothCorners } from "./squircle.js";
import { enterLate } from "./page-enter.js";

const KIND = { press: "Press", hover: "Hover", drag: "Drag" };
const LEAVE_SCALE = 0.96;

const root = document.documentElement;
const grid = document.querySelector("[data-lab-grid]");
const filtersEl = document.querySelector("[data-lab-filters]");
const statusEl = document.querySelector("[data-lab-status]");
const theme = () => (root.dataset.theme === "dark" ? "dark" : "light");

// ---------- Colour sync ----------
// During a theme switch the page copies its own live colour tokens into every prototype on
// each frame, so page and prototypes show exactly the same colours in the same frame and
// arrive together (spring-state, flat; 200ms fade with reduced motion). The prototypes' own
// colour transitions (400ms ease) are held off meanwhile; their motion keeps running.
const PAGE_TOKENS = ["--bg", "--surface", "--line", "--nav-selected", "--ink", "--ink-2", "--ink-3", "--accent"];
// Chat avatar tints (chat-quick-actions): not page tokens, so they follow the same progress.
const AV = {
  light: ["#E6D3C4", "#D3DDD2", "#D5D9E7", "#E6D2DC", "#E3DBC3"],
  dark:  ["#3B2F28", "#2C3630", "#2D3241", "#3A2D35", "#38331F"],
};
const HOST_CSS = `
html.lab-theme-sync body, html.lab-theme-sync body *,
html.lab-theme-sync body *::before, html.lab-theme-sync body *::after { transition: none !important; }
/* The frame is the card: it never scrolls on its own, so wheel and touch scrolling reach the page. */
html, body { overflow: hidden; }
`;

function hostThemeMs() {
  const v = getComputedStyle(root).getPropertyValue("--theme-dur").trim();
  return (parseFloat(v) || 250) * (v.endsWith("ms") ? 1 : v.endsWith("s") ? 1000 : 1);
}

// ---------- Build ----------
const cells = [];

function buildCell(p) {
  const li = document.createElement("li");
  li.className = "lab-cell";
  if (p.span === 2) li.classList.add("lab-cell--wide");   // two columns on desktop (§6)
  li.dataset.kind = p.category;

  const stage = document.createElement("div");
  stage.className = "lab-stage sq";
  stage.dataset.squircle = "16";
  stage.innerHTML = `<svg class="sq-shape" aria-hidden="true"><path class="line"/></svg>`;
  const frame = document.createElement("iframe");
  frame.title = `${p.title} prototype`;
  stage.prepend(frame);

  const meta = document.createElement("div");
  meta.className = "lab-meta";
  meta.innerHTML = `<h2 class="lab-meta__name"></h2><p class="lab-meta__kind"></p>`;
  meta.firstElementChild.textContent = p.title;
  meta.lastElementChild.textContent = KIND[p.category] || p.category;
  li.append(stage, meta);

  const c = {
    p, li, frame, kind: p.category,
    shown: true, leaving: false,
    x: 0, y: 0, s: 1, o: 1,             // current transform / opacity
    from: null, to: null,
    loaded: false, near: false, rafHold: null,
  };
  frame.addEventListener("load", () => onFrameLoad(c));
  return c;
}

// ---------- Frame: theme, colour sync, pausing ----------
function onFrameLoad(c) {
  let doc;
  try { doc = c.frame.contentDocument; } catch (e) { return; }
  if (!doc || !doc.documentElement || !c.frame.getAttribute("src")) return;   // the empty frame before loading
  c.loaded = true;
  const style = doc.createElement("style");
  style.textContent = HOST_CSS;
  doc.head.appendChild(style);
  doc.documentElement.dataset.theme = theme();   // in case the theme changed while it loaded

  // Hold the prototype's animation frames while its card is far from view. The prototypes
  // only animate after an interaction, so this only matters for a motion still settling.
  const w = c.frame.contentWindow;
  const native = w.requestAnimationFrame.bind(w);
  const held = [];
  w.requestAnimationFrame = cb => {
    if (c.near) return native(cb);
    held.push(cb);
    return 0;
  };
  c.rafHold = {
    release() { held.splice(0).forEach(cb => native(cb)); },
  };
}

const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, p) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * p)).join(", ")})`; };
const frameRoot = c => (c.loaded && c.frame.contentDocument ? c.frame.contentDocument.documentElement : null);

function pushColours() {
  const cs = getComputedStyle(root);
  const vals = PAGE_TOKENS.map(k => [k, cs.getPropertyValue(k).trim()]);
  // How far the page is from light to dark, read from its background (#F5… → #16…).
  const red = parseFloat((vals[0][1].match(/[d.]+/) || [245])[0]);
  const p = Math.min(1, Math.max(0, (245 - red) / (245 - 22)));
  for (const c of cells) {
    const r = frameRoot(c);
    if (!r) continue;
    for (const [k, v] of vals) r.style.setProperty(k, v);
    AV.light.forEach((l, i) => r.style.setProperty(`--av-${i + 1}`, mix(l, AV.dark[i], p)));
  }
}
function releaseColours() {
  for (const c of cells) {
    const r = frameRoot(c);
    if (!r) continue;
    PAGE_TOKENS.forEach(k => r.style.removeProperty(k));
    AV.light.forEach((_, i) => r.style.removeProperty(`--av-${i + 1}`));
    r.classList.remove("lab-theme-sync");
  }
}
let syncRaf = 0, syncUntil = 0;
function syncFrame() {
  pushColours();
  if (performance.now() < syncUntil) syncRaf = requestAnimationFrame(syncFrame);
  else { syncRaf = 0; releaseColours(); }
}
function startThemeSync(t) {
  // Prototypes not loaded yet simply start in the new theme.
  for (const c of cells) if (!c.loaded) c.frame.dataset.src = srcFor(c.p, t);
  pushColours();                                   // hold the current colours…
  for (const c of cells) {
    const r = frameRoot(c);
    if (!r) continue;
    r.classList.add("lab-theme-sync");
    r.dataset.theme = t;                           // …while the theme itself changes underneath
  }
  syncUntil = performance.now() + hostThemeMs() + 60;
  if (!syncRaf) syncRaf = requestAnimationFrame(syncFrame);
}

const srcFor = (p, t) => `/lab/${p.id}/?theme=${t}`;

// ---------- Filters ----------
const buttons = [...filtersEl.querySelectorAll(".lab-filter")];
const pillL = filtersEl.querySelector(".lab-pill__l");
const pillM = filtersEl.querySelector(".lab-pill__m");
const pillR = filtersEl.querySelector(".lab-pill__r");
let current = "all";

const pill = { x: 0, w: 0 };
function drawPill() {
  const cap = 18, x = pill.x, w = Math.max(cap * 2, pill.w);
  pillL.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
  pillR.style.transform = `translate3d(${(x + w - cap).toFixed(2)}px, 0, 0)`;
  // The middle overlaps each cap by 1px so no seam ever shows between the parts.
  pillM.style.transform = `translate3d(${(x + cap - 1).toFixed(2)}px, 0, 0) scaleX(${((w - 2 * cap + 2) / 100).toFixed(4)})`;
}
const pillX = createSpring("state", { precision: 0.05, onUpdate(v) { pill.x = v; drawPill(); } });
const pillW = createSpring("state", { precision: 0.05, onUpdate(v) { pill.w = v; drawPill(); } });

function placePill(animate) {
  const b = buttons.find(b => b.dataset.filter === current);
  if (!b) return;
  const x = b.offsetLeft, w = b.offsetWidth;
  if (animate) { pillX.set(x); pillW.set(w); }
  else { pillX.jump(x); pillW.jump(w); }
}

filtersEl.addEventListener("click", e => {
  const b = e.target.closest(".lab-filter");
  if (!b || b.dataset.filter === current) return;
  current = b.dataset.filter;
  buttons.forEach(t => t.setAttribute("aria-pressed", String(t === b)));
  placePill(true);
  applyFilter(true);
});

// ---------- Filtering the grid: leave, move and arrive on one spring ----------
const matches = c => current === "all" || c.kind === current;

function paint(c) {
  c.li.style.transform = (c.x || c.y || c.s !== 1)
    ? `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0) scale(${c.s.toFixed(4)})`
    : "";
  c.li.style.opacity = c.o >= 1 ? "" : String(Math.max(0, c.o));
}

const progress = createSpring("travel", {
  precision: 0.001,
  onUpdate(p) {
    for (const c of cells) {
      if (!c.from) continue;
      const lerp = k => c.from[k] + (c.to[k] - c.from[k]) * p;
      c.x = lerp("x"); c.y = lerp("y"); c.s = lerp("s");
      c.o = Math.min(1, Math.max(0, c.from.o + (c.to.o - c.from.o) * Math.min(1, p)));
      paint(c);
    }
  },
  onRest() {
    for (const c of cells) {
      if (!c.from) continue;
      c.from = c.to = null;
      if (c.leaving) {
        c.leaving = false;
        c.li.classList.remove("is-leaving");
        c.li.style.left = c.li.style.top = c.li.style.width = "";
        c.li.hidden = true;                       // stays loaded, keeps its state
        c.x = c.y = 0; c.s = 1; c.o = 1;
      }
      paint(c);
    }
  },
});

function applyFilter(animate) {
  const reduce = reduceMotion.matches;
  // 1. Where every card is on screen right now (layout box + current transform).
  const before = new Map();
  for (const c of cells) {
    if (c.li.hidden) continue;
    before.set(c, { left: c.li.offsetLeft + c.x, top: c.li.offsetTop + c.y, w: c.li.offsetWidth, s: c.s, o: c.o });
  }
  progress.stop();

  // 2. New layout: matching cards in the grid; cards going away are held where they are.
  for (const c of cells) {
    const show = matches(c);
    c.li.classList.remove("is-leaving");
    c.li.style.left = c.li.style.top = c.li.style.width = "";
    c.leaving = false;
    if (show) { c.li.hidden = false; c.shown = true; continue; }
    c.shown = false;
    const b = before.get(c);
    if (animate && b && b.o > 0.01) {
      c.leaving = true;
      c.li.hidden = false;
      c.li.classList.add("is-leaving");
      c.li.style.left = b.left + "px";
      c.li.style.top = b.top + "px";
      c.li.style.width = b.w + "px";
    } else {
      c.li.hidden = true;
    }
  }

  // 3. Animate from where they were to where they now belong.
  for (const c of cells) {
    c.x = c.y = 0;
    if (c.li.hidden) { c.from = c.to = null; c.s = 1; c.o = 1; paint(c); continue; }
    const b = before.get(c);
    if (!animate) { c.from = c.to = null; c.s = 1; c.o = 1; paint(c); continue; }
    if (c.leaving) {
      c.from = { x: 0, y: 0, s: b.s, o: b.o };
      c.to = { x: 0, y: 0, s: reduce ? 1 : LEAVE_SCALE, o: 0 };
    } else if (b) {
      const dx = b.left - c.li.offsetLeft, dy = b.top - c.li.offsetTop;
      if (reduce && (dx || dy)) {
        // Reduced motion: no travel; the card appears in its new place with a short fade.
        c.from = { x: 0, y: 0, s: 1, o: 0 };
      } else {
        c.from = { x: dx, y: dy, s: b.s, o: b.o };
      }
      c.to = { x: 0, y: 0, s: 1, o: 1 };
    } else {
      c.from = { x: 0, y: 0, s: reduce ? 1 : LEAVE_SCALE, o: 0 };
      c.to = { x: 0, y: 0, s: 1, o: 1 };
    }
  }
  if (animate) { progress.jump(0); progress.set(1); }

  const n = cells.filter(c => c.shown).length;
  if (statusEl && animate) {
    statusEl.textContent = `${current === "all" ? "All" : KIND[current]}: ${n} prototype${n === 1 ? "" : "s"} shown.`;
  }
}

// ---------- Loading and pausing by distance from the screen ----------
const nearIO = new IntersectionObserver(entries => {
  for (const e of entries) {
    const c = cells.find(t => t.li === e.target);
    if (!c) continue;
    c.near = e.isIntersecting;
    if (c.near) {
      if (!c.frame.getAttribute("src")) c.frame.src = c.frame.dataset.src || srcFor(c.p, theme());
      if (c.rafHold) c.rafHold.release();
    }
  }
}, { rootMargin: "100% 0px 100% 0px" });

// ---------- Theme switches ----------
new MutationObserver(() => startThemeSync(theme()))
  .observe(root, { attributes: true, attributeFilter: ["data-theme"] });

// ---------- Start ----------
async function init() {
  let list = [];
  try {
    list = await (await fetch("/content/lab.json")).json();
  } catch (e) {
    console.warn("lab: could not load /content/lab.json", e);
    return;
  }
  for (const p of list) {
    const c = buildCell(p);
    c.frame.dataset.src = srcFor(p, theme());
    cells.push(c);
    grid.appendChild(c.li);
  }
  smoothCorners(grid);
  // Page entrance (§3): the first row of cards follows the title, subtitle and filters.
  const firstTop = cells.length ? cells[0].li.offsetTop : 0;
  enterLate(cells.filter(c => c.li.offsetTop === firstTop).map(c => c.li));
  for (const c of cells) nearIO.observe(c.li);

  filtersEl.classList.add("is-live");
  placePill(false);
  // Fonts change the button widths: re-measure once they are in.
  if (document.fonts) document.fonts.ready.then(() => placePill(false));
  new ResizeObserver(() => placePill(pillX.moving || pillW.moving)).observe(filtersEl);
}

init();
