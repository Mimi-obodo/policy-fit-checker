/* ============================================================
   POLICY FIT CHECKER — Premium Edition
   Cinematic full-screen hero, theme, menu, reveals.
   ============================================================ */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var fine = window.matchMedia("(pointer: fine)").matches;

  /* ---------- theme ---------- */
  var themeBtn = document.getElementById("themeToggle");
  function setTheme(t, save) {
    document.documentElement.setAttribute("data-theme", t);
    if (save) { try { localStorage.setItem("pfc-theme", t); } catch (e) {} }
  }
  try {
    var stored = localStorage.getItem("pfc-theme");
    if (stored === "light" || stored === "dark") { setTheme(stored, false); }
  } catch (e) {}
  if (themeBtn) {
    themeBtn.setAttribute("aria-label", "Toggle colour theme");
    themeBtn.addEventListener("click", function () {
      var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
      setTheme(next, true);
    });
  }

  /* ---------- fullscreen menu ---------- */
  var menuBtn = document.getElementById("menuBtn");
  var overlay = document.getElementById("menuOverlay");
  function setMenu(open) {
    var on = typeof open === "boolean" ? open : !overlay.classList.contains("is-open");
    overlay.classList.toggle("is-open", on);
    menuBtn.classList.toggle("is-open", on);
    document.body.style.overflow = on ? "hidden" : "";
  }
  if (menuBtn && overlay) {
    menuBtn.addEventListener("click", function () { setMenu(); });
    overlay.addEventListener("click", function (e) {
      if (e.target.closest("a")) { setMenu(false); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && overlay.classList.contains("is-open")) { setMenu(false); }
    });
  }

  /* ---------- header scroll state ---------- */
  var header = document.getElementById("siteHeader");
  function onScroll() {
    if (header) { header.classList.toggle("scrolled", (window.scrollY || 0) > 20); }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---------- scroll cue -> scrolls the page down (instant) ---------- */
  var cue = document.getElementById("scrollCue");
  if (cue && !reduced) {
    cue.addEventListener("click", function (e) {
      e.preventDefault();
      var target = document.querySelector(cue.getAttribute("href"));
      if (target) { window.scrollTo(0, Math.max(0, target.getBoundingClientRect().top + window.pageYOffset)); }
    });
  }

  /* ---------- reveal on scroll ---------- */
  var reveals = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---------- custom cursor ---------- */
  if (fine && !reduced) {
    var dot = document.createElement("div");
    var ring = document.createElement("div");
    dot.className = "cursor-dot";
    ring.className = "cursor-ring";
    document.body.appendChild(dot);
    document.body.appendChild(ring);
    var mx = 0, my = 0, rx = 0, ry = 0;
    document.addEventListener("mousemove", function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.left = mx - 3 + "px";
      dot.style.top = my - 3 + "px";
      dot.style.opacity = 1;
      ring.style.opacity = 1;
    });
    (function loop() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = "translate(" + (rx - 17) + "px," + (ry - 17) + "px)";
      requestAnimationFrame(loop);
    })();
    document.addEventListener("mouseover", function (e) {
      if (e.target.closest("a, button, .agent-card, [data-hover]")) { ring.classList.add("is-active"); }
    });
    document.addEventListener("mouseout", function (e) {
      if (e.target.closest("a, button, .agent-card, [data-hover]")) { ring.classList.remove("is-active"); }
    });
    document.addEventListener("mouseleave", function () {
      dot.style.opacity = 0; ring.style.opacity = 0;
    });
  }

  /* ---------- cinematic hero canvas (full-bleed, subtle) ---------- */
  var canvas = document.getElementById("heroCanvas");
  if (canvas && !reduced) {
    var ctx = canvas.getContext("2d");
    var DPR = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0;

    var orbs = [
      { x: 0.22, y: 0.30, r: 0.5, c: [11, 60, 133], a: 0.22, dx: 0.0016, dy: 0.0011 },
      { x: 0.78, y: 0.62, r: 0.6, c: [31, 84, 170], a: 0.16, dx: -0.0012, dy: 0.0014 },
      { x: 0.55, y: 0.15, r: 0.42, c: [18, 84, 180], a: 0.13, dx: 0.0009, dy: -0.0015 }
    ];
    var parts = [];
    var count = 0;

    function resize() {
      var rect = canvas.parentElement.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = Math.round(w * DPR);
      canvas.height = Math.round(h * DPR);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      count = Math.min(150, Math.floor((w * h) / 14000));
      parts = [];
      for (var i = 0; i < count; i++) {
        parts.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.22,
          vy: (Math.random() - 0.5) * 0.22,
          r: Math.random() * 1.5 + 0.6,
          o: Math.random() * 0.5 + 0.15
        });
      }
    }

    var t = 0;
    function draw() {
      t += 0.0016;
      ctx.clearRect(0, 0, w, h);

      orbs.forEach(function (o) {
        o.x += o.dx; o.y += o.dy;
        if (o.x < -0.2) o.x = 1.2; if (o.x > 1.2) o.x = -0.2;
        if (o.y < -0.2) o.y = 1.2; if (o.y > 1.2) o.y = -0.2;
        var ox = o.x * w, oy = o.y * h, rad = o.r * Math.min(w, h);
        var g = ctx.createRadialGradient(ox, oy, 0, ox, oy, rad);
        g.addColorStop(0, "rgba(" + o.c[0] + "," + o.c[1] + "," + o.c[2] + "," + o.a + ")");
        g.addColorStop(1, "rgba(" + o.c[0] + "," + o.c[1] + "," + o.c[2] + ",0)");
        ctx.fillStyle = g;
        ctx.fillRect(ox - rad, oy - rad, rad * 2, rad * 2);
      });

      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(11,60,133,0.16)";
      ctx.lineWidth = 0.6;
      for (var i = 0; i < count; i++) {
        var p = parts[i];
        var ang = Math.sin(p.y * 0.0022 + t * 2.1) * 0.5 + Math.cos(p.x * 0.0019 - t * 1.7) * 0.5;
        p.vx += Math.cos(ang) * 0.006;
        p.vy += Math.sin(ang) * 0.006;
        p.vx = Math.max(-0.35, Math.min(0.35, p.vx));
        p.vy = Math.max(-0.35, Math.min(0.35, p.vy));
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;

        for (var j = i + 1; j < count; j++) {
          var q = parts[j];
          var dx = p.x - q.x, dy = p.y - q.y;
          var d2 = dx * dx + dy * dy;
          if (d2 < 3600) {
            var a = 1 - d2 / 3600;
            ctx.globalAlpha = a * 0.16;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = p.o;
        ctx.fillStyle = "rgba(163,178,205,0.9)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(draw);
    }

    resize();
    draw();
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 200);
    });
  } else if (canvas) {
    var g2 = canvas.getContext("2d");
    var g = g2.createLinearGradient(0, 0, 0, canvas.parentElement.clientHeight);
    g.addColorStop(0, "#0B1220");
    g.addColorStop(1, "#0D1117");
    g2.fillStyle = g;
    g2.fillRect(0, 0, canvas.width, canvas.height);
  }
})();
