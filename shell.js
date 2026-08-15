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
    { href: "index.html", label: "Home" },
    { href: "home.html", label: "Explore" },
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

  function navLinks(cls, skipMatch) {
    return PAGES.filter(function (p) {
      return !(skipMatch && p.href === "match.html");
    }).map(function (p) {
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
      '<div class="site-brand">' +
        '<a class="wordmark" href="index.html" aria-label="Policy Fit Checker home">' +
          '<span class="wordmark-mark">PFC</span><span>Policy Fit Checker</span>' +
        "</a>" +
        '<span class="header-visual" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>' +
      "</div>" +
      '<nav class="site-nav" aria-label="Primary">' +
        navLinks("nav-link", true) +
        '<a class="nav-cta" href="match.html">Find your fit</a>' +
      "</nav>" +
      '<button type="button" class="theme-btn" id="themeBtn" aria-pressed="false" aria-label="Switch theme">' +
        '<svg class="theme-icon theme-sun" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>' +
        '<svg class="theme-icon theme-moon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg>' +
      "</button>" +
      '<button type="button" class="theme-btn search-btn" id="searchBtn" aria-expanded="false" aria-controls="searchOverlay" aria-label="Search">' +
        '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      "</button>" +
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
