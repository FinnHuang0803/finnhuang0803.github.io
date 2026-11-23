// Home (Work): opening statements, scroll hint and project cards (site-design-system.md §4).
import { initFlap } from "./flap.js";
import { initCards } from "./cards.js";

const statement = document.querySelector("[data-flap]");
if (statement) initFlap(statement);

// Scroll hint: fades in 2s after arrival while the page is at the top; fades out as soon
// as the page scrolls, and comes back only when the visitor returns to the very top.
const hint = document.querySelector(".scroll-hint");
if (hint) {
  let armed = false;
  const sync = () => hint.classList.toggle("is-on", armed && scrollY <= 0);
  setTimeout(() => { armed = true; sync(); }, 2000);
  addEventListener("scroll", sync, { passive: true });
}

// Background spotlight (§4.1): the same pattern in a stronger colour, under the pointer.
// A 320px square follows the pointer (transform only) and shifts its tile back by the same
// amount, so the shapes stay locked to the page. No smoothing: the position is written on
// the next frame after every pointermove. Fades in/out (200ms, CSS) as the pointer enters or
// leaves the window. Only for a fine pointer that can hover; touch keeps the resting layer.
const lit = document.querySelector(".home-bg__lit");
if (lit && matchMedia("(hover: hover) and (pointer: fine)").matches) {
  const R = 160;
  let cx = 0, cy = 0, frame = 0;
  const draw = () => {
    frame = 0;
    const x = cx + scrollX - R, y = cy + scrollY - R;
    lit.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    const tile = `${-x}px ${-y}px, 0 0`;
    lit.style.webkitMaskPosition = tile;
    lit.style.maskPosition = tile;
  };
  const queue = () => { if (!frame) frame = requestAnimationFrame(draw); };
  addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    cx = e.clientX; cy = e.clientY;
    lit.classList.add("is-on");
    queue();
  }, { passive: true });
  addEventListener("scroll", queue, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => lit.classList.remove("is-on"));
  document.addEventListener("mouseleave", () => lit.classList.remove("is-on"));
}

const grid = document.querySelector("[data-project-grid]");
if (grid) initCards(grid);
