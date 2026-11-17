// Project page template (site-design-system.md §5–§5.4):
// header entrance, section reveals, annotation markers + notes, note alignment,
// step arrows, and the Homeproof timeline entrance.
import { createSpring, springLinear, SPRINGS, reduceMotion } from "./spring.js";
import { smoothCorners } from "./squircle.js";

const hasLinear = CSS.supports("transition-timing-function", "linear(0, 1)");
function curve(name, flat = false) {
  const s = SPRINGS[name];
  if (hasLinear) return springLinear(s.response, s.damping, { flat });
  return { easing: "cubic-bezier(.2, .9, .3, 1)", ms: 600 };
}
const ENTER = curve("enter"), ENTER_FLAT = curve("enter", true);

// Fade and rise one element in (spring-enter). Reduced motion: opacity only, 200ms.
function rise(el, { dy = 16, delay = 0 } = {}) {
  el.classList.add("is-in");
  if (reduceMotion.matches) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay, easing: "ease", fill: "backwards" });
    return;
  }
  el.animate([{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: "none" }],
    { duration: ENTER.ms, delay, easing: ENTER.easing, fill: "backwards" });
  el.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: ENTER_FLAT.ms, delay, easing: ENTER_FLAT.easing, fill: "backwards" });
}

// ---------- 1. Header: back link, name, introduction, info line (60ms apart) ----------
// On arrival from a card it waits until the circular reveal has covered the screen (§5.1);
// transition.js (loaded in <head>) says when. Without it, it plays at once.
const revealed = (window.pageTransition && window.pageTransition.revealed) || Promise.resolve();
revealed.then(() => {
  document.querySelectorAll("[data-enter]").forEach((el, i) => rise(el, { dy: 16, delay: i * 60 }));
});

// ---------- 2. Annotation markers and notes (§5.2) ----------
const notes = new Map();      // note id → { el, markers: [], reasons: Set }
document.querySelectorAll(".note[id]").forEach(el => notes.set(el.id, { el, markers: [], reasons: new Set() }));

const markers = [...document.querySelectorAll(".marker")].map(btn => {
  const m = { btn, id: btn.dataset.note, enter: null, hover: null, e: 0, h: 0 };
  const draw = () => {
    if (reduceMotion.matches) {
      btn.style.transform = "";
    } else {
      const s = (0.6 + 0.4 * m.e) * (1 + 0.25 * m.h);
      btn.style.transform = `scale(${s.toFixed(4)})`;
    }
    btn.style.opacity = Math.max(0, Math.min(1, m.e)).toFixed(3);
  };
  m.enter = createSpring("state", { value: 0, onUpdate: v => { m.e = v; draw(); } });
  m.hover = createSpring("press", { value: 0, onUpdate: v => { m.h = v; draw(); } });
  m.draw = draw;
  const n = notes.get(m.id);
  if (n) n.markers.push(m);
  return m;
});

function pulse(m) {
  if (reduceMotion.matches || !m.btn.animate) return;
  m.btn.animate([{ transform: "scale(1)", opacity: .35 }, { transform: "scale(2.2)", opacity: 0 }],
    { duration: 600, easing: "ease-out", pseudoElement: "::before" });
}

function setLit(id, reason, on) {
  const n = notes.get(id);
  if (!n) return;
  const was = n.reasons.size > 0;
  if (on) n.reasons.add(reason); else n.reasons.delete(reason);
  const is = n.reasons.size > 0;
  if (was === is) return;
  n.el.classList.toggle("is-lit", is);
  n.markers.forEach(m => {
    m.btn.classList.toggle("is-lit", is);
    m.hover.set(is ? 1 : 0);
    if (is) pulse(m);
  });
}

// Tap (touch, click or Enter): highlight for 2.5s or until the next tap.
let tapped = null, tapTimer = 0;
function clearTap() {
  clearTimeout(tapTimer);
  if (tapped) setLit(tapped, "tap", false);
  tapped = null;
}
function tap(id) {
  clearTap();
  tapped = id;
  setLit(id, "tap", true);
  tapTimer = setTimeout(clearTap, 2500);
}
const offscreen = el => {
  const r = el.getBoundingClientRect();
  return r.top < 64 || r.bottom > innerHeight;
};
const smooth = () => (reduceMotion.matches ? "auto" : "smooth");

