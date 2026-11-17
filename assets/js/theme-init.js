// Runs before the page paints: applies the theme the visitor chose earlier, if any.
// With no stored choice the site is light (site-design-system.md §2).
(function () {
  var root = document.documentElement;
  function apply() {
    try {
      var t = localStorage.getItem("theme");
      if (t === "light" || t === "dark") root.dataset.theme = t;
    } catch (e) { /* storage blocked: stay light */ }
  }
  apply();
  // Page entrance (§3): hide the main pages' first-screen content until page-enter.js fades it
  // in, so it never paints once and then jumps. A failsafe shows it if that script never runs.
  root.classList.add("pe");
  setTimeout(function () { root.classList.remove("pe"); }, 3000);
  // A page restored by the Back button keeps the theme it was left with; if the visitor
  // switched theme on another page meanwhile, take it over at once (no colour fade).
  addEventListener("pageshow", function (e) {
    if (!e.persisted) return;
    var before = root.dataset.theme;
    var t = null;
    try { t = localStorage.getItem("theme"); } catch (err) {}
    if (t !== "light" && t !== "dark") return;
    if (t === before) return;
    root.style.transition = "none";
    root.dataset.theme = t;
    void getComputedStyle(root).getPropertyValue("--bg");
    requestAnimationFrame(function () { root.style.transition = ""; });
  });
})();
