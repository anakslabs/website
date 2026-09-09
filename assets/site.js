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

     Triggered off the demand HEADING and not off the section, which is the
     whole difference between the effect landing and the effect happening in an
     empty room. #demand is a tall section, so its top edge crosses any
     reasonable trigger line almost immediately: measured, the swap fired at a
     scroll of 160px with the heading still 863px down the viewport — the
     picture answered a question the reader had not been asked yet, and on a
     fresh load with no scroll at all it never fired in 6.5 seconds. Observing
     the heading with the root's bottom pulled in by 40% fires when the heading
     itself crosses 60% of the viewport height, which is where a reader is
     looking when they read it. The hero figure is still on screen there at
     every width measured, which is the other half of the requirement.

     Reduced motion is handled in CSS, which shows the resolved frame from the
     start; this observer may still run and add the class, and doing so is a
     no-op because the frame is already opaque. ---- */
  (function () {
    var pair = document.getElementById("answer-pair");
    var demand = document.getElementById("demand");
    if (!pair || !demand || !("IntersectionObserver" in window)) return;
    var claim = demand.querySelector("h2") || demand;
    /* Two lines because the hero figure is two different things. On a desktop it
       is the section — absolute, inset 0 — so it is on screen for the whole
       hero and the swap can wait until the claim is well up the viewport: at
       -40% it fires with the claim at 0.58 of the height and the figure still
       42-49% visible. On a phone it is a 219px band in the flow, and by the time
       the claim is 60% up, the band has been gone for 70px of scroll. Measured
       at 390: the figure's bottom sits 576px above the claim's top, so both are
       on screen only between scroll 282 and 550, and -15% fires at 409 with the
       figure 64% visible. Firing at all costs nothing; firing against an empty
       screen costs the effect. */
    var pull = window.matchMedia("(min-width: 1100px)").matches ? "-40%" : "-15%";
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        pair.classList.add("resolved");
        io.disconnect();
      });
    }, { rootMargin: "0px 0px " + pull + " 0px", threshold: 0 });
    io.observe(claim);
  })();
  /* ---- the hero conversation runs once, when it is actually on screen ------
     The reveal itself is entirely CSS; this only decides WHEN. Two rules hold
     it together and both are the same rule the rest of this file follows:

     · the withheld state lives under .reveal-on, which is added above only
       when scripting is running, so a reader without it is served the
       finished conversation rather than an empty card;
     · if IntersectionObserver is missing, or the element is already in view,
       the class goes on immediately. A browser that cannot observe must not
       be the one browser that never sees the answer.

     Once only — .run is added and the observer disconnects, because a chat
     that retypes itself every time it scrolls back into view is a page that
     will not sit still to be read. */
  (function () {
    var chat = document.getElementById("hero-chat");
    if (!chat) return;
    /* NOT ON THE REEL. There the figure is printed on a card that arrives with
       its scene, and the cin-* block below owns the timing — see "the typed
       answer waits for the card it is written on". This observer would fire
       against a card at opacity 0 and is the defect that gate exists to fix;
       leaving both in place would mean the fix is only ever a race. */
    if (chat.closest(".cin-track")) return;
    var run = function () { chat.classList.add("run"); };
    if (!("IntersectionObserver" in window)) { run(); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        run();
        io.disconnect();
      });
    }, { threshold: 0.25 });
    io.observe(chat);
  })();

})();

/* =========================================================================
   cin-* — the cinematic reel (home page only)
   =========================================================================
   Everything above this divider is untouched and runs on every page. This
   block runs only where body carries .cin-page, and it does four things:

     · the leading-edge rail, which is document scroll and nothing else;
     · the header, which stays off the title card and arrives after it;
     · the ground the chrome is sitting over, so the rail can invert;
     · the fallback that writes --p and --q where the browser has no
       scroll-driven animations, and the pointer tilt on the answer card.

   The scenes themselves are CSS. Where the browser supports
   animation-timeline: view(), NONE of the scroll progress on this page is
   computed here — the timelines run off the main thread and this file never
   reads a rectangle during a scroll. The rAF loop below only exists for the
   browsers that cannot, and it is behind an IntersectionObserver so it is
   idle for every scene that is not on screen.
   ========================================================================= */
