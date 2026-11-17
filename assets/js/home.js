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

const grid = document.querySelector("[data-project-grid]");
if (grid) initCards(grid);
