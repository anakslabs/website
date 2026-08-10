/* =========================================================================
   Anaks Labs — scroll cues

   The part of the WebGL work that outlives it. This reads where the reader
   is and turns it into cues; it knows nothing about what draws. It drove a
   camera before and it will drive a video element next, and the reason it
   can is that it never touched one.

   Three things it provides:

     stations   which section the reader is in, and how far through it
     progress   a smoothed copy of that, first-order and overshoot-free
     cues       enter, settle and leave, fired once each per crossing

   Two rules it keeps, both carried over intact:

     the scroll belongs to the browser. Nothing here calls scrollTo,
     preventDefault, or a wheel handler. Native snap is allowed — it is the
     browser's own scrolling — but this file never moves the page.

     nothing has a clock. The smoothing loop runs only while there is
     distance left to close and stops when there is not, so a page nobody
     is touching schedules no frames at all.

   Turn this file off and the page is an ordinary document.
   ========================================================================= */
(function () {
  "use strict";

  var TAU = 0.19;          /* seconds; the follow constant, unchanged      */
  var SETTLE = 0.0004;     /* below this it has arrived                    */
  var IDLE_MS = 140;       /* fallback for browsers without scrollend      */

  var sections = [];
  var bounds = [];
  var listeners = { enter: [], settle: [], leave: [], progress: [], transition: [] };

  var target = { i: 0, p: 0 };
  var state = { i: 0, p: 0 };
  var current = -1;
  var settled = true;
  var queued = false;
  var lastT = 0;
  var idleTimer = null;

  var reduce = window.matchMedia
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function on(name, fn) { if (listeners[name]) listeners[name].push(fn); return api; }
  function emit(name, a, b) {
    var l = listeners[name];
    for (var i = 0; i < l.length; i++) { try { l[i](a, b); } catch (e) { /* a bad listener is not the page's problem */ } }
  }

  /* Where each station starts, in document coordinates. Measured, never
     assumed, and re-measured whenever the layout could have moved. */
  function measure() {
    var top = window.scrollY;
    bounds = sections.map(function (el, i) {
      if (i === 0) return 0;
      var head = el.querySelector(".lp-head") || el;
      var at = head.getBoundingClientRect().top + top - window.innerHeight * 0.55;
      return at < 0 ? 0 : at;
    });
    for (var i = 1; i < bounds.length; i++) {
      if (bounds[i] <= bounds[i - 1]) bounds[i] = bounds[i - 1] + 1;
    }
  }

  function locate(scroll) {
    if (!bounds.length) return { i: 0, p: 0 };
    for (var i = bounds.length - 1; i >= 0; i--) {
      if (scroll >= bounds[i]) {
        var from = bounds[i];
        var to = i + 1 < bounds.length ? bounds[i + 1] : from + Math.max(600, window.innerHeight);
        var p = (scroll - from) / (to - from);
        return { i: i, p: p < 0 ? 0 : p > 1 ? 1 : p };
      }
    }
    return { i: 0, p: 0 };
  }

  /* First-order approach: monotone, so it cannot overshoot, and there is no
     damping term to get wrong. Station and progress are smoothed as one
     continuous number so a crossing does not jolt. */
  function approach(cur, to, dt) { return cur + (to - cur) * (1 - Math.exp(-dt / TAU)); }

  function step() {
    queued = false;
    if (document.hidden) { lastT = 0; return; }
    var now = performance.now();
    var dt = lastT ? (now - lastT) / 1000 : 1 / 60;
    if (dt > 0.1) dt = 0.1;      /* coming back from a hidden tab must not jump */
    lastT = now;

    var loc = locate(window.scrollY);
    target.i = loc.i; target.p = loc.p;

    var want = target.i + target.p;
    var have = state.i + state.p;
    have = reduce ? want : approach(have, want, dt);
    var done = Math.abs(want - have) < SETTLE;
    if (done) have = want;

    state.i = Math.min(sections.length - 1, Math.floor(have));
    state.p = Math.min(1, Math.max(0, have - state.i));

    if (state.i !== current) {
      var from = current;
      current = state.i;
      if (from >= 0) emit("leave", from, sections[from]);
      emit("enter", current, sections[current]);
      emit("transition", from, current);
    }
    emit("progress", state.i, state.p);

    settled = done;
    if (!settled) schedule();
    else emit("settle", state.i, state.p);
  }

  function schedule() {
    if (queued || document.hidden) return;
    queued = true;
    requestAnimationFrame(step);
  }

  function nudge() {
    settled = false;
    schedule();
    /* scrollend is the honest signal that native snap has finished; where
       it is missing, a quiet period stands in for it */
    if (!("onscrollend" in window)) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () { emit("settle", state.i, state.p); }, IDLE_MS);
    }
  }

  var api = {
    on: on,
    /* what a player needs to ask, without knowing anything about this file */
    station: function () { return state.i; },
    progress: function () { return state.p; },
    settled: function () { return settled; },
    sections: function () { return sections.slice(); },
    bounds: function () { return bounds.slice(); },
    remeasure: function () { measure(); nudge(); },
    /* the scroll offset a given station begins at, for a player that wants
       to know how much room a transition has */
    offsetOf: function (i) { return bounds[i]; },
  };

  function init() {
    sections = Array.prototype.slice.call(
      document.querySelectorAll("[data-cue-station]")
    );
    if (!sections.length) {
      sections = Array.prototype.slice.call(document.querySelectorAll(".lp-section"));
    }
    if (!sections.length) return;

    measure();
    var loc = locate(window.scrollY);
    state.i = loc.i; state.p = loc.p; current = state.i;
    settled = true;

    window.addEventListener("scroll", nudge, { passive: true });
    if ("onscrollend" in window) {
      window.addEventListener("scrollend", function () { emit("settle", state.i, state.p); }, { passive: true });
    }
    window.addEventListener("resize", function () { measure(); nudge(); });
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) { lastT = 0; nudge(); }
    });
    emit("enter", current, sections[current]);
  }

  window.AnaksCues = api;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