(function () {
  "use strict";
  var body = document.body;
  if (!body || !body.classList.contains("cin-page")) return;

  var ROOT = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* SCRIPT RAN, SO THE SCENES MAY SCRUB. Every scroll-driven timeline in the
     stylesheet is written under html.cin-on and every --p calc() rests at the
     finished state, so a page whose scripting never runs is a painted page
     rather than an empty one waiting to be scrolled. Set once, here, and
     never touched again: the timelines still run off the compositor and this
     file still reads no rectangle during a scroll. */
  ROOT.classList.add("cin-on");

  /* Feature test, not a browser test. Chrome and Safari 26 run the scenes off
     the compositor; anything else gets the same numbers from rAF. */
  var NATIVE = !!(window.CSS && CSS.supports && CSS.supports("animation-timeline", "view()"));
  if (!NATIVE) ROOT.classList.add("cin-fb");

  /* ---------------- rail + header state ----------------
     One passive scroll listener that sets a flag, one rAF that reads. The
     listener never touches layout, so a fast scroll cannot queue work. */
  var rail = document.querySelector(".cin-rail");
  var ticking = false;
  function frame() {
    ticking = false;
    var max = (document.documentElement.scrollHeight || 0) - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (rail) rail.style.setProperty("--doc", p.toFixed(4));
    body.classList.toggle("cin-atop", window.scrollY < 90);
    if (!NATIVE && !reduce) fallbackTick();
    if (chatGate) chatGate();
  }
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  /* ---------------- which ground the chrome is over ----------------
     A thin band across the top of the viewport; whichever scene is crossing
     it owns the page background and the rail colour. Observed rather than
     measured, so this costs nothing per scroll. */
  (function () {
    if (!("IntersectionObserver" in window)) return;
    var scenes = document.querySelectorAll("[data-ground]");
    if (!scenes.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        body.classList.toggle("cin-ground-dark", e.target.dataset.ground === "dark");
      });
    }, { rootMargin: "-2% 0px -92% 0px", threshold: 0 });
    Array.prototype.forEach.call(scenes, function (s) { io.observe(s); });
  })();

  /* ---------------- the fallback numbers ----------------
     Same two numbers the CSS timelines produce, same ranges:

       .cin-track          contain 0% -> contain 100%   (the pin itself)
       .cin-sc:not(.pin)   entry   12% -> entry 96%     (arrival)
       .cin-bed            cover   0%  -> cover 100%    (parallax)

     Only elements the observer says are on screen are measured, and the loop
     runs off the same rAF as the rail rather than one of its own. */
  var tracked = [];
  if (!NATIVE && !reduce) {
    (function () {
      function add(el, kind, prop) { tracked.push({ el: el, kind: kind, prop: prop, on: false }); }
      Array.prototype.forEach.call(document.querySelectorAll(".cin-track"), function (el) { add(el, "contain", "--p"); });
      /* The inner pages are documents, not reels: their scenes are the shared
         [data-reveal] blocks the pages already carried, and they arrive on
         exactly the range an unpinned scene arrives on. Same kind, same
         numbers — the only difference is which elements are in the list. */
      Array.prototype.forEach.call(document.querySelectorAll(".cin-sc:not(.cin-pin), .cin-doc [data-reveal]"), function (el) { add(el, "entry", "--p"); });
      Array.prototype.forEach.call(document.querySelectorAll(".cin-bed, .cin-excl-shot"), function (el) { add(el, "cover", "--q"); });
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (e) {
            for (var i = 0; i < tracked.length; i++) {
              if (tracked[i].el === e.target) { tracked[i].on = e.isIntersecting; break; }
            }
          });
          /* 100%, not 10%, and it is the other half of the --p: 0 reset in the
             stylesheet. This observer decides which elements the rAF is allowed
             to write a number onto; anything it has not switched on yet is
             showing its resting value. At 10% a scene was switched on with a
             tenth of a viewport to go, which is late enough to be seen
             happening. A viewport of margin on each side means every element
             carries a driven number well before it is looked at, and the cost
             is bounded — the loop still only measures what is near the screen,
             and it is only ever running on the browsers that have no
             scroll-driven timelines at all. */
        }, { rootMargin: "100% 0px 100% 0px", threshold: 0 });
        tracked.forEach(function (t) { io.observe(t.el); });
      } else {
        tracked.forEach(function (t) { t.on = true; });
      }
    })();
  }

  function clamp01(n) { return n < 0 ? 0 : n > 1 ? 1 : n; }

  function fallbackTick() {
    var V = window.innerHeight;
    for (var i = 0; i < tracked.length; i++) {
      var t = tracked[i];
      if (!t.on) continue;
      var r = t.el.getBoundingClientRect();
      var v;
      if (t.kind === "contain") {
        /* the interval during which a track taller than the viewport fully
           covers it — identical to the sticky pin */
        var span = r.height - V;
        v = span > 0 ? clamp01(-r.top / span) : 1;
      } else if (t.kind === "entry") {
        var d = r.height + V;
        var raw = clamp01((V - r.top) / d);
        v = clamp01((raw - 0.12) / (0.96 - 0.12));
      } else {
        v = clamp01((V - r.top) / (r.height + V));
      }
      t.el.style.setProperty(t.prop, v.toFixed(4));
    }
  }

  /* ---------------- the typed answer waits for the card it is written on ------
     The conversation in scene 2 is drawn word by word: 77 spans, the last of
     them scheduled at 2250 + 76 x 34 = 4.83s after the class lands, so the whole
     performance is over inside about five and a half seconds. It used to start
     on an IntersectionObserver over the <figure> at threshold .25, and that is
     satisfied while the pinned track is still entering — measured, the class
     was added at document scroll 375. The card the conversation is printed on
     is driven by the scene's own --p and does not reach opacity 1 until scroll
     ~1098. So every reader met the same two things and never the typing: an
     empty card, and then a finished transcript.

     THE GATE IS THE CARD'S OWN ARRIVAL, WHICH IS --p AND NOT A RECTANGLE, and
     the number comes out of the card's own formula rather than off a feel.
     .cin-card is opacity: clamp(0, (--p - .02) * 5, 1), so .18 — the first
     number tried — puts the first word on a card at .825, which is the same
     defect one notch quieter. Solving that formula for .9 gives .20 exactly;
     .21 is the first value clear of it with the float to spare, and it measures
     .95 on the frame the class lands. Read off the track from the same rAF the
     rail already runs on — one getComputedStyle per frame, and only until it
     fires; after that this costs nothing for the life of the page.

     AND THE CARD HAS TO BE ON SCREEN, which is a separate fact and not a
     tautology. Below 900px the pin is dissolved and the stylesheet holds --p at
     1 for every track, and under reduced motion .cin-page does the same; on
     those paths the number alone is true at load, with the scene two screens
     down. The observer supplies the other half. Together they say what was
     always meant: start when the reader can see the card.

     A browser that cannot report the number is not made to wait for it — the
     parse falls back to 1, so the answer plays as soon as it is looked at. */
  var chatGate = (function () {
    var chat = document.getElementById("hero-chat");
    var track = chat && chat.closest(".cin-track");
    if (!chat || !track) return null;
    var card = document.getElementById("cin-tilt") || chat;
    var io = null;
    var seen = !("IntersectionObserver" in window);
    var done = false;
    function check() {
      if (done || !seen) return;
      var p = parseFloat(getComputedStyle(track).getPropertyValue("--p"));
      if (!(p >= 0)) p = 1;
      if (p < 0.21) return;
      done = true;
      chat.classList.add("run");
      if (io) io.disconnect();
    }
    if (!seen) {
      io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) if (entries[i].isIntersecting) seen = true;
        check();
        /* threshold 0 against a shortened root, NOT a ratio. The old gate asked
           for 25% of the figure, and on a phone the card is taller than the
           viewport — a ratio that can never be reached is a gate that never
           opens. Pulling the root's bottom edge in by a quarter asks the same
           question in a way the geometry can always answer: has the top of the
           card come up past three quarters of the screen. */
      }, { threshold: 0, rootMargin: "0px 0px -25% 0px" });
      io.observe(card);
    }
    return check;
  })();

  /* ---------------- the answer card, tilted toward the pointer ----------------
     Desktop pointers only, and off entirely under reduced motion. Two custom
     properties feed a rotation the stylesheet already composes with the
     scroll-driven rise, so the two never fight over `transform`. */
  (function () {
    var card = document.getElementById("cin-tilt");
    if (!card || reduce) return;
    if (!window.matchMedia || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    var raf = 0, nx = 0, ny = 0;
    function apply() {
      raf = 0;
      card.style.setProperty("--tx", nx.toFixed(3));
      card.style.setProperty("--ty", ny.toFixed(3));
    }
    window.addEventListener("pointermove", function (e) {
      var r = card.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      /* normalised against a generous radius so the tilt is a lean, not a flip */
      nx = Math.max(-1, Math.min(1, (e.clientX - cx) / (r.width * 1.15)));
      ny = Math.max(-1, Math.min(1, (e.clientY - cy) / (r.height * 1.15)));
      card.classList.add("cin-live");
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
    window.addEventListener("pointerleave", function () {
      nx = ny = 0; card.classList.remove("cin-live");
      if (!raf) raf = requestAnimationFrame(apply);
    }, { passive: true });
  })();

  frame();
})();

/* =========================================================================
   Landing hero — registering the search layer on the picture's focus ring.

   THIS SCRIPT DOES NOT ANIMATE ANYTHING. The sweep, the pulses and the breath
   are CSS animations on transform and opacity, which the compositor owns; all
   this does is (a) work out where the ring the render draws actually lands and
   write that to three custom properties, and (b) switch the animations on and
   off with a class. Nothing here runs per frame.

   WHY THE GEOMETRY CANNOT BE A CONSTANT. The bed is object-fit: cover, so the
   crop — and therefore where the ring sits — is a function of the viewport's
   ASPECT RATIO, not its width. 1280x720 and 1280x900 share a vw and crop the
   master differently. So the mapping is done properly: natural size, computed
   object-position, and the scale read out of the computed transform matrix, so
   that if the stylesheet changes the zoom (it does — 1.08 desktop) this follows
   without being told. Recomputed on resize and on the image's own load, never
   on scroll: the parallax is CSS, off the same --q the bed uses.

   THE FOCUS POINT IS A PROPERTY OF THE RENDER, not of the page. Two renders
   are served — a panorama above 900 and a portrait crop below it — and each
   has its own focus and its own ring radius, measured off the master. The
   aspect of whichever file the browser actually chose is what picks between
   them, which is the only signal that is correct under any future <source>.
   ========================================================================= */
(function () {
  "use strict";
  var scan = document.querySelector(".cin-scan");
  if (!scan) return;
  var bed = scan.parentNode;
  var img = bed.querySelector("img");
  if (!img) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  /* focus x, focus y, ring radius — all as fractions of the render's WIDTH,
     measured on the masters in section-images (11-cin-title.png and
     11-cin-title-m.png). */
  var WIDE = { fx: 0.7156, fy: 0.4985, r: 0.1616 };
  var TALL = { fx: 0.5200, fy: 0.9000, r: 0.2600 };

  function pos(v, i) {
    /* computed object-position is two components; Chrome gives px, others may
       give percentages or keywords. Everything resolves to a 0..1 fraction of
       the overflow, which is what object-fit uses. */
    var p = String(v).trim().split(/\s+/)[i] || "50%";
    if (p === "left" || p === "top") return 0;
    if (p === "right" || p === "bottom") return 1;
    if (p === "center") return 0.5;
    if (p.slice(-1) === "%") return parseFloat(p) / 100;
    return 0.5;
  }

  function place() {
    var w = bed.clientWidth, h = bed.clientHeight;
    /* naturalWidth/Height on an <img> with a w-descriptor srcset is DENSITY
       CORRECTED, not the file's pixel size: the 480x1039 phone render reports
       389x844 here. Only the ratio survives that correction, and only the ratio
       is used below — object-fit's scale resolves to a function of the aspect
       alone once one axis is filled — so this is correct as written, and it
       would not be if a raw pixel count were ever wanted from it. */
    var iw = img.naturalWidth, ih = img.naturalHeight;
    if (!w || !h || !iw || !ih) return false;

    var M = WIDE;
    if (iw / ih < 1.2) M = TALL;

    var cs = getComputedStyle(img);
    /* the computed object-position of a percentage is reported in px by Chrome;
       divide it back out by the overflow to recover the fraction. */
    var s = Math.max(w / iw, h / ih);
    var dw = iw * s, dh = ih * s;
    var raw = cs.objectPosition, px, py;
    if (/px/.test(raw)) {
      var parts = raw.trim().split(/\s+/);
      px = dw - w > 0.5 ? parseFloat(parts[0]) / (dw - w) : 0.5;
      py = dh - h > 0.5 ? parseFloat(parts[1]) / (dh - h) : 0.5;
    } else {
      px = pos(raw, 0); py = pos(raw, 1);
    }

    var k = 1;
    try {
      var m = new DOMMatrixReadOnly(cs.transform);
      if (m.a > 0.2) k = m.a;
    } catch (e) { /* older engines: the zoom is 1.08 and being 8% out is not a bug worth a polyfill */ }

    var x = -(dw - w) * px + M.fx * dw;
    var y = -(dh - h) * py + M.fy * dh;
    scan.style.setProperty("--fx", ((x - w / 2) * k + w / 2).toFixed(1) + "px");
    scan.style.setProperty("--fy", ((y - h / 2) * k + h / 2).toFixed(1) + "px");
    scan.style.setProperty("--r", (M.r * dw * k).toFixed(1) + "px");
    /* the bed's parallax is -6% of its own height over a full pass; the layer
       takes the same number so the two move together. */
    scan.style.setProperty("--par", (h * -0.06).toFixed(1) + "px");
    return true;
  }

  var visible = false, placed = false;
  function pump() {
    if (!placed) placed = place();
    scan.classList.toggle("run", placed && visible && !document.hidden);
  }

  if (img.complete) place(); else img.addEventListener("load", function () { placed = place(); pump(); });
  placed = place();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      pump();
    }, { threshold: 0 }).observe(bed);
  } else {
    visible = true;
  }
  document.addEventListener("visibilitychange", pump);

  var t = 0;
  window.addEventListener("resize", function () {
    clearTimeout(t);
    t = setTimeout(function () { placed = place(); pump(); }, 120);
  }, { passive: true });

  pump();
})();

