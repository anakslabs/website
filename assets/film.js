/* Section-cued film: nine transitions between ten held keyframes.
 *
 * One <video> per transition rather than one file seeked to nine ranges.
 * Seeking a single source means landing on a keyframe boundary the encoder
 * chose, so a cue either stalls or starts a few frames off, and no amount of
 * -g tuning makes currentTime exact across browsers. Nine files also mean
 * nine independent preloads and — the part that matters here — a mobile
 * viewport that fetches none of them, because the elements are never created.
 *
 * The stills are always present underneath. Video is decoration laid on top
 * of a page that is already complete: no JS, reduced motion, a narrow
 * viewport, or a decode failure all leave the same static keyframes, and the
 * copy never depends on either.
 */
(function () {
  'use strict';

  var VIDEO_MIN_WIDTH = 1280;
  // Derived from the page, not fixed at ten. The home page lost sections when
  // its sales copy moved to /clinics/, and a constant here would have kept
  // requesting transitions into screens that no longer exist.
  var SECTIONS = 0;

  var stage = document.querySelector('[data-film]');
  if (!stage) return;

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var wide = window.matchMedia('(min-width: ' + VIDEO_MIN_WIDTH + 'px)');
  var stills = [].slice.call(stage.querySelectorAll('[data-still]'));
  SECTIONS = stills.length;
  var clips = [];
  var current = 0;
  var playing = null;

  function showStill(i) {
    for (var n = 0; n < stills.length; n++) {
      stills[n].classList.toggle('is-on', n === i);
    }
  }

  /** Video is built only when it will actually be used — never fetched otherwise. */
  function buildClips() {
    if (clips.length || !wide.matches || reduced.matches) return;
    for (var i = 0; i < SECTIONS - 1; i++) {
      // The clip for this step is named on the still, because the screens do
      // not map onto consecutive keyframes: two of the ten states belong to
      // sections that now live on /clinics/, and the jumps across them have no
      // clip. A missing name means crossfade, not a 404.
      var name = stills[i].getAttribute('data-next');
      if (!name) { clips.push(null); continue; }
      var v = document.createElement('video');
      v.className = 'film-clip';
      v.src = '/assets/film/' + name + '.mp4';
      v.muted = true;
      v.playsInline = true;
      v.preload = 'none';          // the browser fetches on the first play(), not on load
      v.setAttribute('aria-hidden', 'true');
      v.tabIndex = -1;
      stage.appendChild(v);
      clips.push(v);
    }
  }

  function stopPlaying() {
    if (!playing) return;
    playing.pause();
    playing.classList.remove('is-on');
    playing = null;
  }

  /**
   * Forward runs the clip; backward crossfades the stills.
   *
   * Playing a clip in reverse means seeking backwards frame by frame, which
   * decodes the whole GOP for every step and drops to single-digit frame
   * rates. A crossfade is not the same gesture, but it is a deliberate one
   * rather than a stutter, and scrolling back up is not the path the film
   * was made for.
   */
  function goTo(next) {
    if (next === current || next < 0 || next >= SECTIONS) return;
    var forward = next === current + 1;
    stopPlaying();

    if (!forward || !clips.length) {
      current = next;
      showStill(next);
      return;
    }

    var clip = clips[current];
    current = next;
    if (!clip) { showStill(next); return; }

    var done = function () {
      clip.removeEventListener('ended', done);
      showStill(next);              // land on the keyframe the clip ends on
      if (playing === clip) { clip.classList.remove('is-on'); playing = null; }
    };
    clip.addEventListener('ended', done);
    clip.currentTime = 0;
    clip.classList.add('is-on');
    playing = clip;

    var attempt = clip.play();
    if (attempt && attempt.catch) {
      // Autoplay refused, codec missing, file 404 — the still is already
      // correct underneath, so failure costs nothing but the motion.
      attempt.catch(function () { done(); });
    }
  }

  // Native scroll-snap does the scrolling; this only observes which screen won.
  var screens = [].slice.call(document.querySelectorAll('[data-film-section]'));
  if ('IntersectionObserver' in window && screens.length) {
    var io = new IntersectionObserver(function (entries) {
      var best = null;
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        if (!best || entries[i].intersectionRatio > best.intersectionRatio) best = entries[i];
      }
      if (!best) return;
      var idx = screens.indexOf(best.target);
      if (idx >= 0) goTo(idx);
    }, { threshold: [0.5, 0.75] });
    for (var s = 0; s < screens.length; s++) io.observe(screens[s]);
  }

  function apply() {
    if (wide.matches && !reduced.matches) {
      buildClips();
    } else {
      stopPlaying();
      for (var i = 0; i < clips.length; i++) {
        clips[i].removeAttribute('src');
        clips[i].remove();
      }
      clips.length = 0;
    }
    showStill(current);
  }

  (wide.addEventListener ? wide.addEventListener.bind(wide, 'change')
    : wide.addListener.bind(wide))(apply);
  (reduced.addEventListener ? reduced.addEventListener.bind(reduced, 'change')
    : reduced.addListener.bind(reduced))(apply);

  // current is already 0 and the markup already marks it, so this only
  // re-asserts what CSS is showing — it never blanks the page on the way in.
  showStill(current);
  apply();
})();
