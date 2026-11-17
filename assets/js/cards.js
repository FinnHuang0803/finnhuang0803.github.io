// Project cards on Home (site-design-system.md §4.2, §4.3).
// Cards are built from /content/projects.json, so adding a project needs no code change.
//
// Hover (mouse only):
// - One spring per card (spring-state) drives everything at once: lift, scale, shadow,
//   summary → hover lines, so they all land together and reverse from wherever they are.
// - The card under the pointer is found from the grid footprints, not the browser's :hover,
//   and every pointer movement is traced as a line: a card the cursor crosses between two
//   mouse samples still lifts. A lift is held at least MIN_HOLD ms so an instant pass shows.
// - The cursor becomes a "View" magnifier while a card is lifted.
// - A card with a hover video plays it from frame 1 the moment it lifts; on leave it pauses,
//   fades back to the cover (identical to frame 1) and rewinds.
// Touch: no hover; CSS shows the hover lines directly and a tap simply follows the link.

import { createSpring, reduceMotion } from "./spring.js";
import { squircle } from "./squircle.js";

const LIFT_Y = -6;          // px the card rises
const LIFT_SCALE = 0.04;    // 1 → 1.04
const MIN_HOLD = 90;        // ms a passing cursor keeps the card lifted…
const MIN_LIFT = 0.6;       // …and at least this far up before it returns
const RADIUS = 16;
const NAV_H = 64;

const hoverMedia = matchMedia("(hover: hover) and (pointer: fine)");

function el(tag, cls, attrs = {}) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

function buildCard(p, i) {
  const li = el("li", "card-cell");
  li.style.setProperty("--i", i);
  const a = el("a", "card", { href: `/work/${p.id}/` });
  a.style.setProperty("--tint-light", p.card.light);
  a.style.setProperty("--tint-dark", p.card.dark);

  const lift = el("div", "card__lift");
  const shadow = shapeSvg("card__shadow", `${p.id}-s`);
  const bg = shapeSvg("card__bg", `${p.id}-b`);
  const body = el("div", "card__body");

  const SIZES = "(min-width: 1280px) 384px, (min-width: 1024px) 30vw, (min-width: 600px) 46vw, 92vw";
  const cover = el("div", "card__cover");
  const img = el("img", "card__img", {
    src: p.cover["1x"],
    srcset: [[p.cover["1x"], 800], [p.cover["1200"], 1200], [p.cover["2x"], 1600]].filter(([u]) => u).map(([u, w]) => `${u} ${w}w`).join(", "),
    sizes: SIZES,
    width: p.cover.width, height: p.cover.height,
    alt: "", decoding: "async", loading: "lazy",
  });
  cover.appendChild(img);
  // Fade band (§4.2.1): the cover's bottom row stretched down and faded out, on the card tint.
  let fade = null;
  if (p.fade) {
    fade = el("img", "card__fade", {
      src: p.fade["1x"],
      srcset: [[p.fade["1x"], 800], [p.fade["1200"], 1200], [p.fade["2x"], 1600]].filter(([u]) => u).map(([u, w]) => `${u} ${w}w`).join(", "),
      sizes: SIZES, alt: "", decoding: "async", loading: "lazy", "aria-hidden": "true",
    });
  }
  let video = null;
  if (p.hoverVideo) {
    video = el("video", "card__video", { muted: "", playsinline: "", loop: "", preload: "none", "aria-hidden": "true", tabindex: "-1" });
    video.muted = true;
    video.dataset.src = p.hoverVideo;
    cover.appendChild(video);
  }

  const text = el("div", "card__text");
  const title = el("h3", "card__title");
  title.textContent = p.title;
  title.id = `card-${p.id}-title`;
  const copy = el("div", "card__copy");
  const summary = el("p", "card__summary");
  summary.textContent = p.summary;
  summary.id = `card-${p.id}-summary`;
  // Screen readers hear the project name and its summary only (step 7, Jack): the hover lines
  // and the tags are visual extras.
  a.setAttribute("aria-labelledby", `${title.id} ${summary.id}`);
  const more = el("div", "card__more", { "aria-hidden": "true" });
  const hover = el("p", "card__hover");
  hover.textContent = p.hover;
  more.append(hover);
  copy.append(summary, more);
  // Tags (§4.2.1): solid pills under the summary, so the cover is shown whole. On hover they
  // move down with the card to make room for the (longer) hover lines.
  const tags = el("ul", "card__tags", { "aria-hidden": "true" });
  for (const t of p.tags || []) {
    const tag = el("li", "card__tag");
    tag.textContent = t;
    tags.appendChild(tag);
  }
  text.append(title, copy, tags);
  body.append(cover, ...(fade ? [fade] : []), text);

  const ring = shapeSvg("card__ring", `${p.id}-r`);
  lift.append(shadow, bg, body, ring);
  a.appendChild(lift);
  li.appendChild(a);

  return { id: p.id, li, a, lift, shadow, bg, body, ring, img, fade, video, text, title, summary, more, tags, delta: 0, shift: 0, w: 0, h: 0, hovered: false, enterAt: 0, leaveTimer: 0 };
}

