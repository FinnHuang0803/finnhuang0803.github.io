// Page entrance for the main pages: Work, Lab, About (site-design-system.md §3, "Page entrance").
//
// Every time one of them is opened, its first-screen content fades in (opacity 0→1) and rises
// 16px→0 on spring-enter, 60ms apart in reading order. Mark the elements in HTML with
// data-page-enter, in reading order. Content built later by a page's own script (the Lab's
// first row of cards) joins with enterLate(): it takes the next 60ms slots, timed from the
// same start, so everything still lands together.
//
// - Before the first paint, theme-init.js adds .pe to <html>, which hides [data-page-enter]
//   (site.css), so the content never shows and then jumps back. Without JavaScript nothing is
//   hidden. If this module never runs, theme-init.js lifts the class after 3s.
// - The navigation bar and footer are never marked, so they never move.
// - Not played when Home is returning from a project page: that uses the circular shrink and
//   the card entrance instead (transition.js sets pageTransition.returning).
// - Reduced motion: opacity only, 200ms (same delays).
// Same curves and code path as the project page entrance (project.js rise()).

import { springLinear, SPRINGS, reduceMotion } from "./spring.js";

const STAGGER = 60, DY = 16;
const hasLinear = CSS.supports("transition-timing-function", "linear(0, 1)");
const curve = flat => hasLinear
  ? springLinear(SPRINGS.enter.response, SPRINGS.enter.damping, { flat })
  : { easing: "cubic-bezier(.2, .9, .3, 1)", ms: 600 };
const ENTER = curve(false), ENTER_FLAT = curve(true);

const root = document.documentElement;
const pt = window.pageTransition;
const skipped = !!(pt && pt.returning);          // Home coming back from a project
let t0 = 0, slot = 0;

function rise(el, delay) {
  if (reduceMotion.matches) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay, easing: "ease", fill: "backwards" });
    return;
  }
  el.animate([{ transform: `translate3d(0, ${DY}px, 0)` }, { transform: "none" }],
    { duration: ENTER.ms, delay, easing: ENTER.easing, fill: "backwards" });
  el.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: ENTER_FLAT.ms, delay, easing: ENTER_FLAT.easing, fill: "backwards" });
}

function start() {
  const els = [...document.querySelectorAll("[data-page-enter]")];
  t0 = performance.now();
  if (!skipped) els.forEach(el => rise(el, slot++ * STAGGER));
  root.classList.remove("pe");                   // same task: hidden by the animations' first frame instead
}

// Elements a page builds after load, in reading order. Call in the same task that inserts them.
export function enterLate(els) {
  if (skipped) return;
  const elapsed = performance.now() - t0;
  for (const el of els) rise(el, Math.max(0, slot++ * STAGGER - elapsed));
}

start();
