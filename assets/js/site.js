// Shared behaviour for every page: spring tokens, squircle corners, theme toggle, nav line.
import "./spring.js";                       // installs --spring-* on <html>
import { smoothCorners } from "./squircle.js";
import "./page-enter.js";                   // page entrance on Work, Lab, About (§3)

smoothCorners();

// ---------- Theme ----------
// Default: light. Once the visitor uses the toggle, their choice is remembered
// (localStorage "theme") and applied before paint by theme-init.js.
const root = document.documentElement;
const toggle = document.querySelector(".theme-toggle");

const currentTheme = () => (root.dataset.theme === "dark" ? "dark" : "light");

function syncLabel() {
  if (toggle) toggle.setAttribute("aria-label", currentTheme() === "dark" ? "Switch to light theme" : "Switch to dark theme");
}

if (toggle) {
  toggle.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.dataset.theme = next;              // icon morph and page colours start in the same frame
    try { localStorage.setItem("theme", next); } catch (e) { /* storage blocked: lasts for this page only */ }
    syncLabel();
  });
}
// Keep other open tabs in step with the visitor's choice.
addEventListener("storage", e => {
  if (e.key !== "theme") return;
  if (e.newValue === "light" || e.newValue === "dark") root.dataset.theme = e.newValue;
  else delete root.dataset.theme;
  syncLabel();
});
addEventListener("pageshow", e => { if (e.persisted) syncLabel(); });   // theme-init.js may have switched it
syncLabel();

// ---------- Navigation bar: a thin line fades in once the page is scrolled ----------
const nav = document.querySelector(".site-nav");
if (nav) {
  const syncNavLine = () => nav.classList.toggle("is-scrolled", scrollY > 0);
  addEventListener("scroll", syncNavLine, { passive: true });
  syncNavLine();
}
