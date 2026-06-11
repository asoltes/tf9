/* =========================================================================
   AWS STS auth status badge — topnav indicator
   Replaces static region label with a live auth check indicator.
   Clicking toggles state (prototype behaviour); real impl would call STS.
   ========================================================================= */
(function () {
  /* ---- inject styles once ----------------------------------------------- */
  var style = document.createElement("style");
  style.textContent = [
    ".sts-badge{display:inline-flex;align-items:center;gap:7px;height:28px;padding:0 11px 0 9px;",
    "border-radius:999px;border:1px solid rgba(255,255,255,.14);cursor:pointer;",
    "transition:background .12s,border-color .12s;user-select:none;font-family:var(--sans);",
    "font-size:12px;font-weight:600;white-space:nowrap;}",
    ".sts-badge:hover{background:rgba(255,255,255,.09);border-color:rgba(255,255,255,.28);}",
    ".sts-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;transition:background .2s,box-shadow .2s;}",
    ".sts-badge.ok .sts-dot{background:#3fb950;box-shadow:0 0 0 2px rgba(63,185,80,.25);}",
    ".sts-badge.fail .sts-dot{background:#f85149;box-shadow:0 0 0 2px rgba(248,81,73,.2);}",
    ".sts-badge.checking .sts-dot{background:#d29922;animation:sts-pulse .9s ease-in-out infinite;}",
    ".sts-badge.ok .sts-lbl{color:rgba(255,255,255,.92);}",
    ".sts-badge.fail .sts-lbl{color:rgba(255,255,255,.6);}",
    ".sts-badge.checking .sts-lbl{color:rgba(255,255,255,.65);}",
    "@keyframes sts-pulse{0%,100%{opacity:1}50%{opacity:.4}}"
  ].join("");
  document.head.appendChild(style);

  /* ---- persistence ------------------------------------------------------- */
  var KEY = "tfops-sts-auth";
  function getAuth() {
    try { var v = localStorage.getItem(KEY); return v === null ? true : v === "true"; }
    catch (e) { return true; }
  }
  function setAuth(v) { try { localStorage.setItem(KEY, v ? "true" : "false"); } catch (e) {} }

  /* ---- render ------------------------------------------------------------ */
  function render(el, state) {
    var lbl = state === "checking" ? "Checking…" : state === "ok" ? "Authenticated" : "Unauthenticated";
    var tip = state === "ok"
      ? "AWS STS · Valid session · arn:aws:iam::111111111111:user/andres · Click to toggle"
      : "AWS STS · No valid token found · Click to toggle";
    el.className = "sts-badge " + state;
    el.title = tip;
    el.innerHTML =
      '<span class="sts-dot"></span>' +
      '<span class="sts-lbl">' + lbl + "</span>";
  }

  /* ---- simulate STS check on load --------------------------------------- */
  function init() {
    var el = document.getElementById("stsBadge");
    if (!el) return;

    var authed = getAuth();
    render(el, "checking");

    /* simulate a ~900ms STS GetCallerIdentity call */
    setTimeout(function () {
      render(el, authed ? "ok" : "fail");
    }, 900);

    /* click to toggle (prototype) */
    el.addEventListener("click", function () {
      authed = !authed;
      setAuth(authed);
      render(el, "checking");
      setTimeout(function () { render(el, authed ? "ok" : "fail"); }, 600);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