/* =========================================================================
   "What you get." — the slider

   WHAT THIS SCRIPT DOES NOT DO IS THE INTERESTING HALF. It runs no timer. The
   clock is the progress bar under the active label, which is a CSS animation on
   transform; when it finishes it fires `animationend` and this advances. So
   pausing is one class — the bar's `animation-play-state` goes to paused and
   the event simply never arrives — and while a slide is showing, the main
   thread does nothing at all. A setInterval would have cost a wakeup every
   frame-ish forever and would have had to be reconciled with hover, focus,
   touch, visibilitychange and the observer by hand.

   IT ALSO DOES NOT TOUCH THE MARKUP'S MEANING. The page ships four slides in a
   plain list with no `hidden` anywhere: with scripting off a reader gets all
   four, stacked, and the head is display:none because arrows that cannot move
   anything do not belong in the tab order. Everything below is behind the
   .is-slider class, and under prefers-reduced-motion the class is never added —
   that path keeps the 2x2 grid, which shows all four claims at once and asks
   for no interaction. See the note at 13d in the stylesheet.

   INERT IS THE FOCUS GUARD. Three of the four slides are off-screen inside an
   overflow:hidden stage, and an off-screen link is still tabbable — `inert` is
   what makes "you cannot tab into a slide you cannot see" true rather than
   merely styled. aria-live is set only while paused, per the carousel pattern:
   an auto-advancing region that announces every change is a screen-reader
   filibuster.
   ========================================================================= */
