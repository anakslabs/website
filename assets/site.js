/* =========================================================================
   Anaks Labs — shared site script (dependency-free, IIFE)
   Year stamp, mobile nav toggle, node-constellation canvas, scroll reveal.

   The KO/EN i18n engine was removed when the site became English-only.
   Every page ships the language it is written in; there is no runtime
   switching and no language toggle.
   ========================================================================= */
(function () {
  "use strict";

  var ROOT = document.documentElement;

  /* ---------------- current year ---------------- */
  var y = document.getElementById("yr");
  if (y) y.textContent = new Date().getFullYear();

  /* ---------------- mobile nav toggle ---------------- */
  (function () {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.getElementById("site-nav");
    if (!toggle || !nav) return;
    function setOpen(open) {
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    }
    toggle.addEventListener("click", function () {
      setOpen(toggle.getAttribute("aria-expanded") !== "true");
    });
    /* close on nav link click, Escape, or outside click */
    nav.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setOpen(false);
    });
    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });
  })();

  /* ---------------- node constellation (echoes the logo circuit motif) ---------------- */
  (function () {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var canvas = document.getElementById("net");
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var W = 0, H = 0, DPR = Math.min(window.devicePixelRatio || 1, 2);
    var nodes = [], LINK = 148;
    function seed() {
      var count = Math.min(88, Math.max(28, Math.round((W * H) / 22000)));
      nodes = [];
      for (var i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * W, y: Math.random() * H,
          vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.6 + 1.0
        });
      }
    }
    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * DPR; canvas.height = H * DPR;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
      if (reduce) step(true);
    }
    function step(still) {
      ctx.clearRect(0, 0, W, H);
      for (var i = 0; i < nodes.length; i++) {
        var n = nodes[i];
        if (!still) {
          n.x += n.vx; n.y += n.vy;
          if (n.x < 0 || n.x > W) n.vx *= -1;
          if (n.y < 0 || n.y > H) n.vy *= -1;
        }
      }
      for (var a = 0; a < nodes.length; a++) {
        for (var b = a + 1; b < nodes.length; b++) {
          var dx = nodes[a].x - nodes[b].x, dy = nodes[a].y - nodes[b].y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < LINK) {
            var o = (1 - dist / LINK) * 0.28;
            ctx.strokeStyle = "rgba(45,99,240," + o.toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[a].x, nodes[a].y);
            ctx.lineTo(nodes[b].x, nodes[b].y);
            ctx.stroke();
          }
        }
      }
      for (var k = 0; k < nodes.length; k++) {
        var p = nodes[k];
        ctx.fillStyle = "rgba(45,99,240,0.42)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still && !reduce && running) requestAnimationFrame(function () { step(false); });
    }

    /* Visibility guard. The loop computes every node pair every frame — 88
       nodes at 1920x1080 is 3,828 distance checks per frame — and it used to
       recurse forever, including in a background tab, on every page.

       The guard is document.hidden and nothing else, deliberately. The obvious
       addition would be an IntersectionObserver, and it would be dead code:
       #net is a .layer, position:fixed inset:0, so it intersects the viewport
       at every scroll position by construction. Measured before writing this —
       an observer on it reports intersecting after scrolling 12,000px. A guard
       that can never fire is worse than no guard, because it reads like
       protection.

       Nothing about the animation changes. It stops when the tab is not being
       looked at and resumes from the same node positions.

       Deliberately narrow: this canvas is the circuit motif from the logo, so
       whether it stays at all is a design decision, not a performance one. */
    var running = false;
    function pump() {
      var want = !document.hidden && !reduce;
      if (want === running) return;
      running = want;
      if (running) step(false);          /* resumes from the current node state */
    }
    document.addEventListener("visibilitychange", pump);

    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 180); });
    resize();
    pump();
  })();

  /* ---- before/after viewer (/clinics/example/ only).
     Same progressive-enhancement rule as the reveal below: the markup ships
     both builds stacked and visible, and the tab strip ships hidden. Only
     when this runs does the pair collapse into a toggle. ---- */
  (function () {
    var viewer = document.getElementById("compare-viewer");
    if (!viewer) return;
    var tabs = viewer.querySelector(".compare-tabs");
    var buttons = viewer.querySelectorAll('[role="tab"]');
    if (!tabs || buttons.length < 2) return;

    function select(tab) {
      Array.prototype.forEach.call(buttons, function (b) {
        var on = b === tab;
        b.setAttribute("aria-selected", String(on));
        b.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(b.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }

    Array.prototype.forEach.call(buttons, function (b, i) {
      b.addEventListener("click", function () { select(b); });
      b.addEventListener("keydown", function (e) {
        var step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        e.preventDefault();
        var next = buttons[(i + step + buttons.length) % buttons.length];
        select(next);
        next.focus();
      });
    });

    tabs.hidden = false;
    select(buttons[0]);
  })();

  /* ---- scroll reveal: the hidden state is applied by JS only, so a page with
     JS disabled (or an older browser) simply shows everything. ---- */
  (function () {
    var els = document.querySelectorAll("[data-reveal]");
    if (!els.length) return;
    if (!("IntersectionObserver" in window)) return;
    ROOT.classList.add("reveal-on");
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add("in");
        io.unobserve(e.target);
      });
    }, { rootMargin: "0px 0px -12% 0px", threshold: 0.08 });

    /* One reveal per section, in reading order: heading, then body, then
       whatever list or figure follows. The delay is computed per section
       rather than per page, so a section entering halfway down does not
       inherit a two-second offset from everything above it, and it is capped
       at three steps because a fourth is no longer read as sequence — it is
       read as the page being slow. */
    els.forEach(function (el) {
      var section = el.closest("section");
      if (section) {
        var i = Array.prototype.indexOf.call(section.querySelectorAll("[data-reveal]"), el);
        if (i > 0) el.style.transitionDelay = Math.min(i, 3) * 60 + "ms";
      }
      io.observe(el);
    });

    /* A reveal that has not fired yet is at opacity 0, and the links inside it
       are still in the tab order. Tabbing therefore walked the keyboard onto
       ten invisible controls on this page: focus was really on "Check your page
       free", the browser had scrolled it into view, and there was nothing on
       screen to see. Measured, not guessed — snapshot.mjs tabs the page and
       reads the computed opacity at every stop.

       So focus reveals its own block, immediately and without the delay, which
       is the one case where the entrance is not something anybody asked to
       watch. focusin rather than focus because it has to catch the descendant
       that actually took focus, not the wrapper carrying the attribute. */
    document.addEventListener("focusin", function (e) {
      var block = e.target.closest ? e.target.closest("[data-reveal]") : null;
      if (!block || block.classList.contains("in")) return;
      block.style.transitionDelay = "0ms";
      block.classList.add("in");
      io.unobserve(block);
    });
  })();

  /* ---- the answer arriving (home) -----------------------------------------
     The hero holds a question with an empty answer bubble; the demand section
     below it says the answer has already resolved and named somebody. Those
     two photographs are the same objects shot twice, so the second is stacked
     on the first and swapped in place when the section that makes the claim
     comes into view. The copy and the picture change at the same moment.

     Triggered off #demand rather than off the figure itself: the figure is on
     screen for most of the hero, and resolving it there would answer the
     question before the page has finished asking it. The bottom margin holds
     the swap until the demand heading is a quarter of the way up the viewport,
     which is where a reader is looking when they read it — the figure is still
     fully visible at that scroll position at every width measured.

     Reduced motion is handled in CSS, which shows the resolved frame from the
     start; this observer may still run and add the class, and doing so is a
     no-op because the frame is already opaque. ---- */
  (function () {
    var pair = document.getElementById("answer-pair");
    var demand = document.getElementById("demand");
    if (!pair || !demand || !("IntersectionObserver" in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        pair.classList.add("resolved");
        io.disconnect();
      });
    }, { rootMargin: "0px 0px -25% 0px", threshold: 0 });
    io.observe(demand);
  })();
})();
