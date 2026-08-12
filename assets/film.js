/* The film, v3: one object on a fixed stage, scrubbed by scroll.
   Every section carries data-film-key naming the still that IS that section's
   state; sections that also carry data-clip own the transformation INTO
   themselves. As a section enters the viewport its clip's currentTime is
   pinned (through a short lerp, so wheel steps read as motion instead of
   jumps) to how far it has entered: scroll and the object transforms, stop
   and it freezes, arrive and it rests on the still the next hold shows.
   Sections without a clip crossfade between their stills instead.

   Progressive enhancement: the stage's stills are plain markup with the
   first marked is-on, so with no JS the object still stands. Clips are
   fetched only above 1280px, without reduced-motion, and only once their
   section is within a viewport of arriving. */
(function () {
  "use strict";

  if (!window.matchMedia("(min-width: 1280px)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!("IntersectionObserver" in window)) return;

  var stage = document.querySelector("[data-film-stage]");
  if (!stage) return;
  var screens = [].slice.call(document.querySelectorAll(".film-screen[data-film-key]"));
  if (screens.length < 2) return;

  var stillByKey = {};
  [].slice.call(stage.querySelectorAll(".film-still")).forEach(function (img) {
    stillByKey[img.getAttribute("data-key")] = img;
  });

  /* beats[i] = one held state; beats[i].clip transforms beat i-1 → i. */
  var beats = screens.map(function (sec) {
    var key = sec.getAttribute("data-film-key");
    var beat = { sec: sec, key: key, still: stillByKey[key] || null, video: null, ready: false, shown: -1 };
    var clip = sec.getAttribute("data-clip");
    if (clip) {
      var v = document.createElement("video");
      v.muted = true;
      v.setAttribute("muted", "");
      v.playsInline = true;
      v.setAttribute("playsinline", "");
      v.preload = "none";
      v.src = clip;
      v.className = "film-scrub";
      stage.appendChild(v);
      beat.video = v;
      v.addEventListener("loadeddata", function () { beat.ready = true; schedule(); });
      v.addEventListener("seeked", schedule);
      v.addEventListener("error", function () { beat.ready = false; });
    }
    return beat;
  });

  /* Fetch a clip only when its section is within one viewport of arriving. */
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      for (var i = 0; i < beats.length; i++) {
        if (beats[i].sec === entry.target && beats[i].video) {
          beats[i].video.preload = "auto";
          beats[i].video.load();
          break;
        }
      }
      io.unobserve(entry.target);
    });
  }, { rootMargin: "100% 0px" });
  beats.forEach(function (beat) { if (beat.video) io.observe(beat.sec); });

  /* 0 while the section is below the viewport, 1 once its top reaches the
     top — where scroll-snap rests. This is the object's transformation
     progress into that section's state. */
  function progress(sec) {
    var vh = window.innerHeight || 1;
    var top = sec.getBoundingClientRect().top;
    return Math.min(1, Math.max(0, (vh - top) / vh));
  }

  /* The scrub follows the scroll through a short lerp: a single wheel step
     becomes a beat of visible motion that settles in ~a third of a second,
     still lands exactly, and never moves unless the scroll moved first. */
  var eased = null;
  var raf = 0;

  function render() {
    raf = 0;
    var ps = beats.map(function (beat) { return progress(beat.sec); });
    /* The deepest section that has started entering owns the moment; its
       progress is the transformation out of the beat before it. The hero is
       beat 0 and transforms from nothing, so alone it holds at 0. */
    var active = 0;
    for (var i = 1; i < beats.length; i++) if (ps[i] > 0) active = i;
    var target = active === 0 ? 0 : (active - 1) + Math.min(ps[active], 1);
    /* A section resting a border-width shy of the top is a held beat, not a
       transformation stuck at 99% — quantise the last half-percent away. */
    if (Math.abs(target - Math.round(target)) < 0.005) target = Math.round(target);
    if (eased === null) eased = target;
    var delta = target - eased;
    eased = Math.abs(delta) < 0.004 ? target : eased + delta * 0.22;

    /* eased sits between beat idx (frac 0) and beat idx+1 (frac 1); at an
       integer — including arrival, where the lerp snaps — beat idx is fully
       held and no transition layer stays up. */
    var idx = Math.max(0, Math.min(beats.length - 1, Math.floor(eased + 1e-9)));
    var frac = Math.min(1, Math.max(0, eased - idx));
    if (frac < 1e-3) frac = 0;
    var entering = frac > 0 && idx + 1 < beats.length ? idx + 1 : null;

    for (var b = 0; b < beats.length; b++) {
      var beat = beats[b];
      var wantStill = false;
      var wantVideo = false;
      var videoTime = 0;
      if (entering === null) {
        wantStill = b === idx;
      } else {
        var into = beats[entering];
        if (into.video && into.ready) {
          /* Scrubbed transformation: the clip shows the in-between, with the
             departing still kept under it against paint gaps. */
          wantVideo = b === entering;
          wantStill = b === idx;
          videoTime = frac;
        } else {
          /* No clip (or not yet loaded): crossfade the two stills. */
          wantStill = b === idx || (b === entering && frac > 0.5);
        }
      }
      if (beat.still) beat.still.classList.toggle("is-on", wantStill);
      if (beat.video) {
        beat.video.classList.toggle("is-on", wantVideo);
        if (wantVideo && !beat.video.seeking) {
          var d = beat.video.duration;
          if (d) {
            var t = videoTime * (d - 0.05);
            if (Math.abs(t - beat.video.currentTime) >= 0.02) beat.video.currentTime = t;
          }
        }
      }
    }

    if (eased !== target) schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(render);
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  schedule();
})();
