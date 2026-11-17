// The site's one squircle helper (site-design-system.md §2): 60% smooth corners,
// redrawn whenever the element's size changes. Same approach as the Lab prototypes:
// the element is clipped to the path, and any fill / border / focus ring is drawn on
// the same path inside an optional <svg class="sq-shape"> child.
//
// Usage:  <div class="sq" data-squircle="16"> … </div>
//         <button class="sq" data-squircle="12"><svg class="sq-shape" aria-hidden="true">
//           <path class="fill"/><path class="ring"/></svg> … </button>
// Then smoothCorners() once per page (site.js does this); call it again with a
// container after adding elements later.

// Path function from the spec, unchanged.
export function squircle(w, h, r, s = 0.6) {
  const rad = d => d * Math.PI / 180, f = v => +v.toFixed(3);
  const p = (1 + s) * r;
  if (p > Math.min(w, h) / 2) throw new Error("too small for 60% smoothing: " + w + "x" + h + " r" + r);
  const am = 90 * (1 - s), L = Math.sin(rad(am / 2)) * r * Math.SQRT2;
  const p34 = r * Math.tan(rad((90 - am) / 4)), beta = 45 * s;
  const c = p34 * Math.cos(rad(beta)), d = c * Math.tan(rad(beta));
  const b = (p - L - c - d) / 3, a = 2 * b;
  const A=f(a),AB=f(a+b),ABC=f(a+b+c),BC=f(b+c),C=f(c),D=f(d),R=f(r),l=f(L);
  return [`M ${f(w-p)} 0`,`c ${A} 0 ${AB} 0 ${ABC} ${D}`,`a ${R} ${R} 0 0 1 ${l} ${l}`,`c ${D} ${C} ${D} ${BC} ${D} ${ABC}`,
    `L ${w} ${f(h-p)}`,`c 0 ${A} 0 ${AB} ${-D} ${ABC}`,`a ${R} ${R} 0 0 1 ${-l} ${l}`,`c ${-C} ${D} ${-BC} ${D} ${-ABC} ${D}`,
    `L ${f(p)} ${h}`,`c ${-A} 0 ${-AB} 0 ${-ABC} ${-D}`,`a ${R} ${R} 0 0 1 ${-l} ${-l}`,`c ${-D} ${-C} ${-D} ${-BC} ${-D} ${-ABC}`,
    `L 0 ${f(p)}`,`c 0 ${-A} 0 ${-AB} ${D} ${-ABC}`,`a ${R} ${R} 0 0 1 ${l} ${-l}`,`c ${C} ${-D} ${BC} ${-D} ${ABC} ${-D}`,`Z`].join(" ");
}

// The radius comes from data-squircle, unless CSS sets --squircle on the element (used where the
// radius changes with the screen width, e.g. the Homeproof timeline bar: 16 wide, 6 stacked).
function radiusOf(el) {
  const v = getComputedStyle(el).getPropertyValue("--squircle").trim();
  return +(v || el.dataset.squircle);
}

function shape(el, w = el.offsetWidth, h = el.offsetHeight) {
  const r = radiusOf(el);
  if (!w || !h || !r) return;
  let d;
  try {
    d = squircle(w, h, r);
  } catch (e) {
    // The element is too small for this radius: leave it unclipped and say so,
    // rather than drawing a different curvature.
    console.warn("squircle:", e.message, el);
    el.style.clipPath = "";
    return;
  }
  el.style.clipPath = `path("${d}")`;
  const svg = el.querySelector(":scope > svg.sq-shape");
  if (svg) {
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.querySelectorAll("path").forEach(p => p.setAttribute("d", d));
  }
}

const ro = new ResizeObserver(entries => {
  for (const e of entries) {
    const box = e.borderBoxSize && e.borderBoxSize[0];
    if (box) shape(e.target, +box.inlineSize.toFixed(3), +box.blockSize.toFixed(3));
    else shape(e.target);
  }
});

// Shapes every [data-squircle] element inside root and keeps it in shape on resize.
export function smoothCorners(root = document) {
  const els = [...root.querySelectorAll("[data-squircle]")];
  if (root instanceof Element && root.matches("[data-squircle]")) els.unshift(root);
  for (const el of els) { shape(el); ro.observe(el); }
}

export function releaseCorners(el) { ro.unobserve(el); }
