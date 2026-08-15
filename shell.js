/* ==========================================================================
   Policy Fit Checker: shared site chrome (header, fullscreen menu, cursor,
   sound/scroll-top controls, footer). Injected on every page so the nav
   lives in one place. The current page is highlighted from the URL.
   ========================================================================== */
(function () {
  "use strict";

  var current = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  var PAGES = [
    { href: "index.html", label: "Home" },
    { href: "about.html", label: "About" },
    { href: "education.html", label: "Education" },
    { href: "cover.html", label: "Cover List" },
    { href: "providers.html", label: "Providers" },
    { href: "how.html", label: "How it works" },
    { href: "chat.html", label: "Chat" },
    { href: "mobile.html", label: "Mobile" },
    { href: "match.html", label: "Find your fit" }
  ];

  function isActive(href) {
    return current === href || (href === "index.html" && current === "");
  }

  function navLinks(cls) {
    return PAGES.map(function (p) {
      return '<a href="' + p.href + '" class="' + cls + '"' + (isActive(p.href) ? ' aria-current="page"' : "") + ">" + p.label + "</a>";
    }).join("");
  }

  var cursor =
    '<div class="cursor" id="cursor" aria-hidden="true">' +
      '<div class="cursor-dot"></div><div class="cursor-ring"></div>' +
    "</div>";

  var buttons =
    '<div class="buttons-container" aria-label="Page controls">' +
      '<button type="button" class="page-btn sound-btn" id="soundBtn" aria-pressed="false" aria-label="Toggle ambient sound">' +
        '<canvas id="soundCanvas" width="28" height="28" aria-hidden="true"></canvas>' +
        '<span class="sound-label" aria-hidden="true">sound</span>' +
      "</button>" +
      '<button type="button" class="page-btn" id="scrollTop" aria-label="Back to top">' +
        '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
      "</button>" +
    "</div>";

  var header =
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<header class="site-header">' +
      '<a class="wordmark" href="index.html" aria-label="Policy Fit Checker home">' +
        '<span class="wordmark-mark">PFC</span><span>Policy Fit Checker</span>' +
      "</a>" +
      '<nav class="site-nav" aria-label="Primary">' +
        navLinks("nav-link") +
        '<a class="nav-cta" href="match.html">Find your fit</a>' +
      "</nav>" +
      '<button type="button" class="menu-cta" id="menuCta" aria-expanded="false" aria-controls="siteMenu" aria-label="Open menu">' +
        '<span class="menu-cta-text">Menu</span>' +
        '<span class="dots-w" aria-hidden="true"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>' +
      "</button>" +
    "</header>" +
    '<div class="site-menu" id="siteMenu" aria-hidden="true">' +
      '<div class="menu-grid">' +
        '<nav class="menu-links" aria-label="Menu">' +
          PAGES.map(function (p, i) {
            var n = (i + 1) < 10 ? "0" + (i + 1) : String(i + 1);
            return '<a class="menu-link" href="' + p.href + '"><span>' + n + "</span>" + p.label + "</a>";
          }).join("") +
        "</nav>" +
        '<div class="menu-terms">' +
          '<a href="#contact">Contact</a>' +
          '<a href="principles.html">Principles</a>' +
          '<a href="https://github.com/Mimi-obodo/policy-fit-checker" rel="noopener">Source</a>' +
          '<a href="match.html" class="menu-cta-link">Find your fit</a>' +
        "</div>" +
      "</div>" +
    "</div>";

  var footer =
    '<footer class="site-footer" id="contact">' +
      '<nav class="footer-nav" aria-label="Footer">' +
        navLinks("footer-link") +
      "</nav>" +
      "<p>Policy Fit Checker: five-agent pipeline, live Google Sheets catalog, static GitHub Pages.</p>" +
      '<p class="footer-meta">PFC is a fictional company built for an academic project. No real insurance is sold, and no real financial advice is given.</p>' +
      '<p class="footer-meta"><a href="https://github.com/Mimi-obodo/policy-fit-checker" rel="noopener">github.com/Mimi-obodo/policy-fit-checker</a> &middot; <a href="mailto:hello@pfc.example">hello@pfc.example</a> (placeholder)</p>' +
      '<p class="footer-meta">No secrets here. Everything this page needs is fetched client-side at the moment of use.</p>' +
    "</footer>";

  var loader =
    '<div class="loader" id="loader" aria-hidden="true">' +
      '<div class="loader-word">Policy <b>Fit</b> Checker</div>' +
      '<div class="loader-count" id="loaderCount">00</div>' +
      '<div class="loader-bar" aria-hidden="true"><span id="loaderBar"></span></div>' +
    "</div>";

  function inject() {
    var b = document.body;
    if (!b) return;
    b.insertAdjacentHTML("afterbegin", loader + cursor + header + buttons);
    b.insertAdjacentHTML("beforeend", footer);
    var main = document.querySelector("main");
    if (main) main.setAttribute("id", "main");
  }

  inject();
})();