const isMouse = e => e.pointerType === "mouse";
markers.forEach(m => {
  m.btn.addEventListener("pointerenter", e => { if (isMouse(e)) setLit(m.id, "hover", true); });
  m.btn.addEventListener("pointerleave", e => { if (isMouse(e)) setLit(m.id, "hover", false); });
  m.btn.addEventListener("focus", () => { if (m.btn.matches(":focus-visible")) setLit(m.id, "focus", true); });
  m.btn.addEventListener("blur", () => setLit(m.id, "focus", false));
  m.btn.addEventListener("click", () => {
    tap(m.id);
    const note = notes.get(m.id).el;
    if (offscreen(note)) note.scrollIntoView({ behavior: smooth(), block: "center" });
  });
});
notes.forEach((n, id) => {
  n.el.addEventListener("pointerenter", e => { if (isMouse(e)) setLit(id, "hover", true); });
  n.el.addEventListener("pointerleave", e => { if (isMouse(e)) setLit(id, "hover", false); });
  n.el.addEventListener("click", () => {
    tap(id);
    const m = n.markers.find(m => !offscreen(m.btn));
    if (!m && n.markers[0]) n.markers[0].btn.scrollIntoView({ behavior: smooth(), block: "center" });
  });
});
document.addEventListener("pointerdown", e => {
  if (!e.target.closest(".marker, .note")) clearTap();
}, { passive: true });

// ---------- 3. Single phone + notes: each note lines up with its marker (desktop) ----------
const desktop = matchMedia("(min-width: 768px)");
const wideFigure = matchMedia("(min-width: 900px)");   // exploded view: notes beside the parts
const NOTE_PAD = 12, LINE_HALF = 12;      // note padding + half the title line: the badge centre
function alignNotes(fig) {
  const col = fig.querySelector(".notes");
  const phone = fig.querySelector(".phone, .shot");
  const list = [...col.querySelectorAll(".note")];
  const beside = fig.classList.contains("fig--exploded") ? wideFigure.matches : desktop.matches;
  if (!beside) {
    col.classList.remove("is-aligned");
    col.style.height = "";
    list.forEach(n => (n.style.top = ""));
    return;
  }
  const h = phone.offsetHeight;
  col.classList.add("is-aligned");
  let bottom = -Infinity;
  for (const note of list) {
    const marker = phone.querySelector(`.marker[data-note="${note.id}"]`);
    const y = marker ? parseFloat(marker.style.getPropertyValue("--y")) / 100 * h : 0;
    const top = Math.max(y - NOTE_PAD - LINE_HALF, bottom);   // collide: keep the 24px text gap
    note.style.top = top.toFixed(1) + "px";
    bottom = top + note.offsetHeight;
  }
  col.style.height = Math.max(h, bottom) + "px";
}
const singles = [...document.querySelectorAll(".fig--single, .fig--exploded")];

// ---------- 4. Step arrows appear only between phones in the same row ----------
function markRowStarts(row) {
  let prevTop = null;
  [...row.children].forEach(step => {
    const top = step.offsetTop;
    step.classList.toggle("is-row-start", prevTop === null || Math.abs(top - prevTop) > 2);
    prevTop = top;
  });
}
const rows = [...document.querySelectorAll(".row")];

function layout() {
  singles.forEach(alignNotes);
  rows.forEach(markRowStarts);
}
const ro = new ResizeObserver(layout);
singles.forEach(f => ro.observe(f));
rows.forEach(r => ro.observe(r));
desktop.addEventListener("change", layout);
wideFigure.addEventListener("change", layout);
document.fonts && document.fonts.ready.then(layout);
layout();

// ---------- 5. Section reveals (once, at 15% visible) ----------
const imagesReady = el => Promise.race([
  Promise.all([...el.querySelectorAll("img")].map(img => (img.decode ? img.decode().catch(() => {}) : null))),
  new Promise(r => setTimeout(r, 1500)),
]);

function popMarkers(unit, delay) {
  [...unit.querySelectorAll(".marker")].forEach((btn, i) => {
    const m = markers.find(x => x.btn === btn);
    if (!m) return;
    btn.classList.add("is-in");
    setTimeout(() => m.enter.set(1), delay + i * 40);
  });
}

const revealIO = new IntersectionObserver(entries => {
  const hits = entries.filter(e => e.isIntersecting).map(e => e.target)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const withText = hits.some(el => el.dataset.reveal === "text");
  hits.forEach(el => {
    revealIO.unobserve(el);
    if (el.dataset.reveal === "figure") {
      const delay = withText ? 60 : 0;
      imagesReady(el).then(() => {
        rise(el, { dy: 24, delay });
        popMarkers(el, delay + (reduceMotion.matches ? 120 : 220));   // after the image has mostly arrived
      });
    } else {
      rise(el, { dy: 16 });
    }
  });
}, { threshold: 0.15 });
document.querySelectorAll("[data-reveal]").forEach(el => revealIO.observe(el));

