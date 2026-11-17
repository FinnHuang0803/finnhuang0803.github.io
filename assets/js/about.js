// About page (site-design-system.md §7): scroll reveals for the sections below the intro, and the
// Copy email completion feedback (§7.6). The intro itself uses the shared page entrance (§3).
import { createSpring, springLinear, SPRINGS, reduceMotion } from "./spring.js";

const hasLinear = CSS.supports("transition-timing-function", "linear(0, 1)");
function curve(name, flat = false) {
  const s = SPRINGS[name];
  if (hasLinear) return springLinear(s.response, s.damping, { flat });
  return { easing: "cubic-bezier(.2, .9, .3, 1)", ms: 600 };
}
const ENTER = curve("enter"), ENTER_FLAT = curve("enter", true);

// ---------- 1. Scroll reveals: fade and rise 16px on spring-enter, once at 15% visible ----------
// Elements entering together are staggered 60ms in reading order (same as the project pages).
function rise(el, delay = 0) {
  el.classList.add("is-in");
  if (reduceMotion.matches) {
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay, easing: "ease", fill: "backwards" });
    return;
  }
  el.animate([{ transform: "translate3d(0, 16px, 0)" }, { transform: "none" }],
    { duration: ENTER.ms, delay, easing: ENTER.easing, fill: "backwards" });
  el.animate([{ opacity: 0 }, { opacity: 1 }],
    { duration: ENTER_FLAT.ms, delay, easing: ENTER_FLAT.easing, fill: "backwards" });
}
const revealIO = new IntersectionObserver(entries => {
  entries.filter(e => e.isIntersecting).map(e => e.target)
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .forEach((el, i) => { revealIO.unobserve(el); rise(el, i * 60); });
}, { threshold: 0.15 });
document.querySelectorAll("[data-reveal]").forEach(el => revealIO.observe(el));

// ---------- 2. Copy email: completion feedback (§7.6) ----------
// The button shrinks into a circle on spring-state (two round caps slide together while the
// middle shrinks: transforms only), the check mark draws in one stroke (a left-to-right wipe:
// the stroke only ever moves rightwards) and a ring of small accent particles bursts out.
// The circle's arrival, the end of the stroke and the particles' furthest point are the
// same moment. After a short hold the button springs back to its normal state.
// Reduced motion: no travel or particles; the button cross-fades to the circle with the
// check, holds, and cross-fades back (200ms each).

const status = document.querySelector("[data-copy-status]");
const STATE = curve("state");
// When the state spring first reaches its target (the circle is formed).
const ARRIVE = (() => {
  if (!hasLinear) return 240;
  const pts = STATE.easing.slice(7, -1).split(",").map(Number);
  return Math.round(STATE.ms * pts.findIndex(p => p >= 1) / (pts.length - 1));
})();
const LAND = ARRIVE + 80;           // everything lands here: the circle's small spring peak
const HOLD = 1100;                  // check stays visible
const PARTICLES = 10;

function announce(text) {
  if (!status) return;
  status.textContent = "";
  requestAnimationFrame(() => { status.textContent = text; });
}

async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* blocked: try the older way */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

function showFallback(btn) {
  const box = btn.closest(".about-intro__text, .about-closing");
  const line = box && box.querySelector(".copy-fallback");
  if (!line) return;
  line.classList.add("is-on");
  const a = line.querySelector("a");
  try {
    const r = document.createRange();
    r.selectNodeContents(a);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  } catch (e) {}
  announce("Copying was blocked by the browser. The email address is shown below the button.");
}

