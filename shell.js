/* ==========================================================================
   Policy Fit Checker: shared site chrome (header, fullscreen menu, cursor,
   sound/scroll-top controls, footer). Injected on every page so the nav
   lives in one place. The current page is highlighted from the URL.
   ========================================================================== */
(function () {
  "use strict";

  /* Theme (dark default / light), applied before first paint to avoid a flash */
  var savedTheme = null;
  try { savedTheme = localStorage.getItem("pfc-theme"); } catch (e) {}
  var theme = savedTheme === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);

  var current = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  var PAGES = [
    { href: "index.html", label: "Home", sub: "Are you insured?" },
    { href: "home.html", label: "Explore", sub: "Browse policies" },
    { href: "about.html", label: "About us", sub: "The firm" },
    { href: "education.html", label: "Education", sub: "News &amp; blog" },
    { href: "cover.html", label: "Cover list", sub: "Policy overview" },
    { href: "providers.html", label: "Catalog", sub: "Live catalog" },
    { href: "how.html", label: "How it works", sub: "The pipeline" },
    { href: "chat.html", label: "Customer service", sub: "Chat with the team" },
    { href: "mobile.html", label: "Mobile", sub: "On the go" },
    { href: "match.html", label: "Find your fit", sub: "Start matching" }
  ];

  function isActive(href) {
    return current === href || (href === "index.html" && current === "");
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

  var isHome = current === "index.html" || current === "";
  var backBtn = isHome ? "" :
    '<button type="button" class="back-btn" id="backBtn" aria-label="Go back" onclick="history.back()">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m0 0 6 6m-6-6 6-6"/></svg>' +
    "</button>";

  var header =
    '<a class="skip-link" href="#main">Skip to content</a>' +
    '<header class="site-header" id="siteHeader">' +
      backBtn +
      '<a class="brand" href="index.html" aria-label="Policy Fit Checker - home">' +
        '<span class="brand-mark" aria-hidden="true"></span>' +
        '<span>Policy&nbsp;Fit&nbsp;Checker</span>' +
      "</a>" +
      '<div class="header-actions">' +
        '<a class="header-link' + (isActive("about.html") ? " active" : "") + '" href="about.html">About</a>' +
        '<a class="header-link" href="home.html">Explore</a>' +
        '<a class="header-link' + (isActive("providers.html") ? " active" : "") + '" href="providers.html">Catalog</a>' +
        '<a class="header-link' + (isActive("match.html") ? " active" : "") + '" href="match.html">Find your fit</a>' +
        '<button class="theme-toggle" id="themeBtn" aria-pressed="false" aria-label="Switch theme">' +
          '<svg class="icon-sun" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></svg>' +
          '<svg class="icon-moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20.2 14.6A8.4 8.4 0 0 1 9.4 3.8a8.4 8.4 0 1 0 10.8 10.8Z"/></svg>' +
        "</button>" +
        '<button type="button" class="menu-btn" id="menuCta" aria-expanded="false" aria-controls="siteMenu" aria-label="Open menu">' +
          '<span class="dots-row"><span class="dot"></span><span class="dot"></span></span>' +
          '<span class="dots-row"><span class="dot"></span><span class="dot"></span></span>' +
        "</button>" +
      "</div>" +
    "</header>" +
    '<div class="site-menu" id="siteMenu" aria-hidden="true">' +
      '<div class="menu-grid">' +
        '<nav class="menu-links" aria-label="Menu">' +
          PAGES.map(function (p, i) {
            var n = (i + 1) < 10 ? "0" + (i + 1) : String(i + 1);
            var cls = isActive(p.href) ? ' class="menu-link active"' : ' class="menu-link"';
            return '<a' + cls + ' href="' + p.href + '"><span class="num">' + n + '</span><span class="label">' + p.label + '</span><span class="sub">' + p.sub + '</span></a>';
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
      '<div class="footer-inner">' +
        '<div class="footer-brand">' +
          '<span class="footer-mark">PFC</span>' +
          '<div class="footer-brand-txt">' +
            "<b>Policy Fit Checker</b>" +
            "<p>Five-agent pipeline, live Google Sheets catalog, static GitHub Pages.</p>" +
          "</div>" +
        "</div>" +
        '<nav class="footer-nav" aria-label="Footer">' +
          navLinks("footer-link") +
        "</nav>" +
      "</div>" +
      '<div class="footer-legal">' +
        "<span>\u00a9 2026 Policy Fit Checker</span>" +
        '<span class="footer-sep" aria-hidden="true">\u00b7</span>' +
        "<span>Academic project \u2014 no insurance is sold, no real financial advice is given</span>" +
        '<span class="footer-sep" aria-hidden="true">\u00b7</span>' +
        '<a href="https://github.com/Mimi-obodo/policy-fit-checker" rel="noopener">GitHub</a>' +
        '<span class="footer-sep" aria-hidden="true">\u00b7</span>' +
        '<a href="mailto:hello@pfc.example">Contact</a>' +
        '<span class="footer-sep" aria-hidden="true">\u00b7</span>' +
        '<a href="principles.html">Principles</a>' +
      "</div>" +
    "</footer>";

  var loader =
    '<div class="loader" id="loader" aria-hidden="true">' +
      '<div class="loader-word">Policy <b>Fit</b> Checker</div>' +
      '<div class="loader-count" id="loaderCount">00</div>' +
      '<div class="loader-bar" aria-hidden="true"><span id="loaderBar"></span></div>' +
    "</div>";

  var chatbot =
    '<button type="button" class="chatbot-fab" id="cbFab" aria-expanded="false" aria-controls="cbPanel" aria-label="Chat with the five agents">' +
      '<span class="cb-fab-ring" aria-hidden="true"></span>' +
      '<svg class="cb-fab-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 3l1.6 4.6L18 9l-4.4 1.4L12 15l-1.6-4.6L6 9l4.4-1.4z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/>' +
      "</svg>" +
      '<span class="cb-fab-label" aria-hidden="true">Talk to the team</span>' +
    "</button>" +
    '<div class="chatbot-panel" id="cbPanel" role="dialog" aria-modal="false" aria-label="Chat with the five agents" aria-hidden="true" hidden>' +
      '<div class="cb-head">' +
        '<span class="cb-head-mark">PFC</span>' +
        '<div class="cb-head-txt"><b>Policy Fit Checker</b><span class="cb-head-sub"><span class="cb-live-dot" aria-hidden="true"></span> five agents &middot; live catalog</span></div>' +
        '<button type="button" class="cb-max" id="cbMaxBtn" aria-label="Enlarge chat to full screen" aria-pressed="false">' +
          '<svg class="cb-max-icon cb-max-expand" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/></svg>' +
          '<svg class="cb-max-icon cb-max-compress" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h5V3M21 8h-5V3M3 16h5v5M21 16h-5v5"/></svg>' +
        "</button>" +
        '<button type="button" class="cb-close" id="cbClose" aria-label="Close chat">&times;</button>' +
      "</div>" +
      '<div class="cb-agents" id="cbAgents" role="group" aria-label="Choose an agent"></div>' +
      '<div class="cb-log" id="cbLog" tabindex="0" aria-live="polite"></div>' +
      '<div class="cb-suggestions" id="cbSuggestions" aria-label="Suggested questions"></div>' +
      '<form class="cb-form" id="cbForm">' +
        '<input id="cbInput" type="text" autocomplete="off" placeholder="Ask the team anything, e.g. which policy fits a family in Ireland" aria-label="Message the team">' +
        '<button type="submit" class="cb-send" aria-label="Send">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m0 0-6 6m6-6 6 6"/></svg>' +
        "</button>" +
      "</form>" +
      '<p class="cb-note"><a href="chat.html">Open the full chat page</a></p>' +
    "</div>";

  var searchOverlay =
    '<div class="search-overlay" id="searchOverlay" aria-hidden="true">' +
      '<div class="search-box" role="search">' +
        '<div class="search-head">' +
          '<svg class="search-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
          '<input id="searchInput" type="search" autocomplete="off" placeholder="Search what you want, e.g. family cover in Ireland under 60 a month" aria-label="Search">' +
          '<button type="button" class="search-close" id="searchClose" aria-label="Close search">&times;</button>' +
        "</div>" +
        '<div class="search-suggestions" id="searchSuggestions" aria-label="Suggested searches"></div>' +
        '<p class="search-hint">Press Enter \u2014 the five agents will search the live catalog for you.</p>' +
      "</div>" +
    "</div>";

  function inject() {
    var b = document.body;
    if (!b) return;
    b.insertAdjacentHTML("afterbegin", loader + cursor + header + buttons);
    b.insertAdjacentHTML("beforeend", footer + chatbot + searchOverlay);
    var main = document.querySelector("main");
    if (main) main.setAttribute("id", "main");
  }

  inject();
})();