// ---------- 6. Homeproof timeline diagram entrance (§5.4), once at 20% visible ----------
const TL_LAND = 540;     // the last box (240ms delay) has visibly landed
function playTimeline(tl) {
  tl.classList.add("is-in");
  const boxes = [...tl.querySelectorAll(".timeline__box")];
  const arrows = [...tl.querySelectorAll(".timeline__arrow")];
  const links = [...tl.querySelectorAll(".timeline__link")];
  const bar = tl.querySelector(".timeline__bar");
  const bracket = tl.querySelector(".timeline__bracket");
  const rail = tl.querySelector(".timeline__rail");
  if (reduceMotion.matches) {
    [...boxes, ...arrows, ...links, bar, bracket, rail].forEach(el => el && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: "ease", fill: "backwards" }));
    return;
  }
  const up = (el, delay) => {
    el.animate([{ transform: "translate3d(0, 12px, 0)" }, { transform: "none" }], { duration: ENTER.ms, delay, easing: ENTER.easing, fill: "backwards" });
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ENTER_FLAT.ms, delay, easing: ENTER_FLAT.easing, fill: "backwards" });
  };
  boxes.forEach((b, i) => up(b, i * 60));
  arrows.forEach((a, i) => up(a, (i + 1) * 60));        // each arrow arrives with the box it points to
  if (bracket) up(bracket, 120);                        // with the middle box it spans
  const axis = wideTimeline.matches ? "scaleY" : "scaleX";
  links.forEach(l => l.animate([{ transform: `${axis}(0)` }, { transform: "none" }],
    { duration: 260, delay: TL_LAND, easing: "ease-out", fill: "backwards" }));
  [bar, rail].forEach(el => el && el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay: TL_LAND, easing: "ease-out", fill: "backwards" }));
}
// Horizontal from 900 wide; stacked below (the bar's squircle radius follows in CSS: --squircle).
const wideTimeline = matchMedia("(min-width: 900px)");

const tlIO = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (!e.isIntersecting) return;
    tlIO.unobserve(e.target);
    playTimeline(e.target);
  });
}, { threshold: 0.2 });
document.querySelectorAll("[data-timeline]").forEach(el => tlIO.observe(el));

// Reduced motion switched while on the page: redraw markers without scale.
reduceMotion.addEventListener("change", () => markers.forEach(m => m.draw()));

// ---------- 7. Video (§5.3): muted, looping, playing inline only while at least 30% is visible.
// The pause button stops it for good (until pressed again). Reduced motion: it does not start
// on its own; the button plays it. ----------
document.querySelectorAll(".fig--video").forEach(fig => {
  const video = fig.querySelector("video");
  const btn = fig.querySelector(".video-toggle");
  if (!video) return;
  video.muted = true;
  let visible = false;
  let held = reduceMotion.matches;          // paused by the visitor (or by reduced motion)
  // The poster is the frame at data-start (the home screen fully shown, approved by Jack), so
  // the first play starts there instead of jumping to the dark intro; later loops play it all.
  const start = parseFloat(video.dataset.start) || 0;
  let begun = false;
  const toStart = () => {
    if (begun) return;
    begun = true;
    if (start) { try { video.currentTime = start; } catch (e) {} }
  };
  video.addEventListener("loadedmetadata", () => { if (!video.paused || visible) toStart(); });
  // Shown over its poster image only once it is at the start frame and playing.
  video.addEventListener("timeupdate", () => { if (begun && video.currentTime >= start - 0.05) video.classList.add("is-ready"); });
  const sync = () => {
    const run = visible && !held;
    if (run) {
      if (video.readyState >= 1) toStart();
      video.preload = "auto";
      const p = video.play();
      if (p && p.catch) p.catch(() => {});
    } else if (!video.paused) {
      video.pause();
    }
    if (btn) {
      btn.classList.toggle("is-paused", held);
      btn.setAttribute("aria-label", held ? "Play animation" : "Pause animation");
    }
  };
  if (btn) btn.addEventListener("click", () => { held = !held; sync(); });
  // Start loading only once it begins to come into view (step 7: it used to load with the page).
  new IntersectionObserver(es => {
    if (es.some(e => e.intersectionRatio > 0)) video.preload = "auto";
  }, { threshold: [0, 0.01] }).observe(fig);
  new IntersectionObserver(es => {
    es.forEach(e => { visible = e.intersectionRatio >= 0.3; });
    sync();
  }, { threshold: [0, 0.3] }).observe(video);
  sync();
});