// ---------- The card's squircle, able to grow downward on hover ----------
// The cover is never covered (§4.2.1), so the hover lines get their room by the card growing
// down instead (its grid footprint stays the same). The squircle is drawn in three slices: the
// top (fixed), a 1px strip of the straight sides stretched to the extra height, and the bottom
// corners moved down by it. Only transforms change while it moves.
const SVGNS = "http://www.w3.org/2000/svg";
const CAP = 27;            // the bottom corners' height: (1 + 0.6) × 16 = 25.6, rounded up
function shapeSvg(cls, uid) {
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    `<defs><clipPath id="${uid}-t"><rect/></clipPath><clipPath id="${uid}-c"><rect/></clipPath></defs>` +
    `<path class="sl-top" clip-path="url(#${uid}-t)"/><path class="sl-mid"/><path class="sl-cap" clip-path="url(#${uid}-c)"/>`;
  return svg;
}
function sizeShape(svg, w, h, d) {
  const [ct, cc] = svg.querySelectorAll("clipPath rect");
  // Slices overlap by 1px so no hairline shows between them.
  ct.setAttribute("x", -4); ct.setAttribute("y", -4); ct.setAttribute("width", w + 8); ct.setAttribute("height", h - CAP + 4 + 1);
  cc.setAttribute("x", -4); cc.setAttribute("y", h - CAP); cc.setAttribute("width", w + 8); cc.setAttribute("height", CAP + 4);
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const [top, mid, cap] = svg.querySelectorAll("path");
  top.setAttribute("d", d);
  cap.setAttribute("d", d);
  // The straight sides between top and corners: a filled strip for the tint and shadow, the two
  // side lines for the focus ring (it is stroked, not filled).
  mid.setAttribute("d", svg.classList.contains("card__ring") ? `M 0 0 V 1 M ${w} 0 V 1` : `M 0 0 H ${w} V 1 H 0 Z`);
  mid.dataset.y = h - CAP;
}
function stretchShape(svg, ext) {
  const [, mid, cap] = svg.querySelectorAll("path");
  const y = +mid.dataset.y;
  mid.setAttribute("transform", `translate(0 ${y - 0.5}) scale(1 ${(ext + 1).toFixed(3)})`);
  cap.setAttribute("transform", ext ? `translate(0 ${ext.toFixed(3)})` : "");
}