function setup(btn) {
  const email = btn.dataset.copyEmail;
  const label = btn.querySelector(".btn__label");
  const shape = btn.querySelector(".btn__shape");

  const check = document.createElement("span");
  check.className = "btn__check";
  check.setAttribute("aria-hidden", "true");
  check.innerHTML = '<span class="btn__wipe"><svg viewBox="0 0 20 20"><path d="M4.75 10.4 8.6 14.25 15.4 5.9"/></svg></span>';
  const wipe = check.firstElementChild, glyph = wipe.firstElementChild;
  wipe.style.overflow = "hidden";

  const burst = document.createElement("span");
  burst.className = "btn__burst";
  burst.setAttribute("aria-hidden", "true");
  const dots = Array.from({ length: PARTICLES }, () => burst.appendChild(document.createElement("i")));
  btn.append(check, burst);

  let busy = false, phase = "idle", holdTimer = 0;
  const k = createSpring("state", {
    value: 0,
    calmWhenReduced: false,
    onUpdate: x => btn.style.setProperty("--k", x.toFixed(4)),
    onRest: () => { if (phase === "back") finish(); },
  });

  function finish() {
    phase = "idle";
    busy = false;
    btn.classList.remove("is-busy");
    btn.style.removeProperty("--k");
  }

  function playFull() {
    const h = btn.offsetHeight, w = btn.offsetWidth;
    btn.style.setProperty("--half", ((w - h) / 2).toFixed(2) + "px");
    phase = "in";
    k.set(1);

    label.animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(.92)" }],
      { duration: 140, easing: "ease-out", fill: "forwards" });

    // The stroke: starts as the caps close in, ends at LAND.
    const drawStart = Math.max(0, ARRIVE - 80), draw = LAND - drawStart;
    check.animate([{ opacity: 1 }, { opacity: 1 }], { duration: draw, delay: drawStart, fill: "both" });
    check.style.opacity = "";
    wipe.animate([{ transform: "translate3d(-100%,0,0)" }, { transform: "none" }],
      { duration: draw, delay: drawStart, easing: "cubic-bezier(.45, 0, .25, 1)", fill: "both" });
    glyph.animate([{ transform: "translate3d(100%,0,0)" }, { transform: "none" }],
      { duration: draw, delay: drawStart, easing: "cubic-bezier(.45, 0, .25, 1)", fill: "both" });

    // Particles: leave the circle's edge and reach their furthest point at LAND. They stay fully
    // visible in flight and fade out over the last FADE ms, gone at the very moment the check
    // finishes (step 7). Movement and opacity are timed separately: the movement eases out,
    // the opacity follows the clock, so the fade really happens at the end.
    const r0 = h / 2 + 2, r1 = h / 2 + 18, pStart = Math.max(0, LAND - 260), span = LAND - pStart;
    const FADE = 60;
    dots.forEach((d, i) => {
      const a = (i / PARTICLES) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.12 : 0);
      const far = r1 + (i % 2 ? -4 : 0);
      const c = Math.cos(a), s = Math.sin(a);
      d.animate([
        { transform: `translate3d(${c * r0}px, ${s * r0}px, 0) scale(1)` },
        { transform: `translate3d(${c * far}px, ${s * far}px, 0) scale(.6)` },
      ], { duration: span, delay: pStart, easing: "cubic-bezier(.15, .7, .3, 1)", fill: "backwards" });
      d.animate([
        { opacity: 0 },
        { opacity: 1, offset: 0.12 },
        { opacity: 1, offset: 1 - FADE / span },
        { opacity: 0 },
      ], { duration: span, delay: pStart, easing: "linear", fill: "backwards" });
    });

    holdTimer = setTimeout(() => {
      phase = "back";
      check.getAnimations().forEach(a => a.cancel());
      check.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-out", fill: "forwards" });
      wipe.getAnimations().forEach(a => a.finish());
      k.set(0);
      // The label returns on the same spring, arriving as the button regains its width.
      label.getAnimations().forEach(a => a.cancel());
      label.animate([{ opacity: 0, transform: "scale(.92)" }, { opacity: 1, transform: "scale(1)" }],
        { duration: STATE.ms, delay: 60, easing: curve("state", true).easing, fill: "backwards" });
    }, LAND + HOLD);
  }

  function playCalm() {
    const h = btn.offsetHeight, w = btn.offsetWidth;
    btn.style.setProperty("--half", ((w - h) / 2).toFixed(2) + "px");
    const fadeOut = [{ opacity: 1 }, { opacity: 0 }], fadeIn = [{ opacity: 0 }, { opacity: 1 }];
    const o = { duration: 100, easing: "ease", fill: "forwards" };
    label.animate(fadeOut, o);
    shape.animate(fadeOut, o).onfinish = () => {
      k.jump(1);
      wipe.getAnimations().forEach(a => a.cancel());
      glyph.getAnimations().forEach(a => a.cancel());
      shape.animate(fadeIn, { duration: 200, easing: "ease", fill: "forwards" });
      check.animate(fadeIn, { duration: 200, easing: "ease", fill: "forwards" });
      holdTimer = setTimeout(() => {
        check.animate(fadeOut, { duration: 100, easing: "ease", fill: "forwards" });
        shape.animate(fadeOut, o).onfinish = () => {
          k.jump(0);
          shape.animate(fadeIn, { duration: 200, easing: "ease", fill: "forwards" });
          label.animate(fadeIn, { duration: 200, easing: "ease", fill: "forwards" })
            .onfinish = () => { [shape, label, check].forEach(el => el.getAnimations().forEach(a => a.cancel())); finish(); };
        };
      }, 1200);
    };
  }

  btn.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    const ok = await copyText(email);
    if (!ok) { busy = false; showFallback(btn); return; }
    btn.classList.add("is-busy");
    clearTimeout(holdTimer);
    announce("Email copied");
    if (reduceMotion.matches) playCalm();
    else playFull();
  });
}

document.querySelectorAll("[data-copy-email]").forEach(setup);
