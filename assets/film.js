/* Scroll-scrub film. Each clip is the transformation INTO its section: as the
   section scrolls into view its video's currentTime is pinned to how far it
   has entered, so the object moves exactly as much as the visitor scrolls —
   stop scrolling and it freezes, arrive and the transformation is complete,
   landing on the very frame the section's still was cut from. Nothing plays
   on its own.

   Progressive enhancement over the CSS stills: with this file absent, blocked
   or unloaded, every section simply holds its keyframe. Clips are all-intra
   encodes (every frame seekable), fetched only above 1280px, only without
   reduced-motion, and only once their section is within a viewport of
   arriving. */
(function () {
  "use strict";

  if (!window.matchMedia("(min-width: 1280px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  var screens = [].slice.call(document.querySelectorAll(".film-screen[data-clip]"));
  if (!screens.length) return;

  var items = [];
  screens.forEach(function (sec) {
    var host = sec.querySelector(".film-bg");
    if (!host) return;
    var v = document.createElement("video");
    v.muted = true;
    v.setAttribute("muted", "");
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.preload = "none";
    v.src = sec.getAttribute("data-clip");
    v.className = "film-scrub";
    host.appendChild(v);
    items.push({ sec: sec, video: v, ready: false });
  });

  items.forEach(function (it) {
    it.video.addEventListener("loadeddata", function () {
      it.ready = true;
      it.video.classList.add("is-ready");
      schedule();
    });
    it.video.addEventListener("seeked", function () {
      schedule();
    });
    it.video.addEventListener("error", function () {
      /* Broken clip ⇒ drop back to the still underneath. */
      it.ready = false;
      it.video.classList.remove("is-ready");
    });
  });

  /* Fetch a clip only when its section is within one viewport of arriving. */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      for (var i = 0; i < items.length; i++) {
        if (items[i].sec === e.target) {
          items[i].video.preload = "auto";
          items[i].video.load();
          break;
        }
      }
      io.unobserve(e.target);
    });
  }, { rootMargin: "100% 0px" });
  items.forEach(function (it) { io.observe(it.sec); });

  /* 0 while the section is still below the viewport, 1 once its top reaches
     the top of the viewport — which is where scroll-snap comes to rest. */
  function progress(sec) {
    var vh = window.innerHeight || 1;
    var top = sec.getBoundingClientRect().top;
    return Math.min(1, Math.max(0, (vh - top) / vh));
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(render);
  }
  function render() {
    queued = false;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var v = it.video;
      /* v.seeking is the browser's own pending-seek state — a manual flag
         deadlocks, because seeking to the time the video is already at never
         fires "seeked". currentTime is likewise read back from the element
         rather than cached, so a no-op seek is skipped instead of issued. */
      if (!it.ready || v.seeking) continue;
      var d = v.duration;
      if (!d) continue;
      /* duration itself can resolve to a blank frame; stay a hair inside. */
      var t = progress(it.sec) * (d - 0.05);
      if (Math.abs(t - v.currentTime) < 0.02) continue;
      v.currentTime = t;
    }
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
})();
