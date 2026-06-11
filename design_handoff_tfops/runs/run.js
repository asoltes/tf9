/* =========================================================================
   New run modal — interactive prototype logic
   ========================================================================= */
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var I = {
    plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    apply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l4 4L19 6"/></svg>',
    destroy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    init: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12l4-4m-4 4l-4-4"/><path d="M4 21h16"/></svg>',
    branch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 7.5-7.5M16 5l3 3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    seq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="5" rx="1"/><rect x="4" y="16" width="16" height="5" rx="1"/><path d="M12 8v4m0 0-2-2m2 2 2-2"/></svg>',
    par: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="15" y="4" width="6" height="16" rx="1"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    pull: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 21h16"/></svg>'
  };

  var COMMON = [
    { id: "init", desc: "Initialize directory", kind: "init" },
    { id: "plan", desc: "Preview changes", kind: "plan" },
    { id: "apply", desc: "Provision changes", kind: "apply" },
    { id: "destroy", desc: "Tear down resources", kind: "destroy" }
  ];
  var MORE = ["validate", "refresh", "state list", "output", "import", "taint", "untaint", "force-unlock"];

  var REPOS = [
    {
      name: "infrastructure", branch: "main", branches: ["main", "develop", "release/2.1"], behind: 0,
      groups: [
        { key: "environments", targets: [
          { name: "dev", dir: "environments/dev", profile: "company-dev", region: "eu-west-2" },
          { name: "staging", dir: "environments/staging", profile: "company-staging", region: "eu-west-2" },
          { name: "prod", dir: "environments/prod", profile: "company-prod", region: "eu-west-2", prod: true }
        ]},
        { key: "global", targets: [
          { name: "s3", dir: "global/s3", profile: "company-shared", region: "eu-west-2" },
          { name: "iam", dir: "global/iam", profile: "company-shared", region: "eu-west-2" }
        ]}
      ]
    },
    {
      name: "terraform-up-and-running", branch: "master", branches: ["master", "main"], behind: 2,
      groups: [
        { key: "chapter-2", targets: [
          { name: "example-server", dir: "chapter-2/example-server", profile: "default", region: "ap-southeast-1" },
          { name: "single-web-server", dir: "chapter-2/single-web-server", profile: "default", region: "ap-southeast-1" },
          { name: "webserver-cluster", dir: "chapter-2/webserver-cluster", profile: "default", region: "eu-west-2" }
        ]},
        { key: "chapter-3", targets: [
          { name: "s3", dir: "chapter-3/file-layout/global/s3", profile: "default", region: "ap-southeast-1" }
        ]}
      ]
    }
  ];

  var S = { repoIdx: 0, cmd: "plan", mode: "promotion", autoApprove: false, profile: "", extra: "", advOpen: false, confirm: false, groups: [] };
  function isForceUnlock() { return S.cmd === "force-unlock"; }
  function repo() { return REPOS[S.repoIdx]; }
  function envColor(t) { if (t.prod) return "#d91515"; var n = t.name.toLowerCase(); if (/stag|pre/.test(n)) return "#8d6605"; if (/global|shared|boot|s3|iam/.test(n)) return "#7d4bd1"; return "#037f0c"; }
  function isDestroy() { return S.cmd === "destroy"; }
  function isApply() { return S.cmd === "apply"; }
  function lockSequential() { return isApply() || isDestroy(); }

  function buildGroups() {
    var _ovr = {};
    try { _ovr = JSON.parse(localStorage.getItem("tfops-repo-overrides") || "{}"); } catch(e) {}
    S.groups = repo().groups.map(function (g) {
      return { key: g.key, collapsed: false,
        targets: g.targets
          .filter(function(t) { var k = repo().name + ":" + t.name; return !(_ovr[k] && _ovr[k].disabled); })
          .map(function (t) { return Object.assign({}, t, { checked: true, lockId: "" }); })
      };
    }).filter(function(g) { return g.targets.length > 0; });
  }
  function checkedTargets() {
    var out = [];
    S.groups.forEach(function (g) { g.targets.forEach(function (t) { if (t.checked) out.push(t); }); });
    return out;
  }
  function totalTargets() { return S.groups.reduce(function (n, g) { return n + g.targets.length; }, 0); }

  /* ---- command section --------------------------------------------------- */
  function renderCmd() {
    var chips = COMMON.map(function (c) {
      return '<button class="cmd-chip ' + c.kind + (S.cmd === c.id ? " on" : "") + '" data-cmd="' + c.id + '">' +
        '<span class="ic">' + I[c.id] + "</span>" +
        '<span><span class="cc-t">' + c.id + '</span><span class="cc-d">' + c.desc + "</span></span></button>";
    }).join("");
    var isMore = COMMON.every(function (c) { return c.id !== S.cmd; });
    var opts = MORE.map(function (m) { return '<option value="' + m + '"' + (S.cmd === m ? " selected" : "") + ">" + m + "</option>"; }).join("");
    chips += '<div class="cmd-more"><select class="sel" id="cmdMore"><option value="" ' + (isMore ? "" : "selected") + ' disabled>More commands…</option>' + opts + "</select></div>";
    $("#cmdRow").innerHTML = chips;
    document.querySelectorAll("[data-cmd]").forEach(function (b) { b.addEventListener("click", function () { setCmd(b.getAttribute("data-cmd")); }); });
    $("#cmdMore").addEventListener("change", function () { if (this.value) setCmd(this.value); });
  }
  function setCmd(id) {
    S.cmd = id;
    if (lockSequential()) S.mode = "promotion";
    if (!isApply()) S.autoApprove = false;
    S.confirm = false;
    renderAll();
  }

  /* ---- repo + branch ----------------------------------------------------- */
  function renderRepoBranch() {
    var r = repo();
    var repoOpts = REPOS.map(function (x, i) { return '<option value="' + i + '"' + (i === S.repoIdx ? " selected" : "") + ">" + esc(x.name) + "</option>"; }).join("");
    var brOpts = r.branches.map(function (b) { return '<option' + (b === r.branch ? " selected" : "") + ">" + esc(b) + "</option>"; }).join("");
    var gitPill = r.behind > 0
      ? '<span class="git-pill behind">' + I.warn + r.behind + " behind origin</span> <button class=\"btn btn-normal btn-sm\" id=\"pullBtn\">" + I.pull + "Pull</button>"
      : '<span class="git-pill ok">' + I.check + "Up to date</span>";
    $("#repoBranch").innerHTML =
      '<div class="field-row">' +
        '<div><label class="field-label">Repository</label><select class="sel" id="repoSel">' + repoOpts + "</select>" +
          '<div class="field-hint">' + r.groups.length + " pipeline" + (r.groups.length === 1 ? "" : "s") + " · " + totalTargets() + " targets</div></div>" +
        '<div><label class="field-label">Branch</label><div class="branch-row"><select class="sel" id="brSel">' + brOpts + "</select></div>" +
          '<div style="display:flex;align-items:center;gap:8px">' + gitPill + "</div></div>" +
      "</div>";
    $("#repoSel").addEventListener("change", function () { S.repoIdx = +this.value; buildGroups(); S.confirm = false; renderAll(); });
    $("#brSel").addEventListener("change", function () { repo().branch = this.value; renderSummary(); });
    var pb = $("#pullBtn"); if (pb) pb.addEventListener("click", function () { repo().behind = 0; toast("Pulled latest from origin"); renderRepoBranch(); renderSummary(); });
  }

  /* ---- run mode ---------------------------------------------------------- */
  function renderMode() {
    var locked = lockSequential();
    $("#modeTiles").innerHTML =
      '<div class="tile' + (S.mode === "promotion" ? " on" : "") + '" data-mode="promotion">' +
        '<span class="ti-ic">' + I.seq + '</span><span><span class="ti-t">Promotion</span><span class="ti-d">Sequential — runs targets in order, stops on first failure.</span></span></div>' +
      '<div class="tile' + (S.mode === "parallel" ? " on" : "") + (locked ? " disabled" : "") + '" data-mode="parallel">' +
        '<span class="ti-ic">' + I.par + '</span><span><span class="ti-t">Parallel</span><span class="ti-d">Up to four targets at once.' + (locked ? " Not allowed for " + S.cmd + "." : "") + '</span></span>' +
        (locked ? '<span class="ti-lock">sequential only</span>' : "") + "</div>";
    document.querySelectorAll("[data-mode]").forEach(function (t) {
      t.addEventListener("click", function () {
        var m = t.getAttribute("data-mode");
        if (m === "parallel" && lockSequential()) return;
        S.mode = m; S.confirm = false; renderMode(); renderTargets(); renderSummary();
      });
    });
  }

  /* ---- targets ----------------------------------------------------------- */
  function setGroupCheck(gi, val) { S.groups[gi].targets.forEach(function (t) { t.checked = val; }); }
  function renderTargets() {
    var seq = S.mode === "promotion";
    var html = S.groups.map(function (g, gi) {
      var n = g.targets.length, c = g.targets.filter(function (t) { return t.checked; }).length;
      var cls = c === 0 ? "" : c === n ? "on" : "ind";
      var rows = g.targets.map(function (t, ti) {
        var grip = seq ? '<span class="grip" data-grip="' + gi + ":" + ti + '"><span class="col"><i></i><i></i><i></i></span><span class="col"><i></i><i></i><i></i></span></span>' : "";
        var ord = seq ? '<span class="ord">' + (ti + 1) + "</span>" : "";
        var lockField = "";
        if (isForceUnlock() && t.checked) {
          lockField = '<div style="width:100%;padding:6px 0 2px 28px;display:flex;align-items:center;gap:8px">' +
            '<span style="display:flex;color:var(--text-3);flex-shrink:0;width:14px;height:14px">' + I.key + '</span>' +
            '<input class="inp mono" data-lockid="' + gi + ':' + ti + '" placeholder="Lock ID for ' + esc(t.name) + '" value="' + esc(t.lockId || '') + '" style="height:28px;font-size:12px;flex:1">' +
          '</div>';
        }
        return '<div class="tgt' + (t.checked ? "" : " off") + '" data-ti="' + gi + ":" + ti + '"' + (isForceUnlock() ? ' style="flex-wrap:wrap"' : '') + '>' +
          '<span class="cbox ' + (t.checked ? "on" : "") + '" data-check="' + gi + ":" + ti + '">' + I.check + "</span>" +
          ord +
          '<span class="nm"><span class="st-dot" style="background:' + envColor(t) + '"></span>' + esc(t.name) + (t.prod ? ' <span class="prod-tag">prod</span>' : "") + "</span>" +
          '<span class="dir">' + esc(t.dir) + "</span>" +
          '<span class="sp"></span>' + grip + lockField + "</div>";
      }).join("");
      return '<div class="tgroup' + (g.collapsed ? " collapsed" : "") + '" data-gi="' + gi + '">' +
        '<div class="tgroup-head">' +
          '<span class="cbox ' + cls + '" data-gcheck="' + gi + '">' + I.check + "</span>" +
          '<span class="gfolder">' + I.folder + "</span>" +
          '<span class="gname">' + esc(g.key) + "/</span>" +
          '<span class="gcount">' + c + "/" + n + " selected</span>" +
          '<span class="chev" data-collapse="' + gi + '">' + I.chev + "</span>" +
        "</div>" +
        '<div class="tgroup-body" data-body="' + gi + '">' + rows + "</div>" +
      "</div>";
    }).join("");
    $("#tgtList").innerHTML = html;
    wireTargets();
  }
  function wireTargets() {
    document.querySelectorAll("[data-check]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); var p = b.getAttribute("data-check").split(":"); var t = S.groups[p[0]].targets[p[1]]; t.checked = !t.checked; renderTargets(); renderSummary(); });
    });
    document.querySelectorAll("[data-gcheck]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); var gi = +b.getAttribute("data-gcheck"); var all = S.groups[gi].targets.every(function (t) { return t.checked; }); setGroupCheck(gi, !all); renderTargets(); renderSummary(); });
    });
    document.querySelectorAll("[data-collapse]").forEach(function (b) {
      b.addEventListener("click", function (e) { e.stopPropagation(); var gi = +b.getAttribute("data-collapse"); S.groups[gi].collapsed = !S.groups[gi].collapsed; renderTargets(); });
    });
    document.querySelectorAll("[data-grip]").forEach(function (g) {
      g.addEventListener("pointerdown", function (e) { var p = g.getAttribute("data-grip").split(":"); startDrag(e, +p[0], +p[1]); });
    });
    document.querySelectorAll("[data-lockid]").forEach(function (inp) {
      inp.addEventListener("input", function () { var p = inp.getAttribute("data-lockid").split(":"); S.groups[p[0]].targets[p[1]].lockId = inp.value; renderSummary(); });
      inp.addEventListener("click", function (e) { e.stopPropagation(); });
    });
  }

  /* ---- vertical drag within a group -------------------------------------- */
  var drag = null;
  function startDrag(e, gi, ti) {
    e.preventDefault();
    var row = e.target.closest(".tgt");
    var rect = row.getBoundingClientRect();
    var clone = row.cloneNode(true);
    clone.classList.add("dragging");
    clone.style.position = "fixed"; clone.style.left = rect.left + "px"; clone.style.top = rect.top + "px";
    clone.style.width = rect.width + "px"; clone.style.margin = "0"; clone.style.pointerEvents = "none";
    document.body.appendChild(clone);
    row.classList.add("placeholder");
    drag = { gi: gi, pos: ti, offX: e.clientX - rect.left, offY: e.clientY - rect.top, clone: clone };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onDrag);
    window.addEventListener("pointerup", endDrag);
  }
  function onDrag(e) {
    if (!drag) return;
    drag.clone.style.left = (e.clientX - drag.offX) + "px";
    drag.clone.style.top = (e.clientY - drag.offY) + "px";
    var body = $('[data-body="' + drag.gi + '"]');
    if (!body) return;
    var rows = Array.prototype.slice.call(body.querySelectorAll(".tgt"));
    var to = rows.length - 1;
    for (var i = 0; i < rows.length; i++) { var rc = rows[i].getBoundingClientRect(); if (e.clientY < rc.top + rc.height / 2) { to = i; break; } }
    if (to !== drag.pos) {
      var arr = S.groups[drag.gi].targets;
      var x = arr.splice(drag.pos, 1)[0]; arr.splice(to, 0, x);
      drag.pos = to;
      renderTargets(); renderSummary();
      var nb = $('[data-body="' + drag.gi + '"]');
      var nr = nb ? nb.querySelectorAll(".tgt") : [];
      if (nr[to]) nr[to].classList.add("placeholder");
    }
  }
  function endDrag() {
    if (!drag) return;
    document.body.removeChild(drag.clone); document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onDrag); window.removeEventListener("pointerup", endDrag);
    drag = null; renderTargets(); renderSummary();
  }

  /* ---- toolbar quick selects --------------------------------------------- */
  function wireToolbar() {
    $("#selAll").addEventListener("click", function () { S.groups.forEach(function (g, gi) { setGroupCheck(gi, true); }); renderTargets(); renderSummary(); });
    $("#selNone").addEventListener("click", function () { S.groups.forEach(function (g, gi) { setGroupCheck(gi, false); }); renderTargets(); renderSummary(); });
    $("#skipProd").addEventListener("click", function () { S.groups.forEach(function (g) { g.targets.forEach(function (t) { t.checked = !t.prod; }); }); renderTargets(); renderSummary(); });
  }

  /* ---- danger / auto-approve --------------------------------------------- */
  function renderDanger() {
    var host = $("#dangerZone");
    var out = "";
    if (isApply()) {
      out += '<div class="aa-control' + (S.autoApprove ? " on" : "") + '" id="aaCtl">' +
        '<span class="switch' + (S.autoApprove ? " on" : "") + '"></span>' +
        '<span><span class="aa-t">--auto-approve</span><span class="aa-d">Skip the interactive approval prompt before applying.</span></span></div>';
    }
    if (isDestroy()) {
      out += '<div class="alert danger" style="margin:0">' + I.warn + '<div><div class="a-title">Destroy is irreversible</div>This permanently tears down all selected resources. You\u2019ll confirm again before it runs.</div></div>';
    }
    host.innerHTML = out;
    host.style.display = out ? "" : "none";
    var aa = $("#aaCtl"); if (aa) aa.addEventListener("click", function () { S.autoApprove = !S.autoApprove; renderDanger(); renderSummary(); });
  }

  /* ---- advanced ---------------------------------------------------------- */
  function renderAdvanced() {
    $("#advToggle").className = "adv-toggle" + (S.advOpen ? " open" : "");
    $("#advBody").style.display = S.advOpen ? "" : "none";
  }

  /* ---- summary rail ------------------------------------------------------ */
  function cliPreview() {
    var checked = checkedTargets();
    var positional = ["plan", "apply", "destroy"].indexOf(S.cmd) !== -1;
    var parts = ['<span class="tok-cmd">tfops ' + esc(S.cmd) + "</span>"];
    if (checked.length && checked.length !== totalTargets()) {
      var names = checked.map(function (t) { return t.name; });
      if (positional) parts.push('<span class="tok-val">' + names.join(" ") + "</span>");
      else parts.push('<span class="tok-flag">--filter</span> <span class="tok-val">' + names.join(",") + "</span>");
    }
    parts.push('<span class="tok-flag">-r</span> <span class="tok-val">' + esc(repo().name) + "</span>");
    if (S.mode === "parallel") parts.push('<span class="tok-flag">--parallel</span>');
    if (isApply() && S.autoApprove) parts.push('<span class="tok-flag">--auto-approve</span>');
    if (S.profile.trim()) parts.push('<span class="tok-flag">--profile</span> <span class="tok-val">' + esc(S.profile.trim()) + "</span>");
    if (S.extra.trim()) parts.push('<span class="tok-val">' + esc(S.extra.trim()) + "</span>");
    if (isForceUnlock()) { var lids = checkedTargets().filter(function (t) { return t.lockId && t.lockId.trim(); }).map(function (t) { return t.name + ":" + t.lockId.trim(); }); if (lids.length) parts.push('<span class="tok-flag">--lock-ids</span> <span class="tok-val">' + esc(lids.join(",")) + "</span>"); }
    return parts.join(" ");
  }
  function plainCli() { return $("#cliText").textContent; }
  function renderSummary() {
    var checked = checkedTargets();
    var seq = S.mode === "promotion";
    var pillKind = isApply() ? 'style="background:#d4f7d9;color:#04611b;border-color:#a7e3b4"' : isDestroy() ? 'style="background:#ffd9d9;color:#8b1414;border-color:#f3b7b2"' : "";
    var exec = checked.length === 0
      ? '<div class="exec-empty">No targets selected</div>'
      : checked.map(function (t, i) {
          var conn = i && seq ? '<div class="exec-conn">' + I.arrow + "</div>" : "";
          return conn + '<div class="exec-item' + (seq ? "" : " par") + '"><span class="en">' + (seq ? i + 1 : "•") + '</span><span class="nm">' + esc(t.name) + "</span></div>";
        }).join("");
    var warn = "";
    var prodSel = checked.some(function (t) { return t.prod; });
    if (isDestroy()) warn = '<div class="sum-warn red">' + I.warn + "Destroy removes infrastructure permanently.</div>";
    else if (prodSel && isApply()) warn = '<div class="sum-warn amber">' + I.warn + "Production target selected — changes apply to prod.</div>";
    else if (S.mode === "parallel") warn = '<div class="sum-warn amber">' + I.warn + "Failures won\u2019t stop targets already running.</div>";

    $("#summary").innerHTML =
      '<div class="sum-title">Run summary</div>' +
      '<div class="sum-cmd"><span class="pill" ' + pillKind + ">" + esc(S.cmd) + "</span>" +
        '<span style="font-size:12.5px;color:var(--text-2)">' + (seq ? "Promotion" : "Parallel") + "</span></div>" +
      '<div class="sum-row"><span class="k">Repo</span><span class="v mono">' + esc(repo().name) + "</span></div>" +
      '<div class="sum-row"><span class="k">Branch</span><span class="v mono">' + esc(repo().branch) + "</span></div>" +
      '<div class="sum-row"><span class="k">Targets</span><span class="v">' + checked.length + " of " + totalTargets() + "</span></div>" +
      '<div class="exec-box"><div class="eh">' + (seq ? I.seq + "Execution order" : I.par + "Runs concurrently") + '</div><div class="exec-list">' + exec + "</div></div>" +
      '<div class="cli-box"><div class="eh">Command</div><div class="cli"><span id="cliText">' + cliPreview() + '</span><button class="cli-copy" id="cliCopy" title="Copy">' + I.copy + "</button></div></div>" +
      warn;
    var cc = $("#cliCopy");
    if (cc) cc.addEventListener("click", function () {
      var tmp = document.createElement("div"); tmp.innerHTML = cliPreview(); copy(tmp.textContent, "Command copied");
    });
    renderFooter();
  }

  /* ---- footer ------------------------------------------------------------ */
  function renderFooter() {
    var checked = checkedTargets();
    var n = checked.length;
    var foot = $("#rmFoot");
    if (S.confirm) {
      var red = isDestroy();
      foot.innerHTML = '<div class="confirm-bar"><span class="ct' + (red ? " red" : "") + '">' +
        (red ? "Destroy " + n + " target" + (n === 1 ? "" : "s") + "? This cannot be undone."
             : S.mode === "parallel" ? "Run " + n + " target" + (n === 1 ? "" : "s") + " with up to 4 concurrent workers?"
             : "Apply to " + n + " target" + (n === 1 ? "" : "s") + ", including production?") +
        '</span><div class="right"><button class="btn btn-normal" id="cfgBack">Back</button>' +
        '<button class="btn ' + (red ? "btn-danger" : "btn-primary") + '" id="cfgGo">' +
        (red ? "Yes, destroy" : "Confirm run") + "</button></div></div>";
      $("#cfgBack").addEventListener("click", function () { S.confirm = false; renderFooter(); });
      $("#cfgGo").addEventListener("click", doRun);
      return;
    }
    var label = "Run " + S.cmd;
    var cls = isDestroy() ? "btn-danger" : "btn-primary";
    foot.innerHTML =
      '<div class="left">' + (n ? I.info + n + " target" + (n === 1 ? "" : "s") + " selected" : '<span style="color:var(--red)">Select at least one target</span>') + "</div>" +
      '<div class="right"><button class="btn btn-normal" id="cancelBtn">Cancel</button>' +
      '<button class="btn ' + cls + '" id="runBtn"' + (n === 0 ? " disabled" : "") + ">" + esc(label) + "</button></div>";
    $("#cancelBtn").addEventListener("click", function () { toast("Cancelled"); });
    $("#runBtn").addEventListener("click", onRun);
  }
  function onRun() {
    if (checkedTargets().length === 0) return;
    if (isDestroy() || S.mode === "parallel" || (isApply() && checkedTargets().some(function (t) { return t.prod; }))) {
      S.confirm = true; renderFooter();
    } else doRun();
  }
  function doRun() {
    S.confirm = false; renderFooter();
    toast(S.cmd + " run started — " + checkedTargets().length + " target" + (checkedTargets().length === 1 ? "" : "s"));
  }

  /* ---- toast / copy ------------------------------------------------------ */
  var tt;
  function toast(m) { var el = $("#toast"); el.innerHTML = I.check + esc(m); el.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove("show"); }, 2000); }
  function copy(text, msg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { toast(msg); }, fb); else fb();
    function fb() { var ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); toast(msg); } catch (e) {} document.body.removeChild(ta); }
  }

  /* ---- orchestration ----------------------------------------------------- */
  function renderAll() { renderCmd(); renderRepoBranch(); renderMode(); renderTargets(); renderDanger(); renderAdvanced(); renderSummary(); }

  function init() {
    buildGroups();
    renderAll();
    wireToolbar();
    $("#advToggle").addEventListener("click", function () { S.advOpen = !S.advOpen; renderAdvanced(); });
    $("#profileInp").addEventListener("input", function () { S.profile = this.value; renderSummary(); });
    $("#extraInp").addEventListener("input", function () { S.extra = this.value; renderSummary(); });
    $("#closeBtn").addEventListener("click", function () { toast("Closed"); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
