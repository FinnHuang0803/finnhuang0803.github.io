// Circular reveal between Home and a project page (site-design-system.md §4.2, §5.1).
//
// This is a classic script in <head> so its "pagereveal" listener is in place before the
// first frame.
//
// Opening (card → project): drawn on Home itself. A circle in the page colour grows from the
// click point (the card's centre for the keyboard) until it covers the screen; then the
// browser switches page and the project's own entrance plays (project.js waits on
// pageTransition.revealed). Before its entrance the project page is only the page colour
// under the same nav, so this is exactly what it looks like. Drawing it on Home means a
// double-click cannot cancel it, and Back during the opening reverses the circle from
// wherever it is (a history entry is added at the click; the project page replaces it).
// Returning ("All Work" or the browser back button): the browser's cross-document View
// Transition (both pages opt in through transition.css). The project page shrinks as a
// circle into the card the visitor came from, while Home sits at the project grid with no
// card lifted and the cards replay their entrance (cards.js calls placeHome() and go()).
// Home stays unpainted until the grid is ready, so no blank or top-of-page frame shows.
// Without a browser transition, Home appears at the grid in one frame (the browser keeps
// the previous page on screen meanwhile); after an interrupted Forward-into-project
// opening, a page-colour circle stands in for the still-empty project page and shrinks.
// The Forward button into a project also uses the browser transition, from the card.
// The name in the nav (and the other nav links) never use the circle: Home opens at the top.
(function () {
  "use strict";
  var KEY = "pt", HOME_KEY = "pt-home", FRESH = 8000, NAV_H = 64;
  var html = document.documentElement;
  var isHomePath = function (p) { return p === "/" || p === "/index.html"; };
  var isHome = isHomePath(location.pathname);
  var match = location.pathname.match(/^\/work\/([^/]+)\/?/);
  var projectId = match ? match[1] : null;
  var reduce = matchMedia("(prefers-reduced-motion: reduce)");
  var hasReveal = "onpagereveal" in window;

  // ---------- storage handshake between the two pages ----------
  function get(key) {
    try { var v = JSON.parse(sessionStorage.getItem(key)); return v && Date.now() - v.t < FRESH ? v : null; }
    catch (e) { return null; }
  }
  function put(key, v) { v.t = Date.now(); try { sessionStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function drop(key) { try { sessionStorage.removeItem(key); } catch (e) {} }
  function homeSaved() {
    try { return JSON.parse(sessionStorage.getItem(HOME_KEY)); } catch (e) { return null; }
  }

  // ---------- spring-travel (0.50s / 0.80, same maths as spring.js), cut at its first
  // arrival: the circle covers the screen (or reaches the card) at that moment. ----------
  var TRAVEL = (function (response, damping) {
    var w = 2 * Math.PI / response, wd = w * Math.sqrt(1 - damping * damping);
    var x = function (t) { return 1 - Math.exp(-damping * w * t) * (Math.cos(wd * t) + (damping * w / wd) * Math.sin(wd * t)); };
    var hit = (Math.PI - Math.atan(wd / (damping * w))) / wd;     // first time x(t) = 1
    var n = 40, pts = [];
    for (var i = 0; i <= n; i++) pts.push(+x(hit * i / n).toFixed(4));
    pts[n] = 1;
    return { easing: "linear(" + pts.join(", ") + ")", ms: Math.round(hit * 1000), at: function (ms) { return ms >= hit * 1000 ? 1 : x(ms / 1000); } };
  })(0.50, 0.80);
  var FADE = { ms: 250, easing: "ease" };          // reduced motion: a simple cross-fade
  var farthest = function (x, y) { return Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2; };
  var circle = function (r, x, y) { return "circle(" + r.toFixed(1) + "px at " + x.toFixed(1) + "px " + y.toFixed(1) + "px)"; };
  var OLD = "::view-transition-old(root)", NEW = "::view-transition-new(root)";
  var quiet = function () {};
  // Skip a transition the page does not want (its promises then reject; nothing waits on them).
  function hush(vt) {
    if (vt) [vt.ready, vt.finished, vt.updateCallbackDone].forEach(function (p) { if (p && p.catch) p.catch(quiet); });
  }
  function skip(vt) {
    if (!vt) return;
    hush(vt);
    vt.skipTransition();
  }
  // The browser may abort a transition on its own (for instance when the next page does not
  // take part); nothing waits on its promises, so their rejections are expected.
  addEventListener("pageswap", function (e) { hush(e.viewTransition); });
  addEventListener("pagereveal", function (e) { hush(e.viewTransition); });

  var api = window.pageTransition = { returning: null, revealed: null, placeHome: function () {}, go: function () {} };
  var resolveRevealed;
  api.revealed = new Promise(function (r) { resolveRevealed = r; });

  // =====================================================================
  // Project page
  // =====================================================================
  if (projectId) {
    var opening = null;           // { anim, x, y, R, start } while the circle grows

    if (!hasReveal) { drop(KEY); resolveRevealed(); }

    addEventListener("pagereveal", function (e) {
      var st = get(KEY);
      drop(KEY);
      var vt = e.viewTransition;
      if (!vt) { resolveRevealed(); return; }
      if (!st || st.kind !== "open" || st.id !== projectId) { skip(vt); resolveRevealed(); return; }

      html.classList.add("pt-open");
      vt.ready.then(function () {
        var x = st.x, y = st.y, R = farthest(x, y), anim;
        if (reduce.matches) {
          anim = html.animate({ opacity: [0, 1] }, { duration: FADE.ms, easing: FADE.easing, pseudoElement: NEW, fill: "both" });
        } else {
          anim = html.animate({ clipPath: [circle(0, x, y), circle(R, x, y)] },
            { duration: TRAVEL.ms, easing: TRAVEL.easing, pseudoElement: NEW, fill: "both" });
          opening = { anim: anim, x: x, y: y, R: R };
        }
        anim.finished.then(resolveRevealed, resolveRevealed);
      }, resolveRevealed);
      vt.finished.then(done, done);
      function done() { html.classList.remove("pt-open"); opening = null; resolveRevealed(); }
    });

    // Leaving: going back Home gets the shrinking circle; anything else does not.
    addEventListener("pageswap", function (e) {
      var vt = e.viewTransition;
      var st = get(KEY);
      var dest = e.activation && e.activation.entry && e.activation.entry.url ? new URL(e.activation.entry.url) : null;
      // Without the Navigation API the destination is unknown: that is the back button
      // (or "All Work", which marked it); nav links marked themselves as "nav".
      var toHome = dest ? dest.origin === location.origin && isHomePath(dest.pathname) : (!st || st.kind === "return");
      if ((st && st.kind === "nav") || !toHome) { skip(vt); return; }
      var v = { kind: "return", id: projectId };
      if (opening && opening.anim.playState === "running") {
        // Back pressed mid-opening: where the browser carries the transition over, Home
        // shrinks the circle from where it is. (Chrome does not start a page transition
        // while one is still running: Home then simply appears at the grid, hidden until
        // placed, and the cards rise.)
        v.r = opening.R * TRAVEL.at(opening.anim.currentTime || 0);
        v.x = opening.x; v.y = opening.y;
      }
      put(KEY, v);
    });

    // "All Work": when the previous page is Home, go back to it (same scroll, instant);
    // otherwise open Home normally, still at the grid with the shrinking circle.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.closest(".site-nav")) { put(KEY, { kind: "nav" }); return; }
      if (!a.classList.contains("back-link")) return;
      put(KEY, { kind: "return", id: projectId });
      if (previousIsHome()) { e.preventDefault(); history.back(); }
    }, true);
  }

  function previousIsHome() {
    try {
      if (window.navigation && navigation.entries && navigation.currentEntry) {
        var prev = navigation.entries()[navigation.currentEntry.index - 1];
        if (!prev || !prev.url) return false;
        var u = new URL(prev.url);
        return u.origin === location.origin && isHomePath(u.pathname);
      }
      var ref = document.referrer ? new URL(document.referrer) : null;
      var hs = homeSaved();
      return !!(ref && ref.origin === location.origin && isHomePath(ref.pathname) && history.length > 1 && hs && hs.id === projectId);
    } catch (err) { return false; }
  }

  // =====================================================================
  // Home
  // =====================================================================
  if (isHome) {
    // Home handles its own scroll position: the top on a fresh visit, the grid on return.
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    // An entry left by a cancelled opening, reached after a reload: it is just Home.
    try { if (history.state && history.state.pt === "open") history.replaceState(null, ""); } catch (e) {}

    var ret = null;               // state of the return being played
    var peek = get(KEY);
    if (peek && peek.kind === "return") { api.returning = { id: peek.id }; hideUntilPlaced(hasReveal); }
    if (!hasReveal) drop(KEY);

    // While returning, Home stays hidden until it sits at the grid with its cards ready, so the
    // top of the page never flashes and the scroll to the grid is never seen.
    // "whole": the nav is hidden too, so nothing is painted at all and the browser keeps the
    // previous page's last frame on screen meanwhile (used when no view transition runs).
    var placeTimer;
    function hideUntilPlaced(whole) {
      html.classList.add("pt-placing");
      if (whole) html.classList.add("pt-unpainted");
      clearTimeout(placeTimer);
      placeTimer = setTimeout(shown, 1500);
    }
    function shown() { clearTimeout(placeTimer); html.classList.remove("pt-placing", "pt-unpainted"); }

    // No view transition (Chrome refuses one while the opening circle is still running, so
    // pressing Back that early gets here): a circle in the page colour stands in for the
    // still-empty project page, exactly where the opening circle had got to, and shrinks
    // into the card from there. Home shows at the grid with the cards already in place.
    var veil = null;
    function veilFrom(st) {
      veil = document.createElement("div");
      veil.className = "pt-veil";
      veil.setAttribute("aria-hidden", "true");
      veil.style.clipPath = circle(st.r, st.x, st.y);
      html.appendChild(veil);
      veil.from = circle(st.r, st.x, st.y);
    }
    function shrinkVeil() {
      if (!veil) return;
      var v = veil, cx = innerWidth / 2, cy = innerHeight / 2;
      veil = null;
      if (card) { var b = card.getBoundingClientRect(); cx = b.left + b.width / 2; cy = b.top + b.height / 2; }
      var a = v.animate({ clipPath: [v.from, circle(0, cx, cy)] }, { duration: TRAVEL.ms, easing: TRAVEL.easing, fill: "both" });
      a.finished.then(function () { v.remove(); }, function () { v.remove(); });
    }

    // Scroll so the card the visitor came from is on screen: back where they were if it is
    // still fully visible there, otherwise centred.
    api.placeHome = function (el) {
      if (!el) return;
      var r = el.getBoundingClientRect(), top = r.top + scrollY, saved = homeSaved();
      var fits = function (sy) { var t = top - sy; return t >= NAV_H && t + r.height <= innerHeight; };
      var y = saved && api.returning && saved.id === api.returning.id && fits(saved.y)
        ? saved.y
        : top - NAV_H - Math.max(0, (innerHeight - NAV_H - r.height) / 2);
      y = Math.max(0, Math.min(y, document.documentElement.scrollHeight - innerHeight));
      scrollTo({ top: y, left: 0, behavior: "instant" });
      card = el;
    };
    // The cards are ready (to rise, or to show at once): reveal Home and start the shrink in
    // the same frame. (May come before or after pagereveal; whichever is last starts it.)
    var card = null, went = false;
    api.go = function (el) {
      if (el) card = el;
      went = true;
      shown();
      shrinkVeil();
      startShrink();
    };

    function startShrink() {
      if (!ret || ret.started || !ret.ready || !(went || ret.late)) return;
      ret.started = true;
      clearTimeout(ret.timer);
      var cx = innerWidth / 2, cy = innerHeight / 2;
      if (card) {
        var b = card.getBoundingClientRect();
        cx = b.left + b.width / 2; cy = b.top + b.height / 2;
      }
      var anim;
      if (reduce.matches) {
        anim = html.animate({ opacity: [1, 0] }, { duration: FADE.ms, easing: FADE.easing, pseudoElement: OLD, fill: "both" });
      } else {
        var from = ret.st.r != null ? circle(ret.st.r, ret.st.x, ret.st.y) : circle(farthest(cx, cy), cx, cy);
        anim = html.animate({ clipPath: [from, circle(0, cx, cy)] },
          { duration: TRAVEL.ms, easing: TRAVEL.easing, pseudoElement: OLD, fill: "both" });
      }
      // Drop the hold that kept the project page covering Home until now.
      document.getAnimations().forEach(function (a) {
        if (a !== anim && a.effect && a.effect.pseudoElement === OLD) a.cancel();
      });
    }

    function beginReturn(e, st) {
      var vt = e.viewTransition;
      api.returning = { id: st.id };
      if (!vt) {
        // Interrupted opening: the project page was still empty, so the stand-in circle
        // matches it exactly; the cards stay as they were (no entrance replay).
        if (st.r != null && !reduce.matches) { veilFrom(st); api.returning.instant = true; }
        return;
      }
      html.classList.remove("pt-unpainted");      // the old page covers Home from here on
      var mine = ret = { st: st, ready: false, late: false, started: false };
      html.classList.add("pt-return");
      vt.ready.then(function () {
        // Interrupted opening: hold the circle exactly as it was until the shrink starts.
        if (st.r != null && !reduce.matches) {
          var c = circle(st.r, st.x, st.y);
          html.animate({ clipPath: [c, c] }, { duration: 3000, pseudoElement: OLD });
        }
        mine.ready = true;
        startShrink();
      }, function () {});
      // Never wait long: if the cards are slow, shrink to where the card is (or the centre).
      mine.timer = setTimeout(function () { mine.late = true; startShrink(); }, 1200);
      vt.finished.then(end, end);
      function end() {
        clearTimeout(mine.timer);
        if (ret !== mine) return;
        html.classList.remove("pt-return");
        ret = null;
      }
    }

    addEventListener("pagereveal", function (e) {
      var st = get(KEY);
      drop(KEY);
      if (st && st.kind === "return") { beginReturn(e, st); return; }
      api.returning = null;
      shown();
      skip(e.viewTransition);
    });

    // Back from the project page out of the back/forward cache: the same return, and the
    // theme the visitor may have switched meanwhile (see theme-init.js).
    addEventListener("pageshow", function (e) {
      if (!e.persisted) return;
      var st = get(KEY);
      api.returning = st && st.kind === "return" ? { id: st.id } : null;
      went = false; card = null;
      if (drawn) { drawn.v.remove(); drawn = null; html.classList.remove("pt-opening"); }
      if (api.returning) hideUntilPlaced(false);
      if (!hasReveal) drop(KEY);
    });

    // Leaving Home: only a card gets the circle.
    addEventListener("pageswap", function (e) {
      var vt = e.viewTransition;
      if (!vt) return;
      var st = get(KEY);
      var dest = e.activation && e.activation.entry && e.activation.entry.url ? new URL(e.activation.entry.url) : null;
      var m = dest && dest.origin === location.origin && dest.pathname.match(/^\/work\/([^/]+)\/?/);
      if (st && st.kind === "opened") { skip(vt); return; }          // the circle was drawn here already
      if (st && st.kind === "open" && (!dest || (m && m[1] === st.id))) return;
      if (m && (!st || st.kind !== "nav")) {
        // Forward button back into a project: grow from its card's centre.
        var card = document.querySelector('.card[href="/work/' + m[1] + '/"]');
        if (card) {
          var b = card.getBoundingClientRect();
          put(KEY, { kind: "open", id: m[1], x: b.left + b.width / 2, y: b.top + b.height / 2 });
          put(HOME_KEY, { id: m[1], y: scrollY });
          return;
        }
      }
      skip(vt);
    });

    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (a.closest(".site-nav")) { put(KEY, { kind: "nav" }); return; }
      var m = a.classList.contains("card") && a.getAttribute("href").match(/^\/work\/([^/]+)\/?/);
      if (!m) return;
      e.preventDefault();
      // Further clicks while the project is opening (a double-click) are ignored.
      if (drawn) return;
      var x = e.clientX, y = e.clientY;
      if (!e.detail || (x === 0 && y === 0)) {       // keyboard: from the card's centre
        var b = (a.closest(".card-cell") || a).getBoundingClientRect();
        x = b.left + b.width / 2; y = b.top + b.height / 2;
      }
      openCard(m[1], a.href, x, y, true);
    }, true);

    // ---------- Opening a project (card → project) ----------
    // The circle is drawn on Home itself: a circle in the page colour grows from the click
    // point (until the project's entrance plays, the project page is nothing but the page
    // colour under the same nav, so this is exactly what it looks like). When it covers the
    // screen the browser switches to the project page, which then plays its entrance.
    // - The page starts loading at the click, in the background.
    // - A history entry is added at the click, so Back during the opening is caught here:
    //   the circle reverses from wherever it is and Home stays. Forward replays the opening.
    // - A double-click's second click lands on Home and is ignored.
    var drawn = null;
    // While the circle grows, the browser renders the project page in the background
    // (prerender), so it is ready the moment the circle covers the screen and its entrance
    // starts at once, with no empty pause (step 7). Browsers without speculation rules fall
    // back to fetching the page early.
    var canPrerender = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports("speculationrules"));
    function prepare(url) {
      if (prepare[url]) return;
      prepare[url] = true;
      if (canPrerender) {
        var rules = document.createElement("script");
        rules.type = "speculationrules";
        rules.textContent = JSON.stringify({ prerender: [{ source: "list", urls: [url] }] });
        document.head.appendChild(rules);
      } else {
        var hint = document.createElement("link");
        hint.rel = "prefetch"; hint.href = url;
        document.head.appendChild(hint);
      }
    }
    // Start even earlier where we can: a card the pointer rests on (about 0.2s) or that is
    // pressed is prerendered by the browser ("moderate"), so it is usually ready long before
    // the circle covers the screen.
    if (canPrerender) {
      var early = document.createElement("script");
      early.type = "speculationrules";
      early.textContent = JSON.stringify({ prerender: [{ where: { href_matches: "/work/*" }, eagerness: "moderate" }] });
      document.head.appendChild(early);
      // Keyboard: a focused card is prepared too (the rule above only reacts to the pointer).
      document.addEventListener("focusin", function (e) {
        var a = e.target.closest && e.target.closest("a.card");
        if (a) prepare(a.href);
      });
    }
    function openCard(id, url, x, y, push) {
      prepare(url);

      var v = document.createElement("div");
      v.className = "pt-veil";
      v.setAttribute("aria-hidden", "true");
      html.appendChild(v);
      html.classList.add("pt-opening");
      var anim = reduce.matches
        ? v.animate({ opacity: [0, 1] }, { duration: FADE.ms, easing: FADE.easing, fill: "both" })
        : v.animate({ clipPath: [circle(0, x, y), circle(farthest(x, y), x, y)] },
            { duration: TRAVEL.ms, easing: TRAVEL.easing, fill: "both" });
      var o = drawn = { v: v, anim: anim, id: id, url: url };
      put(HOME_KEY, { id: id, y: scrollY });
      if (push) history.pushState({ pt: "open", id: id, x: x, y: y }, "", location.href);
      anim.finished.then(function () {
        if (drawn !== o) return;
        put(KEY, { kind: "opened", id: id });
        location.replace(url);                  // takes the place of the entry added above
      }, function () {});
    }
    function cancelOpening() {
      var o = drawn;
      if (!o) return;
      drawn = null;
      drop(KEY);
      o.anim.reverse();                         // back from wherever the circle is
      // The "View" magnifier stays hidden until the circle has fully shrunk, then grows back
      // from the pointer (cards.js listens), so it never floats over the circle.
      var after = function () {
        o.v.remove();
        if (drawn) return;
        html.classList.remove("pt-opening");
        dispatchEvent(new Event("pt-cancelled"));
      };
      o.anim.finished.then(after, after);
    }
    addEventListener("popstate", function (e) {
      if (drawn) { cancelOpening(); return; }
      var s = e.state;
      if (s && s.pt === "open") {
        // Forward into an opening that Back had cancelled: play it again from the card.
        var a = document.querySelector('.card[href="/work/' + s.id + '/"]');
        var b = a ? (a.closest(".card-cell") || a).getBoundingClientRect() : null;
        openCard(s.id, "/work/" + s.id + "/", b ? b.left + b.width / 2 : innerWidth / 2, b ? b.top + b.height / 2 : innerHeight / 2, false);
      }
    });
  }
})();
