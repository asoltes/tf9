/* =========================================================================
   Config YAML — code editor logic
   Syntax highlight + line numbers + current line + schema validation.
   ========================================================================= */
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }

  var I = {
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    format: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="18" y2="18"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/></svg>',
    err: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 15.5 9.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H4.5a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 6 9.4a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 11 4.6h.09A1.65 1.65 0 0 0 12 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 17 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9z"/></svg>'
  };

  var SAMPLE = [
    "# tf9 configuration — ~/.config/tf9/config.yaml",
    "# Stores AWS profile names, account IDs and regions. Never credentials.",
    "version: 1",
    "",
    "repositories:",
    "  - name: infrastructure",
    "    path: /Users/andres/src/infrastructure",
    "    targets:",
    "      - name: bootstrap",
    "        directory: global/s3",
    "        aws_profile: company-shared",
    '        account_id: "100000000001"',
    "        region: eu-west-2",
    "      - name: dev",
    "        directory: environments/dev",
    "        aws_profile: company-dev",
    '        account_id: "111111111111"',
    "        region: eu-west-2",
    "      - name: staging",
    "        directory: environments/staging",
    "        aws_profile: company-staging",
    "        account_id: 222222222222",
    "        region: eu-west-2",
    "      - name: prod",
    "        directory: environments/prod",
    "        aws_profile: company-prod",
    '        account_id: "333333333333"',
    "        region: eu-west-2",
    "  - name: terraform-up-and-running",
    "    path: /Users/andres/src/terraform-up-and-running",
    "    targets:",
    "      - name: s3",
    "        directory: chapter-3/file-layout/global/s3",
    "        aws_profile: default",
    "        region: ap-southeast-1",
    "      - name: example-server",
    "        directory: chapter-2/example-server",
    "        aws_profile: default",
    "        region: ap-southeast-1",
    "      - name: webserver-cluster",
    "        directory: chapter-2/webserver-cluster",
    "        aws_profile: default",
    "        region: eu-west-2",
    ""
  ].join("\n");

  var ed, inp, hlEl, gutter, gutterInner, curband, problemsEl;
  var saved = SAMPLE, problems = [];

  /* ---- syntax highlight -------------------------------------------------- */
  function hlVal(v) {
    if (v === "") return "";
    var com = "", ci = v.indexOf(" #");
    if (ci >= 0) { com = '<span class="t-com">' + esc(v.slice(ci)) + "</span>"; v = v.slice(0, ci); }
    var trail = v.match(/\s*$/)[0]; var core = v.slice(0, v.length - trail.length);
    var cls;
    if (/^(["']).*\1$/.test(core)) cls = "t-str";
    else if (/^-?\d+(\.\d+)?$/.test(core)) cls = "t-num";
    else if (/^(true|false|null|yes|no|~)$/i.test(core)) cls = "t-bool";
    else if (/^[&*]/.test(core)) cls = "t-anchor";
    else cls = "t-val";
    return '<span class="' + cls + '">' + esc(core) + "</span>" + esc(trail) + com;
  }
  function hlLine(line) {
    if (/^\s*#/.test(line)) return '<span class="t-com">' + esc(line) + "</span>";
    var m = line.match(/^(\s*)(- )?([A-Za-z0-9_.\-]+)(:)(\s|$)(.*)$/);
    if (m) {
      var out = esc(m[1]);
      if (m[2]) out += '<span class="t-pun">- </span>';
      out += '<span class="t-key">' + esc(m[3]) + '</span><span class="t-pun">:</span>' + (m[5] === " " ? " " : "");
      out += hlVal(m[6]);
      return out;
    }
    var l = line.match(/^(\s*)(- )(.*)$/);
    if (l) return esc(l[1]) + '<span class="t-pun">- </span>' + hlVal(l[3]);
    return esc(line) || "";
  }
  function highlight() {
    var lines = inp.value.split("\n");
    hlEl.innerHTML = lines.map(hlLine).join("\n");
  }

  /* ---- gutter ------------------------------------------------------------ */
  function curLineIndex() {
    return inp.value.slice(0, inp.selectionStart).split("\n").length - 1;
  }
  function renderGutter() {
    var n = inp.value.split("\n").length;
    var cur = curLineIndex();
    var byLine = {};
    problems.forEach(function (p) { if (!byLine[p.line] || p.sev === "err") byLine[p.line] = p.sev; });
    var html = "";
    for (var i = 0; i < n; i++) {
      var mk = byLine[i + 1] ? '<span class="marker ' + (byLine[i + 1] === "err" ? "err" : "warn") + '"></span>' : "";
      html += '<div class="gl' + (i === cur ? " cur" : "") + '">' + mk + (i + 1) + "</div>";
    }
    gutterInner.innerHTML = html;
  }

  /* ---- validation -------------------------------------------------------- */
  function validate() {
    var lines = inp.value.split("\n");
    var probs = [];
    var repoNames = {};
    // line-level lints
    lines.forEach(function (ln, i) {
      var lead = ln.match(/^[ \t]*/)[0];
      if (lead.indexOf("\t") >= 0) probs.push({ line: i + 1, sev: "err", msg: "YAML does not allow tabs for indentation — use spaces." });
      var ai = ln.match(/^\s*account_id:\s*(\d{6,})\s*(#.*)?$/);
      if (ai) probs.push({ line: i + 1, sev: "warn", msg: "Quote account_id (\"" + ai[1] + "\") to preserve leading zeros." });
      var rn = ln.match(/^  - name:\s*(\S+)/);
      if (rn) { if (repoNames[rn[1]]) probs.push({ line: i + 1, sev: "err", msg: "Duplicate repository name \"" + rn[1] + "\"." }); repoNames[rn[1]] = true; }
    });
    // version check
    if (!/^version:\s*1\s*$/m.test(inp.value)) probs.push({ line: 1, sev: "warn", msg: "Expected \"version: 1\" at the top of the file." });
    // target blocks: require directory + aws_profile
    var inTgt = false, tStart = 0, tName = "", hasDir = false, hasProf = false;
    function closeTgt() {
      if (!inTgt) return;
      if (!hasProf) probs.push({ line: tStart, sev: "err", msg: "Target \"" + tName + "\" is missing required field: aws_profile." });
      if (!hasDir) probs.push({ line: tStart, sev: "err", msg: "Target \"" + tName + "\" is missing required field: directory." });
      inTgt = false;
    }
    lines.forEach(function (ln, i) {
      var indent = (ln.match(/^ */) || [""])[0].length;
      var tm = ln.match(/^      - name:\s*(\S+)/);
      if (tm) { closeTgt(); inTgt = true; tStart = i + 1; tName = tm[1]; hasDir = false; hasProf = false; return; }
      if (inTgt) {
        if (ln.trim() && indent <= 4) { closeTgt(); return; }
        if (/^\s*aws_profile:\s*\S/.test(ln)) hasProf = true;
        if (/^\s*directory:\s*\S/.test(ln)) hasDir = true;
      }
    });
    closeTgt();
    probs.sort(function (a, b) { return a.line - b.line; });
    problems = probs;
  }

  /* ---- problems pane ----------------------------------------------------- */
  function renderProblems() {
    var errs = problems.filter(function (p) { return p.sev === "err"; }).length;
    var warns = problems.length - errs;
    // status counts
    $("#stErr").innerHTML = (errs ? '<span class="pill-err">' + I.err + " " + errs + "</span>" : '<span class="pill-ok">' + I.ok + " 0</span>");
    $("#stWarn").innerHTML = '<span class="' + (warns ? "pill-warn" : "") + '">' + I.warn + " " + warns + "</span>";
    // pane
    var head = '<div class="prob-head"><span>Problems <span style="color:var(--ed-gutter-text);font-weight:400">(' + problems.length + ")</span></span>" +
      '<button class="prob-close" id="probClose">' + I.x + "</button></div>";
    var body = problems.length === 0
      ? '<div class="prob-empty">' + I.ok + "  No problems detected. Schema is valid.</div>"
      : problems.map(function (p) {
          return '<div class="prob-row" data-goto="' + p.line + '"><span class="ic ' + (p.sev === "err" ? "err" : "warn") + '">' + (p.sev === "err" ? I.err : I.warn) + "</span>" +
            "<span>" + esc(p.msg) + '</span><span class="ln">Ln ' + p.line + "</span></div>";
        }).join("");
    problemsEl.innerHTML = head + body;
    $("#probClose").addEventListener("click", function () { ed.classList.remove("show-problems"); });
    problemsEl.querySelectorAll("[data-goto]").forEach(function (r) {
      r.addEventListener("click", function () { gotoLine(+r.getAttribute("data-goto")); });
    });
  }
  function gotoLine(line) {
    var lines = inp.value.split("\n");
    var pos = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    inp.focus();
    inp.setSelectionRange(pos, pos);
    var top = (line - 1) * 21 - inp.clientHeight / 2 + 40;
    inp.scrollTop = Math.max(0, top);
    syncScroll(); updateAll();
  }

  /* ---- status bar -------------------------------------------------------- */
  function updateStatus() {
    var pos = inp.selectionStart;
    var before = inp.value.slice(0, pos);
    var line = before.split("\n").length;
    var col = pos - before.lastIndexOf("\n");
    $("#stPos").textContent = "Ln " + line + ", Col " + col;
  }

  /* ---- scroll sync ------------------------------------------------------- */
  function syncScroll() {
    hlEl.style.transform = "translate(" + (-inp.scrollLeft) + "px," + (-inp.scrollTop) + "px)";
    gutterInner.style.transform = "translateY(" + (-inp.scrollTop) + "px)";
    var cur = curLineIndex();
    curband.style.transform = "translateY(" + (cur * 21 + 12 - inp.scrollTop) + "px)";
  }

  /* ---- dirty ------------------------------------------------------------- */
  function setDirty() {
    var dirty = inp.value !== saved;
    $("#dirtyBanner").style.display = dirty ? "" : "none";
    $("#saveBtn").disabled = !dirty;
    $("#saveDot").style.display = dirty ? "" : "none";
  }

  function updateAll() { highlight(); validate(); renderGutter(); renderProblems(); updateStatus(); syncScroll(); setDirty(); }

  /* ---- actions ----------------------------------------------------------- */
  function format() {
    var lines = inp.value.split("\n").map(function (l) { return l.replace(/\s+$/, ""); });
    while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    inp.value = lines.join("\n") + "\n";
    updateAll(); toast("Formatted");
  }
  function save() {
    if (problems.some(function (p) { return p.sev === "err"; })) { ed.classList.add("show-problems"); toast("Fix errors before saving"); return; }
    if (!inp.value.endsWith("\n")) inp.value += "\n";
    saved = inp.value; updateAll(); toast("Config saved to config.yaml");
  }
  function reload() { inp.value = saved; updateAll(); toast("Reloaded from disk"); }

  /* ---- toast ------------------------------------------------------------- */
  var tt;
  function toast(m) { var el = $("#toast"); el.innerHTML = I.check + esc(m); el.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove("show"); }, 1900); }

  /* ---- init -------------------------------------------------------------- */
  function init() {
    ed = $("#editor"); inp = $("#edInput"); hlEl = $("#edHighlight"); gutter = $("#gutter"); gutterInner = $("#gutterInner"); curband = $("#curband"); problemsEl = $("#problems");
    inp.value = SAMPLE; saved = SAMPLE;
    updateAll();

    inp.addEventListener("input", updateAll);
    inp.addEventListener("scroll", syncScroll);
    inp.addEventListener("keyup", function () { renderGutter(); updateStatus(); syncScroll(); });
    inp.addEventListener("click", function () { renderGutter(); updateStatus(); syncScroll(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "Tab") {
        e.preventDefault();
        var s = inp.selectionStart, en = inp.selectionEnd;
        inp.value = inp.value.slice(0, s) + "  " + inp.value.slice(en);
        inp.selectionStart = inp.selectionEnd = s + 2;
        updateAll();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
    });

    $("#saveBtn").addEventListener("click", save);
    $("#reloadBtn").addEventListener("click", reload);
    $("#formatBtn").addEventListener("click", format);
    $("#themeBtn").addEventListener("click", function () {
      var dark = ed.getAttribute("data-theme") === "dark";
      ed.setAttribute("data-theme", dark ? "light" : "dark");
      $("#themeBtn").innerHTML = dark ? I.sun : I.moon;
      syncScroll();
    });
    $("#wrapBtn").addEventListener("click", function () { ed.classList.toggle("wrap"); $("#wrapBtn").classList.toggle("on"); syncScroll(); });
    $("#probToggle").addEventListener("click", function () { ed.classList.toggle("show-problems"); });
    window.addEventListener("resize", syncScroll);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