// ---------- Lift rendering: one spring value p (0 rest → 1 lifted) ----------
function render(card, p) {
  const q = p < 0 ? 0 : p > 1 ? 1 : p;
  card.lift.style.transform = reduceMotion.matches || p === 0
    ? ""
    : `translate3d(0, ${(LIFT_Y * p).toFixed(3)}px, 0) scale(${(1 + LIFT_SCALE * p).toFixed(5)})`;
  card.shadow.style.opacity = q;
  card.summary.style.opacity = 1 - Math.min(1, q * 1.6);
  const m = Math.max(0, (q - 0.25) / 0.75);
  card.more.style.opacity = m;
  card.more.style.transform = reduceMotion.matches || m === 1 ? "" : `translate3d(0, ${((1 - m) * 6).toFixed(3)}px, 0)`;
  // The tags move down to make room for the hover lines, and the card grows down just as far
  // as they need beyond its free space; the cover is never covered.
  // Reduced motion: both happen in one step while the text cross-fades.
  const k = reduceMotion.matches ? (q > 0.01 ? 1 : 0) : Math.max(0, p);
  const ext = card.delta * k, shift = card.shift * k;
  card.ext = ext;
  card.tags.style.transform = shift ? `translate3d(0, ${shift.toFixed(3)}px, 0)` : "";
  if (card.h) for (const svg of [card.shadow, card.bg, card.ring]) stretchShape(svg, ext);
  card.li.style.zIndex = p > 0.0005 ? (card.hovered ? 3 : 2) : "";
}

// ---------- Hover video ----------
function playVideo(card) {
  const v = card.video;
  if (!v) return;
  if (!v.src) { v.src = v.dataset.src; v.preload = "auto"; }
  clearTimeout(card.videoReset);
  card.videoWanted = true;
  try { v.currentTime = 0; } catch (e) { /* not loaded yet: starts at 0 anyway */ }
  const show = () => {
    if (!card.videoWanted) return;
    // Reveal only once a frame is really on screen; frame 1 matches the cover, so no jump.
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => { if (card.videoWanted) v.classList.add("is-on"); });
    else v.classList.add("is-on");
  };
  const pr = v.play();
  if (pr && pr.then) pr.then(show, () => {});
  else show();
}
function stopVideo(card) {
  const v = card.video;
  if (!v || !card.videoWanted) return;
  card.videoWanted = false;
  v.pause();
  v.classList.remove("is-on");                 // fades back to the cover (= frame 1)
  clearTimeout(card.videoReset);
  card.videoReset = setTimeout(() => {
    if (!card.videoWanted) { try { v.currentTime = 0; } catch (e) {} }
  }, 260);
}

