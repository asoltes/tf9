/* =========================================================================
   Reports History — interactive prototype
   ========================================================================= */
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var I = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    checkc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 15.5 9.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>'
  };

  /* ---- sample report data ------------------------------------------------ */
  var now = Date.now();
  function ago(s) { return new Date(now - s * 1000).toISOString(); }

  var REPORTS = [
    { id: "run-0042", cmd: "apply",   repo: "infrastructure",            branch: "main",        date: ago(70),    duration: "42s",    status: "success", targets: ["dev", "staging", "prod"],                                         add: 15, change: 0, destroy: 0 },
    { id: "run-0041", cmd: "plan",    repo: "terraform-up-and-running",  branch: "master",      date: ago(190),   duration: "27s",    status: "success", targets: ["example-server", "single-web-server", "webserver-cluster", "s3"], add: 15, change: 0, destroy: 0 },
    { id: "run-0040", cmd: "plan",    repo: "infrastructure",            branch: "main",        date: ago(900),   duration: "31s",    status: "success", targets: ["dev", "staging", "prod", "s3", "iam"],                           add: 5,  change: 2, destroy: 0 },
    { id: "run-0039", cmd: "apply",   repo: "infrastructure",            branch: "main",        date: ago(2400),  duration: "1m 12s", status: "failed",  targets: ["dev", "staging", "prod"],                                         add: 5,  change: 0, destroy: 0 },
    { id: "run-0038", cmd: "plan",    repo: "terraform-up-and-running",  branch: "master",      date: ago(5400),  duration: "27s",    status: "success", targets: ["s3", "webserver-cluster"],                                        add: 12, change: 0, destroy: 0 },
    { id: "run-0037", cmd: "destroy", repo: "infrastructure",            branch: "main",        date: ago(9000),  duration: "14s",    status: "success", targets: ["dev"],                                                            add: 0,  change: 0, destroy: 5 },
    { id: "run-0035", cmd: "plan",    repo: "infrastructure",            branch: "develop",     date: ago(14400), duration: "22s",    status: "success", targets: ["dev", "staging"],                                                 add: 3,  change: 1, destroy: 0 },
    { id: "run-0034", cmd: "apply",   repo: "terraform-up-and-running",  branch: "master",      date: ago(21600), duration: "35s",    status: "success", targets: ["s3", "example-server"],                                           add: 6,  change: 0, destroy: 0 },
    { id: "run-0033", cmd: "plan",    repo: "infrastructure",            branch: "release/2.1", date: ago(28800), duration: "29s",    status: "success", targets: ["dev", "staging", "prod"],                                         add: 0,  change: 0, destroy: 0 },
    { id: "run-0032", cmd: "destroy", repo: "terraform-up-and-running",  branch: "master",      date: ago(43200), duration: "18s",    status: "success", targets: ["example-server", "single-web-server"],                            add: 0,  change: 0, destroy: 3 }
  ];

  /* ---- state ------------------------------------------------------------- */
  var S = { view: "cards", filter: "all" };

  /* ---- helpers ----------------------------------------------------------- */
  function cmdBadge(cmd) {
    var c = cmd === "destroy" ? "red" : cmd === "apply" ? "green" : cmd === "plan" ? "blue" : "orange";
    return '<span class="badge ' + c + '">' + esc(cmd) + "</span>";
  }
  function statusIcon(st) { return st === "success" ? I.checkc : I.x; }

  function relTime(iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }

  function statSpan(v, sym) {
    var color = sym === "+" ? "var(--green)" : sym === "~" ? "var(--amber)" : "var(--red)";
    var col = v > 0 ? color : "var(--text-3)";
    return '<span style="color:' + col + '">' + sym + v + "</span>";
  }

  function filtered() {
    if (S.filter === "all") return REPORTS;
    return REPORTS.filter(function (r) { return r.cmd === S.filter; });
  }

  function reportUrl(cmd) {
    return (cmd === "destroy" ? "Destroy%20Report" : cmd === "apply" ? "Apply%20Report" : "Plan%20Report") + ".html";
  }

  /* ---- filters ----------------------------------------------------------- */
  function renderFilters() {
    var counts = { all: REPORTS.length, plan: 0, apply: 0, destroy: 0 };
    REPORTS.forEach(function (r) { counts[r.cmd] = (counts[r.cmd] || 0) + 1; });
    var filters = [
      { key: "all",     label: "All" },
      { key: "plan",    label: "Plan" },
      { key: "apply",   label: "Apply" },
      { key: "destroy", label: "Destroy" }
    ];
    $("#filters").innerHTML = filters.map(function (f) {
      return '<button class="rh-filter' + (S.filter === f.key ? " on" : "") + '" data-filter="' + f.key + '">' +
        f.label + ' <span class="cnt">' + counts[f.key] + "</span></button>";
    }).join("");
    document.querySelectorAll("[data-filter]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.filter = b.getAttribute("data-filter");
        renderFilters();
        renderReports();
      });
    });
  }

  /* ---- view toggle ------------------------------------------------------- */
  function renderViewToggle() {
    $("#viewToggle").innerHTML =
      '<button data-view="cards" class="' + (S.view === "cards" ? "on" : "") + '">' + I.grid + "Cards</button>" +
      '<button data-view="list" class="' + (S.view === "list" ? "on" : "") + '">' + I.list + "List</button>";
    document.querySelectorAll("[data-view]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.view = b.getAttribute("data-view");
        renderViewToggle();
        renderReports();
      });
    });
  }

  /* ---- cards view -------------------------------------------------------- */
  function renderCards(list) {
    return '<div class="rh-cards">' + list.map(function (r) {
      var tot = r.add + r.change + r.destroy || 1;
      var hasChanges = r.add + r.change + r.destroy > 0;
      var bar = hasChanges
        ? '<div class="rh-card-bar">' +
            '<i class="b-add" style="width:' + (r.add / tot * 100) + '%"></i>' +
            '<i class="b-chg" style="width:' + (r.change / tot * 100) + '%"></i>' +
            '<i class="b-del" style="width:' + (r.destroy / tot * 100) + '%"></i></div>'
        : '<div class="rh-card-bar"><i style="width:100%;background:var(--text-3);opacity:.2"></i></div>';
      var targets = r.targets.slice(0, 2).map(function (t) {
        return '<span class="tc">' + esc(t) + "</span>";
      }).join("") + (r.targets.length > 2 ? '<span class="tm">+' + (r.targets.length - 2) + "</span>" : "");
      return '<div class="rh-card" data-report="' + esc(r.id) + '" data-cmd="' + esc(r.cmd) + '">' +
        '<div class="rh-card-top">' +
          '<div style="display:flex;align-items:center;gap:8px">' + cmdBadge(r.cmd) + '<span class="rh-card-id">' + esc(r.id) + "</span></div>" +
          '<span class="rh-card-status ' + r.status + '">' + statusIcon(r.status) + esc(r.status) + "</span>" +
        "</div>" +
        '<div class="rh-card-repo">' +
          '<span class="rn">' + esc(r.repo) + "</span>" +
          '<span class="br">' + I.git + esc(r.branch) + "</span>" +
        "</div>" +
        bar +
        '<div class="rh-card-stats">' + statSpan(r.add, "+") + " " + statSpan(r.change, "~") + " " + statSpan(r.destroy, "-") +
          '<span class="rh-card-dur">' + I.clock + esc(r.duration) + "</span></div>" +
        '<div class="rh-card-meta">' +
          '<div class="rh-card-targets">' + targets + "</div>" +
          '<span class="rh-card-date">' + relTime(r.date) + "</span>" +
        "</div>" +
      "</div>";
    }).join("") + "</div>";
  }

  /* ---- list / table view ------------------------------------------------- */
  function renderTable(list) {
    var rows = list.map(function (r) {
      var tot = r.add + r.change + r.destroy || 1;
      var dist = '<span class="dist">' +
        '<i style="width:' + (r.add / tot * 100) + '%;background:var(--green)"></i>' +
        '<i style="width:' + (r.change / tot * 100) + '%;background:var(--amber)"></i>' +
        '<i style="width:' + (r.destroy / tot * 100) + '%;background:var(--red)"></i></span>';
      var chips = r.targets.slice(0, 2).map(function (t) {
        return '<span class="tgt-chip">' + esc(t) + "</span>";
      }).join("") + (r.targets.length > 2 ? '<span class="tgt-more">+' + (r.targets.length - 2) + "</span>" : "");
      return '<tr data-report="' + esc(r.id) + '" data-cmd="' + esc(r.cmd) + '">' +
        '<td><span class="run-id">' + esc(r.id) + "</span></td>" +
        "<td>" + cmdBadge(r.cmd) + "</td>" +
        '<td><span class="repo">' + esc(r.repo) + "</span></td>" +
        '<td><span class="branch">' + I.git + esc(r.branch) + "</span></td>" +
        '<td><span class="tgt-chips">' + chips + "</span></td>" +
        '<td class="num">' + statSpan(r.add, "+") + "</td>" +
        '<td class="num">' + statSpan(r.change, "~") + "</td>" +
        '<td class="num">' + statSpan(r.destroy, "-") + "</td>" +
        "<td>" + dist + "</td>" +
        '<td><span class="date">' + relTime(r.date) + "</span></td>" +
        '<td><span class="st ' + r.status + '">' + statusIcon(r.status) + esc(r.status) + "</span></td>" +
      "</tr>";
    }).join("");
    return '<div class="rh-table-wrap"><table class="rh-tbl">' +
      "<thead><tr><th>Run ID</th><th>Command</th><th>Repo</th><th>Branch</th><th>Targets</th>" +
      '<th class="num">Add</th><th class="num">Change</th><th class="num">Destroy</th>' +
      "<th>Distribution</th><th>Date</th><th>Status</th></tr></thead>" +
      "<tbody>" + rows + "</tbody></table></div>";
  }

  /* ---- render reports ---------------------------------------------------- */
  function renderReports() {
    var list = filtered();
    $("#reportCount").textContent = "(" + list.length + ")";
    if (list.length === 0) {
      $("#reportsList").innerHTML = '<div class="rh-empty">' + I.report + '<div class="t">No reports found</div><div>No reports match the selected filter.</div></div>';
      return;
    }
    $("#reportsList").innerHTML = S.view === "cards" ? renderCards(list) : renderTable(list);
    wireClicks();
  }

  function wireClicks() {
    document.querySelectorAll("[data-report]").forEach(function (el) {
      el.addEventListener("click", function () {
        location.href = reportUrl(el.getAttribute("data-cmd"));
      });
    });
  }

  /* ---- toast ------------------------------------------------------------- */
  var tt;
  function toast(m) {
    var el = $("#toast");
    el.innerHTML = I.check + esc(m);
    el.classList.add("show");
    clearTimeout(tt);
    tt = setTimeout(function () { el.classList.remove("show"); }, 2000);
  }

  /* ---- init -------------------------------------------------------------- */
  function init() {
    renderFilters();
    renderViewToggle();
    renderReports();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
