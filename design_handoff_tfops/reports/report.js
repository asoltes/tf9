/* ===========================================================================
   tfops report — shared renderer + interactions
   Driven by window.RUN. One script for plan / apply / destroy.
   =========================================================================== */
(function () {
  "use strict";
  var RUN = window.RUN || { command: "plan", results: [] };
  var $ = function (s, r) { return (r || document).querySelector(s); };

  /* ---- icons (inline, stroke=currentColor) ------------------------------- */
  var I = {
    cube: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 13 12 18 17 13"/><polyline points="7 6 12 11 17 6"/></svg>',
    collapse: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="17 11 12 6 7 11"/><polyline points="17 18 12 13 7 18"/></svg>',
    wrap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><path d="M3 12h15a3 3 0 1 1 0 6h-4"/><polyline points="16 16 14 18 16 20"/><line x1="3" y1="18" x2="10" y2="18"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12l4-4m-4 4l-4-4"/><path d="M4 21h16"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    tilde: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14c0-2.2 1.3-4 3.2-4 2.8 0 3.6 4 6.4 4 1.9 0 3.2-1.8 3.2-4"/></svg>',
    minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>',
    hash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>',
    repo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z"/><polyline points="8 12 11 15 16 9"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    fire: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 .5-2S6 10 6 14a6 6 0 0 0 12 0c0-5-6-12-6-12z"/></svg>',
    nomatch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>'
  };

  /* ---- helpers ----------------------------------------------------------- */
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function fmtTime(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }
  function statusOf(r) {
    if (r.failed) return { cls: "sb-failed", label: "Failed", dot: "var(--red)" };
    if (r.noChanges || (r.add === 0 && r.change === 0 && r.destroy === 0)) return { cls: "sb-none", label: "No changes", dot: "var(--faint)" };
    if (r.destroy > 0) return { cls: "sb-destroy", label: "Has destroys", dot: "var(--red)" };
    return { cls: "sb-changes", label: "Changes", dot: "var(--green)" };
  }

  /* ---- terminal rendering: RAW text, real ANSI honored ------------------- */
  /* No synthetic coloring. If the output carries ANSI escape codes we render
     them; otherwise the line is shown exactly as terraform emitted it. */
  var ANSI_RE = /\x1b\[([0-9;]*)m/g;
  function hasAnsi(s) { return s.indexOf("\x1b[") !== -1; }
  function stripAnsi(s) { return s.replace(ANSI_RE, ""); }
  function styleFor(st) {
    var p = [];
    if (st.bold) p.push("font-weight:600");
    if (st.dim) p.push("opacity:.6");
    if (st.color) p.push("color:var(--a" + st.color + ")");
    return p.join(";");
  }
  function applyCodes(st, codes) {
    codes.split(";").forEach(function (c) {
      var n = parseInt(c || "0", 10);
      if (n === 0) { st.bold = false; st.dim = false; st.color = null; }
      else if (n === 1) st.bold = true;
      else if (n === 2) st.dim = true;
      else if (n === 22) { st.bold = false; st.dim = false; }
      else if (n === 39) st.color = null;
      else if ((n >= 30 && n <= 37) || (n >= 90 && n <= 97)) st.color = n;
    });
  }
  function wrapSeg(seg, st, q) {
    var s = styleFor(st), inner = renderInner(seg, q);
    return s ? '<span style="' + s + '">' + inner + "</span>" : inner;
  }
  function renderAnsiLine(text, q) {
    var out = "", last = 0, m, st = { bold: false, dim: false, color: null };
    ANSI_RE.lastIndex = 0;
    while ((m = ANSI_RE.exec(text)) !== null) {
      var seg = text.slice(last, m.index);
      if (seg) out += wrapSeg(seg, st, q);
      last = ANSI_RE.lastIndex;
      applyCodes(st, m[1]);
    }
    var tail = text.slice(last);
    if (tail) out += wrapSeg(tail, st, q);
    return out;
  }
  /* address from "# <addr> will be ..." — structural, drives the copy button */
  function resAddr(line) {
    var m = stripAnsi(line).match(/^\s*#\s+(\S+)\s+(will be|must be)\b/);
    return m ? m[1] : null;
  }

  /* highlight query inside escaped text */
  function renderInner(text, q) {
    if (!q) return esc(text);
    var lower = text.toLowerCase(), ql = q.toLowerCase(), out = "", i = 0, idx;
    while ((idx = lower.indexOf(ql, i)) !== -1) {
      out += esc(text.slice(i, idx)) + '<span class="hl">' + esc(text.slice(idx, idx + q.length)) + "</span>";
      i = idx + q.length;
    }
    return out + esc(text.slice(i));
  }

  /* ---- build header ------------------------------------------------------ */
  function buildHeader() {
    var cmd = RUN.command;
    var meta = [];
    if (RUN.repo) meta.push('<span class="chip">' + I.repo + '<b>' + esc(RUN.repo) + "</b></span>");
    if (RUN.branch) meta.push('<span class="chip">' + I.git + esc(RUN.branch) + "</span>");
    if (RUN.runId) meta.push('<span class="chip">' + I.hash + esc(RUN.runId) + "</span>");
    if (RUN.duration) meta.push('<span class="chip">' + I.clock + esc(RUN.duration) + "</span>");
    meta.push('<span class="chip">' + esc(fmtTime(RUN.startedAt)) + "</span>");
    $("#hdr").innerHTML =
      '<div class="wrap"><div class="hdr-inner">' +
        '<div class="hdr-left">' +
          '<div class="mark">' + I.cube + "</div>" +
          '<div class="hdr-titles">' +
            '<div class="hdr-title">Terraform ' + cmd.charAt(0).toUpperCase() + cmd.slice(1) +
              '<span class="pill"><span class="dot"></span>' + esc(cmd) + "</span></div>" +
            '<div class="hdr-sub">' + meta.join("") + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="hdr-right">' +
          '<button class="icon-btn" id="themeBtn" title="Toggle theme" aria-label="Toggle theme"></button>' +
          '<button class="icon-btn" id="printBtn" title="Print / Save as PDF" aria-label="Print">' + I.print + "</button>" +
        "</div>" +
      "</div></div>";
  }

  /* ---- totals + verdict -------------------------------------------------- */
  function totals() {
    var a = 0, c = 0, d = 0, f = 0, nc = 0;
    RUN.results.forEach(function (r) { a += r.add; c += r.change; d += r.destroy; if (r.failed) f++; if (r.noChanges || (r.add === 0 && r.change === 0 && r.destroy === 0)) nc++; });
    return { add: a, change: c, destroy: d, failed: f, noChange: nc, envs: RUN.results.length };
  }
  function buildVerdict(t) {
    var kind, ico, h, p;
    if (t.failed > 0) {
      kind = "is-danger"; ico = I.warn;
      h = t.failed + " of " + t.envs + " environment" + (t.envs === 1 ? "" : "s") + " failed";
      p = "Review the failed environments below before proceeding.";
    } else if (RUN.command === "destroy") {
      kind = "is-danger"; ico = I.fire;
      h = "Destroyed <b>" + t.destroy + "</b> resource" + (t.destroy === 1 ? "" : "s") + " across <b>" + t.envs + "</b> environment" + (t.envs === 1 ? "" : "s");
      p = "All targeted infrastructure has been torn down.";
    } else if (RUN.command === "apply") {
      kind = "is-ok"; ico = I.ok;
      h = "Apply complete across <b>" + t.envs + "</b> environment" + (t.envs === 1 ? "" : "s");
      p = "<b>" + t.add + "</b> added, <b>" + t.change + "</b> changed, <b>" + t.destroy + "</b> destroyed.";
    } else if (t.destroy > 0) {
      kind = "is-warn"; ico = I.warn;
      h = "Plan includes <b>" + t.destroy + "</b> destroy" + (t.destroy === 1 ? "" : "s");
      p = "Review destroyed resources carefully before applying.";
    } else if (t.add + t.change + t.destroy === 0) {
      kind = "is-ok"; ico = I.ok;
      h = "No changes \u2014 infrastructure matches configuration";
      p = "All <b>" + t.envs + "</b> environment" + (t.envs === 1 ? "" : "s") + " are up to date.";
    } else {
      kind = "is-ok"; ico = I.ok;
      h = "Ready to apply \u2014 <b>" + (t.add + t.change) + "</b> change" + (t.add + t.change === 1 ? "" : "s") + " planned";
      p = "<b>" + t.add + "</b> to add, <b>" + t.change + "</b> to change across <b>" + t.envs + "</b> environment" + (t.envs === 1 ? "" : "s") + ".";
    }
    var total = t.add + t.change + t.destroy || 1;
    var bar = '<div class="verdict-bar">' +
      '<i class="vb-add" style="width:' + (t.add / total * 100) + '%"></i>' +
      '<i class="vb-change" style="width:' + (t.change / total * 100) + '%"></i>' +
      '<i class="vb-destroy" style="width:' + (t.destroy / total * 100) + '%"></i></div>';
    $("#verdict").className = "verdict " + kind;
    $("#verdict").innerHTML =
      '<div class="verdict-ico">' + ico + "</div>" +
      '<div class="verdict-txt"><div class="verdict-h">' + h + '</div><div class="verdict-p">' + p + "</div></div>" +
      '<div class="verdict-spacer"></div>' + (t.add + t.change + t.destroy > 0 ? bar : "");
  }

  /* ---- stat cards -------------------------------------------------------- */
  function buildCards(t) {
    function card(mod, ico, val, lbl, foot) {
      return '<div class="card card-' + mod + '">' +
        '<div class="card-top"><span class="card-lbl">' + lbl + '</span><span class="card-ico">' + ico + "</span></div>" +
        '<div class="card-val tnum">' + val + "</div>" +
        '<div class="card-foot">' + foot + "</div></div>";
    }
    var envWord = t.envs === 1 ? "environment" : "environments";
    $("#cards").innerHTML =
      card("add", I.plus, "+" + t.add, "To add", t.add === 0 ? "Nothing new" : "new resources") +
      card("change", I.tilde, "~" + t.change, "To change", t.change === 0 ? "No updates" : "in-place updates") +
      card("destroy", I.minus, "-" + t.destroy, "To destroy", t.destroy === 0 ? "Nothing removed" : "resources removed") +
      card("envs", I.layers, t.envs, "Environments", t.failed > 0 ? t.failed + " failed" : (t.noChange > 0 ? t.noChange + " unchanged" : "all planned"));
  }

  /* ---- summary table ----------------------------------------------------- */
  function dotColor(r) {
    var s = statusOf(r);
    return s.dot;
  }
  function buildTable() {
    var rows = RUN.results.map(function (r, i) {
      var s = statusOf(r);
      var tot = r.add + r.change + r.destroy || 1;
      var dist = '<span class="dist">' +
        '<i style="width:' + (r.add / tot * 100) + '%;background:var(--green)"></i>' +
        '<i style="width:' + (r.change / tot * 100) + '%;background:var(--amber)"></i>' +
        '<i style="width:' + (r.destroy / tot * 100) + '%;background:var(--red)"></i></span>';
      function n(v, sym, cls) { return v > 0 ? '<span class="' + cls + '">' + sym + v + "</span>" : '<span class="n-zero">' + sym + "0</span>"; }
      return '<tr data-jump="' + i + '">' +
        '<td><span class="env-link"><span class="env-dot" style="background:' + s.dot + '"></span>' +
          '<span class="env-name">' + esc(r.env) + "</span></span></td>" +
        '<td class="t-profile">' + esc(r.profile || "—") + "</td>" +
        '<td class="num n-add">' + (r.failed ? '<span class="n-zero">—</span>' : n(r.add, "+", "n-add")) + "</td>" +
        '<td class="num n-change">' + (r.failed ? '<span class="n-zero">—</span>' : n(r.change, "~", "n-change")) + "</td>" +
        '<td class="num n-destroy">' + (r.failed ? '<span class="n-zero">—</span>' : n(r.destroy, "-", "n-destroy")) + "</td>" +
        "<td>" + (r.failed ? "" : dist) + "</td>" +
        '<td><span class="sb ' + s.cls + '"><span class="d"></span>' + s.label + "</span></td>" +
      "</tr>";
    }).join("");
    $("#tbl").innerHTML =
      "<thead><tr><th>Environment</th><th>Profile</th>" +
      '<th class="num">Add</th><th class="num">Change</th><th class="num">Destroy</th>' +
      "<th>Distribution</th><th>Status</th></tr></thead><tbody>" + rows + "</tbody>";
    $("#tbl").querySelectorAll("tbody tr").forEach(function (tr) {
      tr.addEventListener("click", function () {
        var i = +tr.getAttribute("data-jump");
        var block = document.querySelectorAll(".env-block")[i];
        if (block) { block.classList.add("open"); block.scrollIntoView({ behavior: "smooth", block: "start" }); }
      });
    });
  }

  /* ---- detail blocks ----------------------------------------------------- */
  function buildDetails(query) {
    var html = RUN.results.map(function (r, i) {
      var s = statusOf(r);
      var lines = (r.output || "").split("\n");
      var body = lines.map(function (line, n) {
        var addr = resAddr(line);
        var inner = hasAnsi(line) ? renderAnsiLine(line, query) : renderInner(line, query);
        var copy = addr
          ? '<button class="res-copy" data-addr="' + esc(addr) + '" title="Copy resource address">' + I.copy + "copy</button>"
          : "";
        return '<div class="ln' + (addr ? " ln-res" : "") + '">' +
          '<span class="ln-gutter">' + (n + 1) + "</span>" +
          '<span class="ln-code">' + inner + copy + "</span></div>";
      }).join("");
      var nums = r.failed
        ? '<span class="env-nums"><span class="z">failed</span></span>'
        : '<span class="env-nums">' +
            '<span class="' + (r.add ? "ea" : "z") + '">+' + r.add + "</span>" +
            '<span class="' + (r.change ? "ec" : "z") + '">~' + r.change + "</span>" +
            '<span class="' + (r.destroy ? "ed" : "z") + '">-' + r.destroy + "</span></span>";
      return '<div class="env-block" data-env="' + esc(r.env.toLowerCase()) + '" data-idx="' + i + '">' +
        '<div class="env-hdr">' +
          '<span class="env-dot-lg" style="background:' + s.dot + '"></span>' +
          '<div class="env-hdr-left"><span class="env-nm">' + esc(r.env) + "</span>" +
            '<span class="env-pr">' + esc(r.profile || "") + "</span>" +
            '<span class="env-meta"></span>' + nums + "</div>" +
          '<span class="sb ' + s.cls + '"><span class="d"></span>' + s.label + "</span>" +
          '<span class="chevron">' + I.chevron + "</span>" +
        "</div>" +
        '<div class="env-body"><div class="term-bar">' +
          '<span class="term-dots"><i></i><i></i><i></i></span>' +
          '<span class="term-cmd">$ terraform ' + esc(RUN.command) + " &nbsp;\u00b7&nbsp; " + esc(r.env) + "</span>" +
          '<span class="term-bar-spacer"></span>' +
          '<button class="term-copy" data-copyout="' + i + '">' + I.copy + "Copy output</button>" +
          '<button class="term-copy" data-download="' + i + '">' + I.download + "Download</button>" +
        "</div>" +
        '<div class="term"><div class="term-inner">' + body + "</div></div></div>" +
      "</div>";
    }).join("");
    $("#details").innerHTML = html + '<div class="no-match" id="noMatch">' + I.nomatch + "<div>No environments match your search.</div></div>";
    wireDetails();
  }

  function wireDetails() {
    document.querySelectorAll(".env-hdr").forEach(function (h) {
      h.addEventListener("click", function (e) {
        if (e.target.closest(".sb")) return;
        h.parentElement.classList.toggle("open");
      });
    });
    document.querySelectorAll(".res-copy").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); copy(b.getAttribute("data-addr"), "Resource address copied"); });
    });
    document.querySelectorAll("[data-copyout]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var i = +b.getAttribute("data-copyout");
        copy(RUN.results[i].output || "", "Output copied");
      });
    });
    document.querySelectorAll("[data-download]").forEach(function (b) {
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        var i = +b.getAttribute("data-download");
        var r = RUN.results[i];
        var blob = new Blob([r.output || ""], { type: "text/plain" });
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); a.href = url; a.download = RUN.command + "-" + r.env + ".txt";
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast("Output downloaded");
      });
    });
  }

  /* auto-open envs with changes / failures */
  function autoOpen() {
    document.querySelectorAll(".env-block").forEach(function (b) {
      var r = RUN.results[+b.getAttribute("data-idx")];
      if (r.failed || r.add || r.change || r.destroy) b.classList.add("open");
    });
  }

  /* ---- search ------------------------------------------------------------ */
  function runSearch(q) {
    q = q.trim();
    var wrap = $("#search");
    wrap.classList.toggle("has-val", q.length > 0);
    buildDetails(q);
    var blocks = document.querySelectorAll(".env-block");
    var shown = 0, matches = 0;
    blocks.forEach(function (b) {
      var r = RUN.results[+b.getAttribute("data-idx")];
      if (!q) { b.classList.remove("hidden"); return; }
      var hay = (r.env + "\n" + (r.output || "")).toLowerCase();
      var ql = q.toLowerCase(), m = 0, idx = -1;
      while ((idx = hay.indexOf(ql, idx + 1)) !== -1) m++;
      if (m > 0) { b.classList.remove("hidden"); b.classList.add("open"); shown++; matches += m; }
      else b.classList.add("hidden");
    });
    if (q) {
      autoCollapseEmpty();
    } else { autoOpen(); }
    $("#noMatch").classList.toggle("show", q && shown === 0);
    var cnt = $("#searchCount");
    cnt.textContent = q ? (matches + " match" + (matches === 1 ? "" : "es") + " \u00b7 " + shown + "/" + blocks.length + " env") : "";
  }
  function autoCollapseEmpty() {/* keep matching blocks open (handled above) */}

  /* ---- copy + toast ------------------------------------------------------ */
  var toastT;
  function toast(msg) {
    var el = $("#toast");
    el.innerHTML = I.check + esc(msg);
    el.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove("show"); }, 1700);
  }
  function copy(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(msg); }, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast(msg); } catch (e) {}
      document.body.removeChild(ta);
    }
  }

  /* ---- theme ------------------------------------------------------------- */
  function applyThemeIcon() {
    var m = document.documentElement.getAttribute("data-theme");
    $("#themeBtn").innerHTML = m === "light" ? I.moon : I.sun;
  }
  function toggleTheme() {
    var cur = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
    var next = cur === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("tfops-color-mode", next); } catch (e) {}
    applyThemeIcon();
  }

  /* ---- toolbar controls -------------------------------------------------- */
  function allOpen() { return [].every.call(document.querySelectorAll(".env-block:not(.hidden)"), function (b) { return b.classList.contains("open"); }); }
  function toggleAll() {
    var open = !allOpen();
    document.querySelectorAll(".env-block:not(.hidden)").forEach(function (b) { b.classList.toggle("open", open); });
    setExpandLabel(open);
  }
  function setExpandLabel(open) {
    $("#expandBtn").innerHTML = (open ? I.collapse : I.expand) + (open ? "Collapse all" : "Expand all");
  }

  /* ---- init -------------------------------------------------------------- */
  function init() {
    document.documentElement.setAttribute("data-cmd", RUN.command);
    var t = totals();
    buildHeader();
    buildVerdict(t);
    buildCards(t);
    buildTable();
    buildDetails("");
    autoOpen();
    applyThemeIcon();
    setExpandLabel(false);
    $("#secCount").textContent = t.envs + " env" + (t.envs === 1 ? "" : "s");
    $("#tblCount").textContent = t.envs + " env" + (t.envs === 1 ? "" : "s");

    $("#themeBtn").addEventListener("click", toggleTheme);
    $("#printBtn").addEventListener("click", function () { window.print(); });
    $("#expandBtn").addEventListener("click", toggleAll);
    $("#wrapBtn").addEventListener("click", function () {
      var on = $("#wrapBtn").classList.toggle("is-on");
      document.querySelectorAll(".term").forEach(function (t) { t.classList.toggle("wrap-on", on); });
    });
    var inp = $("#searchInput");
    inp.addEventListener("input", function () { runSearch(inp.value); });
    $("#searchClear").addEventListener("click", function () { inp.value = ""; runSearch(""); inp.focus(); });
    document.addEventListener("keydown", function (e) {
      if ((e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key === "f"))) {
        if (document.activeElement !== inp) { e.preventDefault(); inp.focus(); inp.select(); }
      }
      if (e.key === "Escape" && document.activeElement === inp) { inp.value = ""; runSearch(""); inp.blur(); }
    });

    // theme sync when embedded in the SPA iframe
    window.addEventListener("message", function (e) {
      if (e.data && e.data.tfopsTheme) { document.documentElement.setAttribute("data-theme", e.data.tfopsTheme); applyThemeIcon(); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
