/* =========================================================================
   Anaks Labs — shared site script (dependency-free, IIFE)
   Year stamp, mobile nav toggle, node-constellation canvas, scroll reveal.

   The KO/EN i18n engine was removed when the site became English-only. The
   one page that is still Korean — the statutory public notice board at
   /blog/ — is served as static Korean markup and needs no runtime switching.
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
      if (!still && !reduce) requestAnimationFrame(function () { step(false); });
    }
    var rt;
    window.addEventListener("resize", function () { clearTimeout(rt); rt = setTimeout(resize, 180); });
    resize();
    if (!reduce) step(false);
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
    els.forEach(function (el) { io.observe(el); });
  })();
})();
