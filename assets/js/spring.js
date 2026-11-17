// The site's one spring utility (site-design-system.md §8).
// Same maths as the Lab prototypes: springLinear() is their CSS easing generator, and the
// physics spring is their integrator (real elapsed time, 4ms sub-steps, interruptible:
// a new target continues from the current position and velocity).

// SwiftUI-style response (seconds) / damping fraction.
export const SPRINGS = {
  press:  { response: 0.30, damping: 0.60 },   // press scale, small hover pops
  state:  { response: 0.42, damping: 0.72 },   // state changes, card lift on hover
  travel: { response: 0.50, damping: 0.80 },   // things that move a long way
  enter:  { response: 0.55, damping: 0.90 },   // content fading and rising in
};
// Reduce motion: quick, no bounce (as in the card-wallet prototype).
export const CALM = { response: 0.20, damping: 1 };

export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

const resolve = spec => (typeof spec === "string" ? SPRINGS[spec] : spec);

// ---------- 1. Spring as a CSS easing: linear() curve + duration ----------
// flat: true holds the curve at the target from the moment it first arrives (no overshoot).
// Used for things that must not bounce, such as colours, yet must arrive with the spring.
export function springLinear(response, damping, { flat = false } = {}) {
  const w = 2 * Math.PI / response;
  const wd = w * Math.sqrt(1 - damping * damping);
  const x = t => 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + (damping * w / wd) * Math.sin(wd * t));
  // settle when the envelope drops below 0.1%
  const dur = Math.log(1000) / (damping * w);
  const n = 48, pts = [];
  for (let i = 0; i <= n; i++) pts.push(+x(dur * i / n).toFixed(4));
  pts[n] = 1;
  if (flat) {
    const hit = pts.findIndex(p => p >= 1);
    for (let i = hit; i <= n; i++) pts[i] = 1;
  }
  return { easing: `linear(${pts.join(", ")})`, ms: Math.round(dur * 1000) };
}

// Writes --spring-<token>, --spring-<token>-flat and --spring-<token>-dur on <html>
// for use in CSS transitions.
export function installSpringTokens(root = document.documentElement) {
  if (!CSS.supports("transition-timing-function", "linear(0, 1)")) return;   // keep the CSS fallbacks
  for (const [name, s] of Object.entries(SPRINGS)) {
    const { easing, ms } = springLinear(s.response, s.damping);
    root.style.setProperty(`--spring-${name}`, easing);
    root.style.setProperty(`--spring-${name}-flat`, springLinear(s.response, s.damping, { flat: true }).easing);
    root.style.setProperty(`--spring-${name}-dur`, ms + "ms");
  }
}

// ---------- 2. Physics spring for JS-driven motion ----------
const active = new Set();
let raf = 0, last = 0;

function tick(t) {
  // Real elapsed time, integrated in small sub-steps: springs keep their timing
  // even if the browser delivers frames slowly.
  const dt = Math.min(0.5, Math.max(0, (t - last) / 1000) || 0.016);
  last = t;
  const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
  for (const s of [...active]) {
    const { k, c } = s._coef();
    let x = s.value, v = s.velocity;
    for (let i = 0; i < n; i++) {
      v += (-k * (x - s.target) - c * v) * h;
      x += v * h;
    }
    if (Math.abs(x - s.target) < s.precision && Math.abs(v) < s.precision * 10) {
      x = s.target; v = 0;
      active.delete(s);
    }
    s.value = x; s.velocity = v;
    s.onUpdate && s.onUpdate(x, v);
    if (!active.has(s) && s.onRest) s.onRest(x);
  }
  raf = active.size ? requestAnimationFrame(tick) : 0;
}
function kick() {
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}

/**
 * createSpring("state", { value: 0, onUpdate(x, v) {}, onRest(x) {} })
 *   .set(target, { velocity })  move towards target from wherever it is now, keeping velocity
 *   .jump(value)                place it without animating
 *   .stop()
 * precision: how close counts as arrived (0.001 suits 0–1 progress; use ~0.05 for pixels).
 */
export function createSpring(spec, { value = 0, onUpdate, onRest, precision = 0.001, calmWhenReduced = true } = {}) {
  const coef = s => {
    const k = (2 * Math.PI / s.response) ** 2;
    return { k, c: 2 * s.damping * Math.sqrt(k) };
  };
  const normal = coef(resolve(spec)), calm = coef(CALM);
  const s = {
    value, velocity: 0, target: value, precision, onUpdate, onRest,
    _coef: () => (calmWhenReduced && reduceMotion.matches ? calm : normal),
    set(target, { velocity } = {}) {
      s.target = target;
      if (velocity !== undefined) s.velocity = velocity;
      if (s.value === target && s.velocity === 0) return s;
      active.add(s); kick();
      return s;
    },
    jump(v) {
      s.value = s.target = v; s.velocity = 0;
      active.delete(s);
      s.onUpdate && s.onUpdate(v, 0);
      return s;
    },
    stop() { active.delete(s); return s; },
    get moving() { return active.has(s); },
  };
  return s;
}

installSpringTokens();