(function () {
  "use strict";
  var root = document.getElementById("gets-slider");
  if (!root) return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var rail = root.querySelector(".cin-slider-rail");
  var slides = [].slice.call(root.querySelectorAll(".cin-slide"));
  var tabs = [].slice.call(root.querySelectorAll(".cin-slider-tab"));
  var playBtn = root.querySelector("[data-play]");
  if (!rail || slides.length < 2 || tabs.length !== slides.length) return;

  var i = 0, userPaused = false, visible = false, held = false;

  /* Every reason to stop lands in one predicate, so the class, the bar and the
     live region can never disagree with each other: `held` is hover, focus or a
     finger on the stage, `userPaused` is the button, and the other two are the
     scene being off-screen or the tab being in the background. */
  function paused() { return userPaused || held || !visible || document.hidden; }

  function apply() {
    rail.style.setProperty("--i", i);
    for (var n = 0; n < slides.length; n++) {
      var on = n === i;
      if (on) slides[n].removeAttribute("inert"); else slides[n].setAttribute("inert", "");
      if (on) tabs[n].setAttribute("aria-current", "true"); else tabs[n].removeAttribute("aria-current");
    }
    root.classList.toggle("is-paused", paused());
    if (playBtn) playBtn.setAttribute("aria-label", userPaused ? "Start automatic slide rotation" : "Pause automatic slide rotation");
    /* announce only when nothing is moving on its own */
    if (paused()) rail.setAttribute("aria-live", "polite"); else rail.removeAttribute("aria-live");
  }

  function go(n, focusTab) {
    i = (n + slides.length) % slides.length;
    apply();
    /* restart the bar: removing and re-adding the attribute that selects it is
       not enough on its own, the animation has to be re-created */
    var bar = tabs[i].querySelector("i");
    if (bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
    if (focusTab) tabs[i].focus();
  }

  /* LAZY IS RIGHT UNTIL THE SCENE ARRIVES, AND WRONG THE MOMENT IT DOES. Three
     of the four slides sit outside an overflow:hidden stage, so the loader never
     considers them near the viewport and their pictures stay unfetched — they
     would pop in one by one as the reader advanced, and a gate that waits for
     every image to complete simply hangs (it did). So the four are lazy for the
     initial load, which is the point of lazy, and are promoted to eager the
     first time the scene comes into view, well before slide two is asked for. */
  var warmed = false;
  function warm() {
    if (warmed) return; warmed = true;
    var imgs = root.querySelectorAll("img[loading='lazy']");
    for (var n = 0; n < imgs.length; n++) imgs[n].loading = "eager";
  }

  root.classList.add("is-slider");
  apply();

  /* the clock */
  root.addEventListener("animationend", function (e) {
    if (e.animationName !== "cin-tabfill" || paused()) return;
    go(i + 1);
  });

  tabs.forEach(function (t, n) { t.addEventListener("click", function () { go(n); }); });
  var prev = root.querySelector("[data-prev]"), next = root.querySelector("[data-next]");
  if (prev) prev.addEventListener("click", function () { go(i - 1); });
  if (next) next.addEventListener("click", function () { go(i + 1); });
  if (playBtn) playBtn.addEventListener("click", function () { userPaused = !userPaused; apply(); if (!userPaused) go(i); });

  /* hover, focus and a finger on the stage all mean "the reader is reading this
     one", and all three resume by re-running the same predicate */
  function hold(on) { held = on; apply(); }
  root.addEventListener("pointerenter", function () { hold(true); });
  root.addEventListener("pointerleave", function () { hold(false); });
  root.addEventListener("focusin", function () { hold(true); });
  root.addEventListener("focusout", function () { if (!root.contains(document.activeElement)) hold(false); });
  document.addEventListener("visibilitychange", apply);

  root.addEventListener("keydown", function (e) {
    var k = e.key;
    if (k === "ArrowLeft") { go(i - 1, true); e.preventDefault(); }
    else if (k === "ArrowRight") { go(i + 1, true); e.preventDefault(); }
    else if (k === "Home") { go(0, true); e.preventDefault(); }
    else if (k === "End") { go(slides.length - 1, true); e.preventDefault(); }
  });

  /* swipe: horizontal intent only, so a vertical scroll that starts on the
     stage still scrolls the page */
  var x0 = 0, y0 = 0, down = false;
  var stage = root.querySelector(".cin-slider-stage");
  if (stage) {
    stage.addEventListener("pointerdown", function (e) { down = true; x0 = e.clientX; y0 = e.clientY; hold(true); }, { passive: true });
    stage.addEventListener("pointerup", function (e) {
      if (!down) return; down = false;
      var dx = e.clientX - x0, dy = e.clientY - y0;
      /* touch has no pointerleave, so a swipe that ends releases the hold; a
         mouse keeps it until the cursor actually leaves */
      if (e.pointerType !== "mouse") held = false;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy)) go(i + (dx < 0 ? 1 : -1)); else apply();
    }, { passive: true });
    stage.addEventListener("pointercancel", function () { down = false; held = false; apply(); }, { passive: true });
  }

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[entries.length - 1].isIntersecting;
      /* REWIND WHEN THE SCENE LEAVES. A reader who comes back to this section
         should meet the first claim, not whichever one the timer had reached —
         and it keeps the rail untranslated whenever the scene is off-screen,
         which is the state a contrast gate measures the page in. Measured
         before this: with the rail parked on slide two, the button's rect
         resolved to a position outside the clipped stage and the gate scored
         its arrow against the hero's picture, 2.91:1 for a control nobody can
         see. An invisible element should not be measurable at a stale place. */
      if (!visible && i !== 0) { i = 0; }
      apply();
      if (visible) { warm(); go(i); }
    }, { threshold: 0.25 }).observe(root);
  } else { visible = true; warm(); apply(); go(0); }
})();
