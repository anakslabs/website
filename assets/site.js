/* =========================================================================
   Anaks Labs — shared site script (dependency-free, IIFE)
   - i18n engine: a BASE dictionary (chrome: nav / footer) merged with each
     page's window.ANAKS_I18N (page-specific strings). Selected language is
     persisted to localStorage so it carries across every page. Korean is the
     default; English is used only after the visitor selects it.
   - year stamp, node-constellation canvas, home hero <video> injection,
     mobile nav toggle.
   ========================================================================= */
(function () {
  "use strict";

  /* ---------------- i18n ---------------- */
  var BASE = {
    en: {
      nav_products: "Products",
      nav_about: "About",
      nav_blog: "Blog",
      nav_contact: "Contact",
      menu: "Menu",
      skip: "Skip to content",
      footer_copy: "Anaks Labs",
      footer_home: "Home"
    },
    ko: {
      nav_products: "제품",
      nav_about: "회사 소개",
      nav_blog: "블로그",
      nav_contact: "문의",
      menu: "메뉴",
      skip: "본문으로 건너뛰기",
      footer_copy: "아낙스랩스",
      footer_home: "홈"
    }
  };

  function assign(a, b) {
    var out = {}, k;
    for (k in a) if (Object.prototype.hasOwnProperty.call(a, k)) out[k] = a[k];
    for (k in b) if (Object.prototype.hasOwnProperty.call(b, k)) out[k] = b[k];
    return out;
  }

  var PAGE = window.ANAKS_I18N || { en: {}, ko: {} };
  var DICT = {
    en: assign(BASE.en, PAGE.en || {}),
    ko: assign(BASE.ko, PAGE.ko || {})
  };

  var metaDesc = document.querySelector('meta[name="description"]');
  var ogTitle = document.querySelector('meta[property="og:title"]');
  var ogDesc = document.querySelector('meta[property="og:description"]');
  var twitterTitle = document.querySelector('meta[name="twitter:title"]');
  var twitterDesc = document.querySelector('meta[name="twitter:description"]');
  var btns = Array.prototype.slice.call(document.querySelectorAll(".lang button"));

  function apply(lang) {
    var d = DICT[lang] || DICT.ko;
    document.documentElement.lang = lang;
    if (d.title) document.title = d.title;
    if (metaDesc && d.metaDesc) metaDesc.setAttribute("content", d.metaDesc);
    if (ogTitle && d.title) ogTitle.setAttribute("content", d.title);
    if (ogDesc && d.metaDesc) ogDesc.setAttribute("content", d.metaDesc);
    if (twitterTitle && d.title) twitterTitle.setAttribute("content", d.title);
    if (twitterDesc && d.metaDesc) twitterDesc.setAttribute("content", d.metaDesc);

    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var v = d[el.getAttribute("data-i18n")];
      if (v != null) el.textContent = v;
    });
    document.querySelectorAll("[data-i18n-html]").forEach(function (el) {
      var v = d[el.getAttribute("data-i18n-html")];
      if (v != null) el.innerHTML = v;
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (el) {
      var v = d[el.getAttribute("data-i18n-aria")];
      if (v != null) el.setAttribute("aria-label", v);
    });

    btns.forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.lang === lang)); });
    try { localStorage.setItem("anaks_lang_v2", lang); } catch (e) {}
  }

  var saved;
  try { saved = localStorage.getItem("anaks_lang_v2"); } catch (e) {}
  var initial = saved === "en" ? "en" : "ko";
  apply(initial);
  btns.forEach(function (b) { b.addEventListener("click", function () { apply(b.dataset.lang); }); });

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

  /* ---- hero background video: 데스크톱 + 모션허용일 때만 <video> 주입 (home only) ---- */
  (function () {
    var el = document.querySelector(".hero-video");
    if (!el) return;
    var mReduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)");
    var mMobile = window.matchMedia && window.matchMedia("(max-width: 767px)");
    /* reduced-motion 또는 모바일(<768px): 영상 미로드 — .hero-video의 poster 배경만 표시(셀룰러 데이터 보호) */
    if ((mReduce && mReduce.matches) || (mMobile && mMobile.matches)) return;

    var v = document.createElement("video");
    v.muted = true; v.setAttribute("muted", "");
    v.autoplay = true; v.loop = true;
    v.playsInline = true; v.setAttribute("playsinline", "");
    v.preload = "metadata";
    v.setAttribute("poster", "/assets/hero-poster.webp");
    var webm = document.createElement("source"); webm.src = "/assets/hero-video.webm"; webm.type = "video/webm";
    var mp4 = document.createElement("source"); mp4.src = "/assets/hero-video.mp4"; mp4.type = "video/mp4";
    v.appendChild(webm); v.appendChild(mp4);
    /* 로드/재생 실패 → video 제거, .hero-video의 poster 배경으로 폴백 */
    v.addEventListener("error", function () { if (v.parentNode) v.parentNode.removeChild(v); });
    el.appendChild(v);

    var play = function () { var p = v.play && v.play(); if (p && p.catch) p.catch(function () {}); };
    play();
    /* 뷰포트 밖이면 정지, 복귀 시 재생 (표준 처리 — 히어로는 fixed라 상시 재생) */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) play(); else if (v.pause) v.pause(); });
      }, { threshold: 0.01 }).observe(el);
    }
  })();
})();
