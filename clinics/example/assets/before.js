/* =========================================================================
   Specimen Dental — "before" build, slider script.

   This is the pattern, reproduced: the service copy lives in a JavaScript
   array and is written into the page after it loads. A visitor swipes through
   six services. The HTML that leaves the server contains an empty <div>.
   ========================================================================= */
(function () {
  "use strict";

  var SLIDES = [
    {
      title: "Check-ups and cleaning",
      body: "A full examination, a scale and polish, and a written plan for anything we find. Most visits take about forty minutes."
    },
    {
      title: "Fillings and crowns",
      body: "Tooth-coloured fillings placed in a single visit. Crowns are milled to shape and fitted the same week."
    },
    {
      title: "Root canal treatment",
      body: "Carried out under local anaesthetic, usually across two appointments. We book them long so nothing is rushed."
    },
    {
      title: "Whitening",
      body: "A fitted tray and gel you take home, with a check-in after the first week to make sure the shade is going where you want it."
    },
    {
      title: "Implants",
      body: "Planned from a 3D scan, placed in the practice, and restored once the site has healed. We talk through the whole timeline first."
    },
    {
      title: "Emergency visits",
      body: "Pain, a lost filling or a broken tooth. We keep slots free every weekday and on Saturday mornings for exactly this."
    }
  ];

  var carousel = document.getElementById("services-carousel");
  if (!carousel) return;

  var track = carousel.querySelector(".track");
  var dots = carousel.querySelector(".dots");
  var index = 0;

  SLIDES.forEach(function (s, i) {
    var slide = document.createElement("div");
    slide.className = "slide";
    var h = document.createElement("h3");
    h.textContent = s.title;
    var p = document.createElement("p");
    p.textContent = s.body;
    slide.appendChild(h);
    slide.appendChild(p);
    track.appendChild(slide);

    var dot = document.createElement("button");
    dot.type = "button";
    dot.setAttribute("aria-label", "Service " + (i + 1));
    dot.addEventListener("click", function () { go(i); });
    dots.appendChild(dot);
  });

  function go(i) {
    index = (i + SLIDES.length) % SLIDES.length;
    track.style.transform = "translateX(" + (-100 * index) + "%)";
    Array.prototype.forEach.call(dots.children, function (d, n) {
      d.setAttribute("aria-current", String(n === index));
    });
  }

  carousel.querySelector(".prev").addEventListener("click", function () { go(index - 1); });
  carousel.querySelector(".next").addEventListener("click", function () { go(index + 1); });
  go(0);
})();