export async function initCards(grid) {
  const res = await fetch("/content/projects.json");
  const projects = (await res.json()).sort((a, b) => a.order - b.order);
  const cards = projects.map(buildCard);
  grid.append(...cards.map(c => c.li));

  // Tint, shadow and focus ring are all drawn on the card's squircle.
  const ro = new ResizeObserver(entries => {
    for (const e of entries) {
      const card = cards.find(c => c.body === e.target);
      const w = e.target.offsetWidth, h = e.target.offsetHeight;
      if (!w || !h) continue;
      card.w = w; card.h = h;
      const d = squircle(w, h, RADIUS);
      for (const svg of [card.shadow, card.bg, card.ring]) sizeShape(svg, w, h, d);
      measureDelta(card);
      // The content is clipped to the grown squircle; at rest the part below the card is empty.
      card.body.style.clipPath = `path("${squircle(w, h + card.delta, RADIUS)}")`;
    }
  });
  // How far the text panel must slide up so the hover lines fit (0 if they already do).
  // shift: how far the tags move down so the hover lines fit above them.
  // delta: how far the card grows, i.e. what the free space at the bottom of the card cannot absorb.
  // (Touch devices show the hover lines in place of the summary, so nothing moves.)
  function measureDelta(card) {
    if (!hoverMedia.matches) { card.shift = card.delta = 0; render(card, 0); return; }
    const cs = getComputedStyle(card.text);
    const used = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + card.title.offsetHeight
      + parseFloat(getComputedStyle(card.summary.parentNode).marginTop) + card.summary.offsetHeight
      + parseFloat(getComputedStyle(card.tags).marginTop) + card.tags.offsetHeight;
    const free = Math.max(0, card.text.clientHeight - used);
    card.shift = Math.max(0, Math.ceil(card.more.offsetHeight - card.summary.offsetHeight));
    card.delta = Math.max(0, card.shift - Math.floor(free));
    render(card, card.spring ? card.spring.value : 0);
  }
  cards.forEach(c => ro.observe(c.body));

  cards.forEach(card => {
    card.spring = createSpring("state", {
      value: 0,
      onUpdate: p => {
        render(card, p);
        if (card.waitLift && p >= MIN_LIFT) { card.waitLift = false; card.release(); }
      },
    });
  });

  // ---------- Returning from a project (§4.2): Home opens at the grid, on the card the
  // visitor came from; the circle shrinks into it as the cards rise (transition.js). ----------
  const pt = window.pageTransition;
  const returnCard = () => {
    const id = pt && pt.returning && pt.returning.id;
    return id ? cards.find(c => c.id === id) : null;
  };
  let homing = returnCard();
  if (homing) pt.placeHome(homing.li);

  // ---------- Entrance: fade and rise in sequence, very short gaps (§4.2) ----------
  const STAGGER = 50;
  const pending = new Set(cards);
  const io = new IntersectionObserver(entries => {
    const batch = entries
      .filter(e => e.isIntersecting)
      .map(e => cards.find(c => c.li === e.target))
      .filter(c => pending.has(c))
      .sort((a, b) => cards.indexOf(a) - cards.indexOf(b));
    batch.forEach(c => { pending.delete(c); io.unobserve(c.li); });
    // Wait for the covers so a card never rises in empty.
    Promise.all(batch.flatMap(c => [c.img, c.fade].filter(Boolean).map(i => (i.decode ? i.decode().catch(() => {}) : null)))).then(() => {
      // Back pressed while the project was still opening: these cards were on screen a moment
      // ago, so they show at once instead of replaying the entrance.
      const instant = !!(homing && batch.length && pt.returning && pt.returning.instant);
      if (homing && batch.length) { pt.go(homing.li); homing = null; }
      batch.forEach((c, k) => {
        c.li.style.setProperty("--delay", k * STAGGER + "ms");
        if (instant) {
          c.li.classList.add("pt-instant");
          setTimeout(() => c.li.classList.remove("pt-instant"), 100);
        }
        c.li.classList.add("is-in");
      });
    });
  }, { threshold: 0.15 });
  cards.forEach(c => io.observe(c.li));

  // ---------- Hover ----------
  const cursor = document.querySelector(".view-cursor");
  const cursorSpring = createSpring("press", {
    value: 0,
    onUpdate: s => {
      const q = Math.max(0, s);
      cursor.style.opacity = Math.min(1, q * 1.5);
      cursor.firstElementChild.style.transform = reduceMotion.matches ? "" : `scale(${q.toFixed(4)})`;
    },
  });
  let hovered = null;
  let pointer = null;

  function enter(card) {
    clearTimeout(card.leaveTimer);
    card.leaveTimer = 0;
    card.waitLift = false;
    if (!card.spring.moving && card.spring.target === 1) return;
    card.enterAt = performance.now();
    card.spring.set(1);
    playVideo(card);
  }
  // A card is only let go once it has visibly lifted (MIN_LIFT of the way) and been up for
  // MIN_HOLD ms, so even a pass of an instant shows, however slowly frames arrive.
  function leave(card) {
    if (card.leaveTimer || card.waitLift) return;
    const go = () => {
      card.leaveTimer = 0;
      if (card === hovered || card.focused) return;
      if (card.spring.target === 1 && card.spring.value < MIN_LIFT) { card.waitLift = true; return; }
      card.spring.set(0);
      stopVideo(card);
    };
    const wait = Math.max(0, MIN_HOLD - (performance.now() - card.enterAt));
    if (wait) card.leaveTimer = setTimeout(go, wait); else go();
    card.release = go;
  }
  function setHovered(card) {
    if (card === hovered) return;
    const prev = hovered;
    hovered = card;
    if (prev) { prev.hovered = false; leave(prev); }
    if (card) { card.hovered = true; enter(card); }
    document.documentElement.classList.toggle("is-view-cursor", !!card);
    cursorSpring.set(card ? 1 : 0);
  }

  // Footprint of each card in the grid (never the lifted, scaled box). The card under the
  // pointer also keeps the part it has grown downward, so the hover lines can be read.
  function cardAt(x, y) {
    if (y < NAV_H) return null;
    if (hovered && hovered.ext) {
      const r = hovered.li.getBoundingClientRect();
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom + hovered.ext) return hovered;
    }
    for (const c of cards) {
      if (!c.li.classList.contains("is-in")) continue;
      const r = c.li.getBoundingClientRect();
      if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return c;
    }
    return null;
  }

  function moveCursor(x, y) {
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  function onMove(e) {
    if (e.pointerType !== "mouse" || !hoverMedia.matches) return;
    const events = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    const points = events.length ? events.map(ev => [ev.clientX, ev.clientY]) : [[e.clientX, e.clientY]];
    let prev = pointer;
    for (const [x, y] of points) {
      if (prev) {
        // Trace the path between samples so a fast pass over a card still lifts it.
        const dx = x - prev[0], dy = y - prev[1];
        const n = Math.ceil(Math.hypot(dx, dy) / 8);
        for (let k = 1; k < n; k++) {
          const c = cardAt(prev[0] + dx * k / n, prev[1] + dy * k / n);
          if (c && c !== hovered) { enter(c); leave(c); }
        }
      }
      prev = [x, y];
    }
    pointer = prev;
    moveCursor(pointer[0], pointer[1]);
    setHovered(cardAt(pointer[0], pointer[1]));
  }

  addEventListener("pointermove", onMove, { passive: true });
  addEventListener("pointerdown", e => { if (e.pointerType === "mouse") onMove(e); }, { passive: true });
  // The page scrolls under a still cursor: re-check what is under it.
  addEventListener("scroll", () => { if (pointer) setHovered(cardAt(pointer[0], pointer[1])); }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => { pointer = null; setHovered(null); });
  addEventListener("blur", () => { pointer = null; setHovered(null); });
  // An opening cancelled by Back has just shrunk away: the magnifier grows back from the pointer.
  addEventListener("pt-cancelled", () => {
    cursorSpring.jump(0);
    if (hovered) cursorSpring.set(1);
  });
  // Back from another page (bfcache): start from rest, nothing lifted.
  addEventListener("pageshow", e => {
    if (!e.persisted) return;
    pointer = null; setHovered(null);
    cards.forEach(c => { c.focused = false; c.spring.jump(0); stopVideo(c); });
    // Back from a project: the cards replay their entrance at the grid.
    homing = returnCard();
    if (!homing) return;
    cards.forEach(c => {
      c.li.classList.remove("is-in");
      c.li.style.removeProperty("--delay");
      pending.add(c);
      io.unobserve(c.li);
    });
    pt.placeHome(homing.li);
    cards.forEach(c => io.observe(c.li));
  });

  // Keyboard focus lifts the card the same way.
  cards.forEach(card => {
    card.a.addEventListener("focus", () => {
      if (!card.a.matches(":focus-visible")) return;
      card.focused = true; enter(card);
    });
    card.a.addEventListener("blur", () => {
      if (!card.focused) return;
      card.focused = false; leave(card);
    });
  });

  // Load the hover video once the grid comes into view (mouse devices only; step 7: it used to
  // load with the page).
  const videoCards = cards.filter(c => c.video);
  if (videoCards.length) {
    const vio = new IntersectionObserver(entries => {
      // A grid that only touches the bottom edge (it starts right at the fold) does not count.
      if (!entries.some(e => e.intersectionRatio > 0) || !hoverMedia.matches) return;
      videoCards.forEach(c => { if (!c.video.src) { c.video.preload = "auto"; c.video.src = c.video.dataset.src; } });
      vio.disconnect();
    }, { threshold: [0, 0.01] });
    vio.observe(grid);
  }
}
