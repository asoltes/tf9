/* tfops — global theme controller (load in <head> to avoid flash) */
(function () {
  var KEY = "tfops-color-mode";
  function get() { try { return localStorage.getItem(KEY) === "dark" ? "dark" : "light"; } catch (e) { return "light"; } }
  function apply(t) {
    document.documentElement.setAttribute("data-theme", t);
    var ed = document.getElementById("editor"); if (ed) ed.setAttribute("data-theme", t);
  }
  apply(get()); // runs immediately (head) — pre-paint

  var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  function paintButtons() {
    var t = get();
    document.querySelectorAll("[data-theme-btn]").forEach(function (b) { b.innerHTML = t === "dark" ? SUN : MOON; b.title = t === "dark" ? "Switch to light mode" : "Switch to dark mode"; });
  }
  window.tfopsToggleTheme = function () {
    var next = get() === "dark" ? "light" : "dark";
    try { localStorage.setItem(KEY, next); } catch (e) {}
    apply(next); paintButtons();
    document.querySelectorAll("iframe").forEach(function (f) { try { f.contentWindow.postMessage({ tfopsTheme: next }, "*"); } catch (e) {} });
  };
  function init() {
    paintButtons();
    document.querySelectorAll("[data-theme-btn]").forEach(function (b) { b.addEventListener("click", window.tfopsToggleTheme); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
