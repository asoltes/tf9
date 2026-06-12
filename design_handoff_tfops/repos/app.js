/* =========================================================================
   tf9 · Repositories — interactive Cloudscape prototype
   Promotion pipeline (drag-to-reorder) + repo list + browse.
   ========================================================================= */
(function () {
  "use strict";

  /* ---- icons ------------------------------------------------------------- */
  var I = {
    aws: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.8 9.4c0 .3 0 .5.1.7l.4.8c0 .1.1.2.1.2 0 .1-.1.2-.2.3l-.6.4h-.2c-.1 0-.2 0-.3-.1-.1-.1-.3-.3-.4-.5l-.3-.6c-.7.9-1.7 1.3-2.8 1.3-.8 0-1.4-.2-1.9-.7-.5-.4-.7-1-.7-1.8 0-.8.3-1.4.9-1.9.6-.5 1.4-.7 2.4-.7.3 0 .7 0 1 .1l1.1.2v-.7c0-.7-.1-1.2-.4-1.4-.3-.3-.8-.4-1.5-.4-.3 0-.7 0-1 .1l-1.1.4h-.3c-.1 0-.2-.1-.2-.3v-.5c0-.1 0-.2.1-.3l.3-.2c.3-.2.7-.3 1.2-.4.5-.1 1-.2 1.5-.2 1.1 0 2 .3 2.5.8.5.5.8 1.3.8 2.3v3zM3.7 10.6c.3 0 .6-.1 1-.2.3-.1.6-.3.9-.6.2-.2.3-.4.3-.6 0-.2.1-.5.1-.9v-.4c-.3-.1-.6-.1-.9-.2h-.9c-.6 0-1.1.1-1.4.4-.3.2-.5.6-.5 1 0 .4.1.7.3.9.2.2.5.3 1 .3zm6.1.8c-.2 0-.3 0-.4-.1-.1-.1-.2-.2-.2-.4L7.3 4.2c-.1-.2-.1-.3-.1-.4 0-.2.1-.2.2-.2h1c.2 0 .3 0 .4.1l.2.4 1.3 5.2 1.2-5.2c0-.2.1-.3.2-.4.1-.1.2-.1.4-.1h.8c.2 0 .3 0 .4.1l.2.4 1.2 5.3 1.4-5.3c.1-.2.1-.3.2-.4.1-.1.2-.1.4-.1h.9c.1 0 .2.1.2.2v.2l-.1.3-1.9 6.6c0 .2-.1.3-.2.4-.1.1-.2.1-.4.1h-.9c-.2 0-.3 0-.4-.1l-.2-.4-1.2-5-1.2 5c0 .2-.1.3-.2.4-.1.1-.2.1-.4.1h-.8zm9.8.3c-.5 0-1-.1-1.5-.2-.4-.1-.7-.2-.9-.4-.1-.1-.2-.2-.2-.3v-.5c0-.2.1-.3.2-.3h.2l.2.1c.3.1.6.2.9.3.3.1.7.1 1 .1.5 0 .9-.1 1.2-.3.3-.2.4-.4.4-.8 0-.2-.1-.4-.2-.6-.2-.1-.5-.3-.9-.4l-1.3-.4c-.7-.2-1.1-.5-1.4-.9-.3-.4-.5-.8-.5-1.3 0-.4.1-.7.3-1 .2-.3.4-.5.7-.7.3-.2.6-.3 1-.4.4-.1.7-.1 1.1-.1.2 0 .4 0 .6.1l.6.1.5.2c.1.1.2.1.3.2.1.1.1.2.1.3v.4c0 .2-.1.3-.2.3-.1 0-.2 0-.4-.1-.5-.2-1-.3-1.6-.3-.5 0-.8.1-1.1.2-.2.2-.4.4-.4.7 0 .2.1.4.3.6.2.1.5.3 1 .4l1.2.4c.6.2 1.1.5 1.4.8.3.4.4.8.4 1.2 0 .4-.1.7-.2 1-.2.3-.4.6-.7.8-.3.2-.6.4-1 .5-.5.1-.9.2-1.4.2z"/></svg>',
    repo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="m10.5 12.5 7.5-7.5M16 5l3 3M19.5 8.5 22 6"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>',
    id: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="8" cy="12" r="2.2"/><path d="M13 10h5M13 14h4"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    checkc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 15.5 9.5"/></svg>',
    folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
    flow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="9" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M9 12h3M12 6h3M12 18h3M12 6v12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
    up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
    down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };

  /* ---- data -------------------------------------------------------------- */
  var PROFILES = ["company-dev", "company-staging", "company-prod", "company-shared", "default"];
  var REGIONS = ["eu-west-2", "eu-west-1", "us-east-1", "us-west-2", "ap-southeast-1"];

  var REPOS = [
    {
      name: "infrastructure",
      path: "/Users/andres/src/infrastructure",
      targets: [
        { name: "bootstrap", directory: "global/s3", aws_profile: "company-shared", account_id: "100000000001", region: "eu-west-2", disabled: false },
        { name: "dev", directory: "environments/dev", aws_profile: "company-dev", account_id: "111111111111", region: "eu-west-2", disabled: false },
        { name: "staging", directory: "environments/staging", aws_profile: "company-staging", account_id: "222222222222", region: "eu-west-2", disabled: false },
        { name: "prod", directory: "environments/prod", aws_profile: "company-prod", account_id: "333333333333", region: "eu-west-2", disabled: false, gated: true }
      ],
      tree: {
        "": [
          { name: "environments", isDir: true, hasTf: false },
          { name: "global", isDir: true, hasTf: false },
          { name: "modules", isDir: true, hasTf: false }
        ],
        "environments": [
          { name: "dev", isDir: true, hasTf: true },
          { name: "staging", isDir: true, hasTf: true },
          { name: "prod", isDir: true, hasTf: true },
          { name: "qa", isDir: true, hasTf: true }
        ],
        "global": [
          { name: "s3", isDir: true, hasTf: true },
          { name: "iam", isDir: true, hasTf: true }
        ],
        "modules": [
          { name: "vpc", isDir: true, hasTf: false },
          { name: "asg", isDir: true, hasTf: false }
        ]
      }
    },
    {
      name: "terraform-up-and-running",
      path: "/Users/andres/src/terraform-up-and-running",
      targets: [
        { name: "s3", directory: "chapter-3/file-layout/global/s3", aws_profile: "default", account_id: "", region: "ap-southeast-1", disabled: false },
        { name: "example-server", directory: "chapter-2/example-server", aws_profile: "default", account_id: "", region: "ap-southeast-1", disabled: false },
        { name: "single-web-server", directory: "chapter-2/single-web-server", aws_profile: "default", account_id: "", region: "ap-southeast-1", disabled: true },
        { name: "webserver-cluster", directory: "chapter-2/webserver-cluster", aws_profile: "default", account_id: "", region: "eu-west-2", disabled: false }
      ],
      tree: {
        "": [
          { name: "chapter-2", isDir: true, hasTf: false },
          { name: "chapter-3", isDir: true, hasTf: false }
        ],
        "chapter-2": [
          { name: "example-server", isDir: true, hasTf: true },
          { name: "single-web-server", isDir: true, hasTf: true },
          { name: "webserver-cluster", isDir: true, hasTf: true }
        ],
        "chapter-3": [
          { name: "file-layout", isDir: true, hasTf: false }
        ]
      }
    }
  ];

  /* ---- state ------------------------------------------------------------- */
  var S = {
    selected: "infrastructure",
    view: "pipeline",          // 'pipeline' | 'table'
    browsePath: "",
    editIdx: -1,
    addPickProfile: ""
  };
  function repo() { return REPOS.find(function (r) { return r.name === S.selected; }); }
  function $(s, r) { return (r || document).querySelector(s); }

  /* ---- helpers ----------------------------------------------------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function envColor(t) {
    if (t.disabled) return "#8b97a3";
    var n = t.name.toLowerCase();
    if (/prod/.test(n)) return "#d91515";
    if (/stag|pre/.test(n)) return "#8d6605";
    if (/boot|global|shared/.test(n)) return "#7d4bd1";
    return "#037f0c";
  }
  function arrayMove(a, from, to) { var x = a.splice(from, 1)[0]; a.splice(to, 0, x); return a; }
  function activeTargets(r) { return r.targets.filter(function (t) { return !t.disabled; }); }

  /* ---- localStorage: disabled + group overrides ------------------------- */
  var OVR_KEY = "tf9-repo-overrides";
  function saveOverrides() {
    try {
      var d = {};
      REPOS.forEach(function(r) { r.targets.forEach(function(t) { d[r.name + ":" + t.name] = { disabled: !!t.disabled, group: t.group || "" }; }); });
      localStorage.setItem(OVR_KEY, JSON.stringify(d));
    } catch(e) {}
  }
  function loadOverrides() {
    try {
      var d = JSON.parse(localStorage.getItem(OVR_KEY) || "{}");
      REPOS.forEach(function(r) { r.targets.forEach(function(t) { var k = r.name + ":" + t.name; if (!d[k]) return; if (d[k].disabled !== undefined) t.disabled = d[k].disabled; if (d[k].group) t.group = d[k].group; else delete t.group; }); });
    } catch(e) {}
  }

  /* group targets by their TOP-LEVEL directory — each group is its own pipeline */
  function groupKey(t) { return t.group || (t.directory || "").split("/")[0] || "(root)"; }
  function deriveGroups(r) {
    var order = [], map = {};
    r.targets.forEach(function (t, gi) {
      var k = groupKey(t);
      if (!map[k]) { map[k] = { key: k, idxs: [] }; order.push(map[k]); }
      map[k].idxs.push(gi);
    });
    return order;
  }
  /* reorder one item within a group, writing back into the flat targets array
     so the group keeps occupying the same global slots */
  function reorderWithinGroup(r, key, fromPos, toPos) {
    var g = deriveGroups(r).find(function (x) { return x.key === key; });
    if (!g) return;
    var arr = g.idxs.map(function (i) { return r.targets[i]; });
    arrayMove(arr, fromPos, toPos);
    g.idxs.forEach(function (slot, p) { r.targets[slot] = arr[p]; });
  }

  /* ---- repo table -------------------------------------------------------- */
  function renderRepoTable() {
    var rows = REPOS.map(function (r) {
      var act = activeTargets(r).length;
      var groups = deriveGroups(r);
      var preview = groups.map(function (g, gi) {
        var dots = g.idxs.map(function (idx) {
          var t = r.targets[idx];
          return '<i class="' + (t.disabled ? "off" : "") + '" title="' + esc(t.name) + '"></i>';
        }).join('<span class="ar">' + I.arrow + "</span>");
        return (gi ? '<span style="width:9px"></span>' : "") + dots;
      }).join("");
      var profs = Array.from(new Set(r.targets.map(function (t) { return t.aws_profile; }))).slice(0, 3);
      var sel = r.name === S.selected;
      return '<tr class="selectable' + (sel ? " selected" : "") + '" data-repo="' + esc(r.name) + '">' +
        '<td style="width:34px"><span class="radio' + (sel ? " on" : "") + '"></span></td>' +
        '<td><div class="cell-name">' + I.repo + esc(r.name) + "</div>" +
          '<div class="cell-sub mono">' + esc(r.path) + "</div></td>" +
        '<td><div class="mini-pipe">' + preview + "</div>" +
          '<div class="cell-sub">' + groups.length + " pipeline" + (groups.length === 1 ? "" : "s") + " · " + r.targets.length + " stage" + (r.targets.length === 1 ? "" : "s") + " · " + act + " enabled</div></td>" +
        "<td><div class=\"chips\">" + profs.map(function (p) { return '<span class="badge">' + I.key + esc(p) + "</span>"; }).join("") + (act ? "" : "") + "</div></td>" +
        '<td style="text-align:right;width:170px"><button class="btn btn-normal btn-sm" data-config="' + esc(r.name) + '">Configure</button></td>' +
      "</tr>";
    }).join("");
    $("#repoTable").innerHTML =
      "<thead><tr><th></th><th>Repository</th><th>Promotion pipeline</th><th>AWS profiles</th><th></th></tr></thead><tbody>" + rows + "</tbody>";
    $("#repoCount").textContent = "(" + REPOS.length + ")";
    document.querySelectorAll("#repoTable tr[data-repo]").forEach(function (tr) {
      tr.addEventListener("click", function () { selectRepo(tr.getAttribute("data-repo")); });
    });
  }
  function selectRepo(name) {
    S.selected = name; S.browsePath = ""; S.view = "pipeline";
    renderRepoTable(); renderConfig();
    $("#cfgSection").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  /* ---- pipeline (one per top-level directory group) ---------------------- */
  function stageCard(t, idx, gpos) {
    var col = envColor(t);
    var leaf = t.directory.split("/").slice(1).join("/") || t.directory;
    var meta =
      '<div class="row"><span title="AWS profile">' + I.key + '</span><span class="v">' + esc(t.aws_profile || "—") + "</span></div>" +
      '<div class="row"><span title="Region">' + I.globe + '</span><span class="v">' + esc(t.region || "default region") + "</span></div>" +
      '<div class="row"><span title="Account ID">' + I.id + '</span><span class="v ' + (t.account_id ? "mono" : "muted") + '">' + esc(t.account_id || "any account") + "</span></div>";
    var grip = '<span class="stage-grip" data-grip="' + idx + '" title="Drag to reorder within this pipeline"><span class="col"><i></i><i></i><i></i></span><span class="col"><i></i><i></i><i></i></span></span>';
    return '<div class="stage' + (t.disabled ? " disabled" : "") + '" data-idx="' + idx + '" data-gpos="' + gpos + '">' +
      '<div class="stage-top"><span class="order-badge">' + (gpos + 1) + "</span>" + grip + "</div>" +
      '<div class="stage-name"><span class="st-dot" style="background:' + col + '"></span>' + esc(t.name) + "</div>" +
      '<div class="stage-dir">' + esc(leaf) + "</div>" +
      '<div class="stage-meta">' + meta + "</div>" +
      '<div class="stage-foot">' +
        '<span class="switch-wrap"><span class="switch' + (t.disabled ? "" : " on") + '" data-toggle="' + idx + '"></span>' + (t.disabled ? "Disabled" : "Enabled") + "</span>" +
        (t.gated ? '<span class="gate" title="Manual approval before this stage">' + I.lock + "Approval</span>" : '<button class="btn btn-icon" data-edit="' + idx + '" title="Edit stage" style="width:28px;height:28px">' + I.edit + "</button>") +
      "</div>" +
    "</div>";
  }
  function groupSeq(r, g) {
    return g.idxs.map(function (i) {
      var t = r.targets[i];
      return '<span class="s-node' + (t.disabled ? " off" : "") + '">' + esc(t.name) + "</span>";
    }).join('<span>' + I.arrow + "</span>");
  }
  function renderPipeline() {
    var r = repo();
    var host = $("#pipeline");
    if (!r.targets.length) {
      host.innerHTML = '<div class="pipe-empty">' + I.flow + '<div class="t">No pipelines yet</div><div>Add a Terraform directory from the browser below. Each top-level directory becomes its own promotion pipeline.</div></div>';
      return;
    }
    var groups = deriveGroups(r);
    host.innerHTML = groups.map(function (g) {
      var act = g.idxs.filter(function (i) { return !r.targets[i].disabled; }).length;
      var cards = [];
      g.idxs.forEach(function (gi, pos) {
        if (pos) cards.push('<div class="conn"><div class="line">' + I.arrow + '</div><div class="lbl">then</div></div>');
        cards.push(stageCard(r.targets[gi], gi, pos));
      });
      cards.push('<div class="conn" style="width:26px"><div class="line"></div></div>');
      cards.push('<button class="add-stage" data-addgroup="' + esc(g.key) + '"><span class="plus">' + I.plus + "</span>Add stage</button>");
      return '<div class="group">' +
        '<div class="group-head">' +
          '<div class="group-title"><span class="gfolder">' + I.folder + "</span>" +
            '<span class="path">' + esc(g.key) + "/</span>" +
            '<span class="gsub">' + g.idxs.length + " stage" + (g.idxs.length === 1 ? "" : "s") + " · " + act + " enabled</span></div>" +
          '<div class="group-actions"><span class="seq-summary">' + groupSeq(r, g) + "</span></div>" +
        "</div>" +
        '<div class="pipe-scroll"><div class="pipeline" data-gk="' + esc(g.key) + '">' + cards.join("") + "</div></div>" +
      "</div>";
    }).join("");
    wirePipeline();
  }
  function wirePipeline() {
    document.querySelectorAll("[data-toggle]").forEach(function (el) {
      el.addEventListener("click", function (e) {
        e.stopPropagation();
        var i = +el.getAttribute("data-toggle");
        repo().targets[i].disabled = !repo().targets[i].disabled;
        saveOverrides();
        renderAll();
      });
    });
    document.querySelectorAll("[data-edit]").forEach(function (el) {
      el.addEventListener("click", function (e) { e.stopPropagation(); openEdit(+el.getAttribute("data-edit")); });
    });
    document.querySelectorAll("[data-addgroup]").forEach(function (b) {
      b.addEventListener("click", function () {
        S.browsePath = b.getAttribute("data-addgroup");
        renderBrowse();
        $("#browseSection").scrollIntoView({ behavior: "smooth", block: "center" });
        flash($("#browseSection"));
      });
    });
    document.querySelectorAll("[data-grip]").forEach(function (g) {
      g.addEventListener("pointerdown", function (e) {
        var card = g.closest(".stage");
        startDrag(e, +g.getAttribute("data-grip"), card.closest(".pipeline").getAttribute("data-gk"), +card.getAttribute("data-gpos"));
      });
    });
  }

  /* ---- drag reorder (within a single group's pipeline) ------------------- */
  var drag = null;
  function startDrag(e, idx, gk, gpos) {
    e.preventDefault();
    var el = e.target.closest(".stage");
    var rect = el.getBoundingClientRect();
    var clone = el.cloneNode(true);
    clone.classList.add("dragging");
    clone.style.position = "fixed";
    clone.style.left = rect.left + "px";
    clone.style.top = rect.top + "px";
    clone.style.width = rect.width + "px";
    clone.style.margin = "0";
    clone.style.pointerEvents = "none";
    document.body.appendChild(clone);
    el.classList.add("placeholder");
    drag = { gk: gk, pos: gpos, offX: e.clientX - rect.left, offY: e.clientY - rect.top, clone: clone };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", onDragMove);
    window.addEventListener("pointerup", endDrag);
  }
  function groupPipe(gk) { return document.querySelector('.pipeline[data-gk="' + (window.CSS && CSS.escape ? CSS.escape(gk) : gk) + '"]'); }
  function onDragMove(e) {
    if (!drag) return;
    drag.clone.style.left = (e.clientX - drag.offX) + "px";
    drag.clone.style.top = (e.clientY - drag.offY) + "px";
    var pipe = groupPipe(drag.gk);
    if (!pipe) return;
    var cards = Array.prototype.slice.call(pipe.querySelectorAll(".stage"));
    var toPos = cards.length - 1;
    for (var i = 0; i < cards.length; i++) {
      var rc = cards[i].getBoundingClientRect();
      if (e.clientX < rc.left + rc.width / 2) { toPos = i; break; }
    }
    if (toPos !== drag.pos) {
      reorderWithinGroup(repo(), drag.gk, drag.pos, toPos);
      drag.pos = toPos;
      renderPipeline();
      var np = groupPipe(drag.gk);
      var nc = np ? np.querySelectorAll(".stage") : [];
      if (nc[toPos]) nc[toPos].classList.add("placeholder");
    }
  }
  function endDrag() {
    if (!drag) return;
    document.body.removeChild(drag.clone);
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", endDrag);
    var gk = drag.gk;
    drag = null;
    renderAll();
    toast("Updated " + gk + "/ promotion order");
  }

  /* ---- pipeline count label ---------------------------------------------- */
  function renderSeqSummary() {
    var r = repo();
    var groups = deriveGroups(r);
    $("#seqSummary").innerHTML = '<span style="font-weight:600;color:var(--text)">' + groups.length +
      " promotion pipeline" + (groups.length === 1 ? "" : "s") + "</span>" +
      '<span class="gsub" style="color:var(--text-2)">grouped by top-level directory</span>';
  }

  /* ---- table view (grouped by top-level directory) ----------------------- */
  function renderTableView() {
    var r = repo();
    var groups = deriveGroups(r);
    var html = groups.map(function (g) {
      var rows = g.idxs.map(function (gi, pos) {
        var t = r.targets[gi];
        var leaf = t.directory.split("/").slice(1).join("/") || t.directory;
        return '<tr' + (t.disabled ? ' style="opacity:.6"' : "") + '>' +
          '<td style="width:96px"><div style="display:flex;align-items:center;gap:4px">' +
            '<span class="order-badge" style="width:22px;height:22px;font-size:12px">' + (pos + 1) + "</span>" +
            '<button class="btn btn-icon" data-mv-up="' + gi + '" data-gk="' + esc(g.key) + '" data-pos="' + pos + '" ' + (pos === 0 ? "disabled" : "") + ' style="width:24px;height:24px">' + I.up + "</button>" +
            '<button class="btn btn-icon" data-mv-dn="' + gi + '" data-gk="' + esc(g.key) + '" data-pos="' + pos + '" ' + (pos === g.idxs.length - 1 ? "disabled" : "") + ' style="width:24px;height:24px">' + I.down + "</button>" +
          "</div></td>" +
          '<td><div class="cell-name" style="gap:8px"><span class="st-dot dot" style="background:' + envColor(t) + '"></span>' + esc(t.name) + "</div></td>" +
          '<td><code>' + esc(leaf) + "</code></td>" +
          '<td><span class="badge">' + I.key + esc(t.aws_profile) + "</span></td>" +
          '<td>' + (t.account_id ? '<code>' + esc(t.account_id) + "</code>" : '<span style="color:var(--text-3)">—</span>') + "</td>" +
          '<td>' + esc(t.region || "—") + "</td>" +
          '<td><span class="switch' + (t.disabled ? "" : " on") + '" data-toggle2="' + gi + '"></span></td>' +
          '<td style="text-align:right"><button class="btn btn-icon" data-edit2="' + gi + '">' + I.edit + '</button><button class="btn btn-icon" data-del2="' + gi + '">' + I.trash + "</button></td>" +
        "</tr>";
      }).join("");
      var act = g.idxs.filter(function (i) { return !r.targets[i].disabled; }).length;
      return '<div class="group" style="padding:0;overflow:hidden">' +
        '<div class="group-head" style="padding:13px 16px;margin:0;background:#f7f9fb;border-bottom:1px solid var(--divider)">' +
          '<div class="group-title"><span class="gfolder">' + I.folder + '</span><span class="path">' + esc(g.key) + '/</span>' +
          '<span class="gsub">' + g.idxs.length + " stage" + (g.idxs.length === 1 ? "" : "s") + " · " + act + " enabled</span></div></div>" +
        '<table class="tbl"><thead><tr><th>Order</th><th>Stage</th><th>Directory</th><th>AWS profile</th><th>Account ID</th><th>Region</th><th>Enabled</th><th></th></tr></thead><tbody>' +
        rows + "</tbody></table></div>";
    }).join("");
    $("#tableView").innerHTML = html;
    document.querySelectorAll("[data-mv-up]").forEach(function (b) { b.addEventListener("click", function () { reorderWithinGroup(repo(), b.getAttribute("data-gk"), +b.getAttribute("data-pos"), +b.getAttribute("data-pos") - 1); renderAll(); }); });
    document.querySelectorAll("[data-mv-dn]").forEach(function (b) { b.addEventListener("click", function () { reorderWithinGroup(repo(), b.getAttribute("data-gk"), +b.getAttribute("data-pos"), +b.getAttribute("data-pos") + 1); renderAll(); }); });
    document.querySelectorAll("[data-toggle2]").forEach(function (b) { b.addEventListener("click", function () { var i = +b.getAttribute("data-toggle2"); repo().targets[i].disabled = !repo().targets[i].disabled; saveOverrides(); renderAll(); }); });
    document.querySelectorAll("[data-edit2]").forEach(function (b) { b.addEventListener("click", function () { openEdit(+b.getAttribute("data-edit2")); }); });
    document.querySelectorAll("[data-del2]").forEach(function (b) { b.addEventListener("click", function () { removeTarget(+b.getAttribute("data-del2")); }); });
  }

  /* ---- browse ------------------------------------------------------------ */
  function renderBrowse() {
    var r = repo();
    var entries = (r.tree[S.browsePath] || []).slice();
    var parts = S.browsePath.split("/").filter(Boolean);
    var crumbs = '<a data-bp="">root</a>';
    var acc = "";
    parts.forEach(function (p, i) {
      acc = acc ? acc + "/" + p : p;
      crumbs += '<span class="sep">/</span><a data-bp="' + esc(acc) + '">' + esc(p) + "</a>";
    });
    $("#browsePath").innerHTML = crumbs;

    var list = entries.map(function (en) {
      var full = S.browsePath ? S.browsePath + "/" + en.name : en.name;
      var added = r.targets.some(function (t) { return t.directory === full; });
      var action;
      if (!en.hasTf) action = '<button class="btn btn-link" data-open="' + esc(full) + '">Open</button>';
      else if (added) action = '<span class="status ok">' + I.checkc + "Added</span>";
      else action = '<button class="btn btn-normal btn-sm" data-add="' + esc(full) + '">' + I.plus + "Add to pipeline</button>";
      return '<div class="dir-row">' +
        '<span class="ic">' + (en.hasTf ? I.file : I.folder) + "</span>" +
        '<span class="nm" data-open="' + esc(full) + '">' + esc(en.name) + "</span>" +
        (en.hasTf ? '<span class="badge blue">.tf</span>' : "") +
        '<span class="spacer"></span>' + action + "</div>";
    }).join("");
    $("#browseList").innerHTML = list || '<div style="color:var(--text-2);padding:12px">No subdirectories.</div>';

    document.querySelectorAll("#browseSection [data-bp]").forEach(function (a) { a.addEventListener("click", function () { S.browsePath = a.getAttribute("data-bp"); renderBrowse(); }); });
    document.querySelectorAll("#browseSection [data-open]").forEach(function (a) { a.addEventListener("click", function () { S.browsePath = a.getAttribute("data-open"); renderBrowse(); }); });
    document.querySelectorAll("#browseSection [data-add]").forEach(function (b) { b.addEventListener("click", function () { addTarget(b.getAttribute("data-add")); }); });
  }
  function addTarget(dir) {
    var r = repo();
    if (r.targets.some(function (t) { return t.directory === dir; })) return;
    var name = dir.split("/").pop() || dir;
    r.targets.push({ name: name, directory: dir, aws_profile: PROFILES.find(function (p) { return p === name; }) || "", account_id: "", region: "", disabled: false });
    renderAll();
    toast("Added " + name + " to the " + groupKey({ directory: dir }) + "/ pipeline");
  }
  function removeTarget(i) {
    var t = repo().targets[i];
    repo().targets.splice(i, 1);
    renderAll();
    toast("Removed " + t.name);
  }

  /* ---- edit modal -------------------------------------------------------- */
  function openEdit(i) {
    S.editIdx = i;
    var t = repo().targets[i];
    $("#mTitle").textContent = "Edit stage · " + t.name;
    $("#mBody").innerHTML =
      field("Stage name", '<input class="inp" id="f_name" value="' + esc(t.name) + '">') +
      field("Directory", '<input class="inp mono" id="f_dir" value="' + esc(t.directory) + '" disabled style="background:#f4f6f8;color:var(--text-2)">', "Path is fixed to the Terraform directory.") +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">' +
        field("AWS profile", sel("f_profile", PROFILES, t.aws_profile, true)) +
        field("Region", sel("f_region", REGIONS, t.region, true)) +
      "</div>" +
      field("Expected account ID", '<input class="inp mono" id="f_acct" value="' + esc(t.account_id || "") + '" placeholder="Optional — verified via STS before runs">', "When set, tf9 checks the AWS account before applying.") +
      field("Pipeline group", '<input class="inp mono" id="f_group" list="f_grp_list" value="' + esc(t.group || groupKey(t)) + '" placeholder="e.g. environments"><datalist id="f_grp_list">' + Array.from(new Set(repo().targets.map(function(x){return groupKey(x);}))).map(function(g){return '<option value="'+esc(g)+'">';}).join("") + "</datalist>", "Override which pipeline group this stage belongs to. Changing this moves it in the New Run Modal.") +
      '<label style="display:flex;align-items:center;gap:9px;margin-top:4px;cursor:pointer"><span class="switch' + (t.gated ? " on" : "") + '" id="f_gate"></span><span><b style="font-size:13px">Require manual approval</b><div class="field-hint" style="margin:0">Pause the promotion before this stage until approved.</div></span></label>';
    $("#editModal").classList.add("show");
    var g = $("#f_gate"); g.addEventListener("click", function () { g.classList.toggle("on"); });
  }
  function field(label, control, hint) {
    return '<div style="margin-bottom:16px"><label class="field-label">' + label + "</label>" + control + (hint ? '<div class="field-hint">' + hint + "</div>" : "") + "</div>";
  }
  function sel(id, opts, val, editable) {
    var o = opts.map(function (x) { return '<option' + (x === val ? " selected" : "") + ">" + esc(x) + "</option>"; }).join("");
    if (editable && val && opts.indexOf(val) === -1) o = '<option selected>' + esc(val) + "</option>" + o;
    return '<select class="sel" id="' + id + '">' + o + "</select>";
  }
  function saveEdit() {
    var t = repo().targets[S.editIdx];
    t.name = $("#f_name").value.trim() || t.name;
    t.aws_profile = $("#f_profile").value;
    t.region = $("#f_region").value;
    t.account_id = $("#f_acct").value.trim();
    t.gated = $("#f_gate").classList.contains("on");
    var fg = $("#f_group"); if (fg) { var ng = fg.value.trim(); var dg = (t.directory||"").split("/")[0]||""; if (ng && ng !== dg) t.group = ng; else delete t.group; }
    saveOverrides();
    closeModal();
    renderAll();
    toast("Stage saved");
  }
  function closeModal() { $("#editModal").classList.remove("show"); S.editIdx = -1; }

  /* ---- config section orchestration ------------------------------------- */
  function renderConfig() {
    var r = repo();
    $("#cfgRepoName").textContent = r.name;
    $("#cfgRepoPath").textContent = r.path;
    $("#viewPipe").classList.toggle("on", S.view === "pipeline");
    $("#viewTable").classList.toggle("on", S.view === "table");
    $("#pipeWrap").style.display = S.view === "pipeline" ? "" : "none";
    $("#tableWrap").style.display = S.view === "table" ? "" : "none";
    renderSeqSummary();
    if (S.view === "pipeline") renderPipeline(); else renderTableView();
    renderBrowse();
  }
  function renderAll() { renderRepoTable(); renderConfig(); }

  /* ---- toast + flash ----------------------------------------------------- */
  var tt;
  function toast(msg) { var el = $("#toast"); el.innerHTML = I.check + esc(msg); el.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove("show"); }, 1900); }
  function flash(el) { el.animate([{ boxShadow: "0 0 0 0 rgba(9,114,211,.0)" }, { boxShadow: "0 0 0 4px rgba(9,114,211,.35)" }, { boxShadow: "0 0 0 0 rgba(9,114,211,0)" }], { duration: 1100 }); }

  /* ---- init -------------------------------------------------------------- */
  function init() {
    document.querySelectorAll("[data-ico]").forEach(function (el) { el.innerHTML = I[el.getAttribute("data-ico")] || ""; });
    loadOverrides();
    renderAll();
    $("#viewPipe").addEventListener("click", function () { S.view = "pipeline"; renderConfig(); });
    $("#viewTable").addEventListener("click", function () { S.view = "table"; renderConfig(); });
    $("#mSave").addEventListener("click", saveEdit);
    $("#mCancel").addEventListener("click", closeModal);
    $("#editModal").addEventListener("click", function (e) { if (e.target.id === "editModal") closeModal(); });
    document.querySelectorAll("[data-config]").forEach(function () {});
    document.addEventListener("click", function (e) {
      var c = e.target.closest && e.target.closest("[data-config]");
      if (c) { e.stopPropagation(); selectRepo(c.getAttribute("data-config")); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
