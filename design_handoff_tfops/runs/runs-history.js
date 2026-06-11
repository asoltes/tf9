/* =========================================================================
   Runs history + split panel — interactive prototype
   Parallel runs render as CONCURRENT live terminals (one per target),
   demultiplexed from the [env]-prefixed stream.
   ========================================================================= */
(function () {
  "use strict";
  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var I = {
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    seq: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="5" rx="1"/><rect x="4" y="16" width="16" height="5" rx="1"/><path d="M12 8v4m0 0-2-2m2 2 2-2"/></svg>',
    par: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="6" height="16" rx="1"/><rect x="15" y="4" width="6" height="16" rx="1"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    checkc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="8.5 12 11 14.5 15.5 9.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>',
    stop: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>',
    expand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>',
    tabs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h18M3 9l2-4h6l1 2h9v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
    merge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    git: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>'
  };

  /* ---- output generators ------------------------------------------------- */
  function planLines(resources, stats) {
    var L = [
      "Acquiring state lock. This may take a few moments...",
      "data.aws_region.current: Reading...",
      "data.aws_region.current: Read complete after 0s [id=eu-west-2]",
      "",
      "Terraform used the selected providers to generate the following execution",
      "plan. Resource actions are indicated with the following symbols:",
      "  + create",
      "",
      "Terraform will perform the following actions:",
      ""
    ];
    resources.forEach(function (r) {
      L.push("  # " + r.addr + " will be created");
      L.push('  + resource "' + r.type + '" "' + r.name + '" {');
      L.push("      + id       = (known after apply)");
      L.push("      + arn      = (known after apply)");
      L.push("    }");
      L.push("");
    });
    L.push("Plan: " + stats.add + " to add, " + stats.change + " to change, " + stats.destroy + " to destroy.");
    return L;
  }
  function applyLines(resources, stats) {
    var L = ["Acquiring state lock. This may take a few moments..."];
    resources.forEach(function (r) { L.push(r.addr + ": Creating..."); });
    resources.forEach(function (r, i) { L.push(r.addr + ": Creation complete after " + (2 + i) + "s [id=" + r.name + "-" + (1000 + i) + "]"); });
    L.push("");
    L.push("Apply complete! Resources: " + stats.add + " added, " + stats.change + " changed, " + stats.destroy + " destroyed.");
    return L;
  }
  function failLines(resources) {
    var L = ["Acquiring state lock. This may take a few moments..."];
    if (resources[0]) L.push(resources[0].addr + ": Creating...");
    L.push("");
    L.push("Error: creating resource: AccessDenied: User is not authorized to");
    L.push("perform this operation. Encoded authorization failure message...");
    L.push("");
    L.push("[FAILED]");
    return L;
  }
  function res(addr, type, name) { return { addr: addr, type: type, name: name }; }

  /* resource sets */
  var R = {
    s3: [res("aws_s3_bucket.state", "aws_s3_bucket", "state"), res("aws_dynamodb_table.locks", "aws_dynamodb_table", "locks"), res("aws_s3_bucket_versioning.v", "aws_s3_bucket_versioning", "v"), res("aws_s3_bucket_sse.d", "aws_s3_bucket_server_side_encryption_configuration", "d"), res("aws_s3_bucket_public_access_block.b", "aws_s3_bucket_public_access_block", "b")],
    example: [res("aws_instance.example", "aws_instance", "example")],
    single: [res("aws_instance.webserver", "aws_instance", "webserver"), res("aws_security_group.webserver", "aws_security_group", "webserver")],
    cluster: [res("aws_autoscaling_group.asg", "aws_autoscaling_group", "asg"), res("aws_launch_configuration.lc", "aws_launch_configuration", "lc"), res("aws_lb.alb", "aws_lb", "alb"), res("aws_lb_listener.http", "aws_lb_listener", "http"), res("aws_lb_listener_rule.asg", "aws_lb_listener_rule", "asg"), res("aws_lb_target_group.asg", "aws_lb_target_group", "asg"), res("aws_security_group.alb", "aws_security_group", "alb")],
    dev: [res("aws_vpc.main", "aws_vpc", "main"), res("aws_subnet.a", "aws_subnet", "a"), res("aws_subnet.b", "aws_subnet", "b"), res("aws_instance.app", "aws_instance", "app"), res("aws_security_group.app", "aws_security_group", "app")],
    iam: [res("aws_iam_role.deploy", "aws_iam_role", "deploy"), res("aws_iam_policy.deploy", "aws_iam_policy", "deploy")]
  };

  function mk(env, profile, kind, resources, stats, opts) {
    opts = opts || {};
    var lines = opts.fail ? failLines(resources) : kind === "apply" ? applyLines(resources, stats) : planLines(resources, stats);
    return { env: env, profile: profile, lines: lines, stats: stats, initStatus: opts.status || "running", speed: opts.speed || 2, fail: !!opts.fail };
  }

  /* ---- runs data --------------------------------------------------------- */
  var now = Date.now();
  function ago(s) { return new Date(now - s * 1000).toISOString(); }
  var RUNS = [
    {
      id: "run-0042", cmd: "apply", repo: "infrastructure", branch: "main", mode: "promotion", status: "running",
      started: ago(70), duration: null,
      targets: [
        mk("dev", "company-dev", "apply", R.dev, { add: 5, change: 0, destroy: 0 }, { status: "done", speed: 1 }),
        mk("staging", "company-staging", "apply", R.dev, { add: 5, change: 0, destroy: 0 }, { status: "running", speed: 2 }),
        mk("prod", "company-prod", "apply", R.dev, { add: 5, change: 0, destroy: 0 }, { status: "queued" })
      ]
    },
    {
      id: "run-0041", cmd: "plan", repo: "terraform-up-and-running", branch: "master", mode: "parallel", status: "running",
      started: ago(38), duration: null,
      targets: [
        mk("example-server", "default", "plan", R.example, { add: 1, change: 0, destroy: 0 }, { status: "done", speed: 1 }),
        mk("single-web-server", "default", "plan", R.single, { add: 2, change: 0, destroy: 0 }, { status: "running", speed: 2 }),
        mk("webserver-cluster", "default", "plan", R.cluster, { add: 7, change: 0, destroy: 0 }, { status: "running", speed: 3 }),
        mk("s3", "default", "plan", R.s3, { add: 5, change: 0, destroy: 0 }, { status: "running", speed: 2 })
      ]
    },
    {
      id: "run-0040", cmd: "plan", repo: "infrastructure", branch: "main", mode: "parallel", status: "success",
      started: ago(900), duration: "31s",
      targets: [
        mk("dev", "company-dev", "plan", R.dev, { add: 5, change: 0, destroy: 0 }, { status: "done" }),
        mk("staging", "company-staging", "plan", R.dev, { add: 0, change: 2, destroy: 0 }, { status: "done" }),
        mk("prod", "company-prod", "plan", R.dev, { add: 0, change: 0, destroy: 0 }, { status: "done" }),
        mk("s3", "company-shared", "plan", R.s3, { add: 5, change: 0, destroy: 0 }, { status: "done" }),
        mk("iam", "company-shared", "plan", R.iam, { add: 2, change: 0, destroy: 0 }, { status: "done" })
      ]
    },
    {
      id: "run-0039", cmd: "apply", repo: "infrastructure", branch: "main", mode: "promotion", status: "failed",
      started: ago(2400), duration: "1m 12s",
      targets: [
        mk("dev", "company-dev", "apply", R.dev, { add: 5, change: 0, destroy: 0 }, { status: "done" }),
        mk("staging", "company-staging", "apply", R.dev, { add: 0, change: 0, destroy: 0 }, { status: "fail", fail: true }),
        mk("prod", "company-prod", "apply", R.dev, { add: 0, change: 0, destroy: 0 }, { status: "queued" })
      ]
    },
    {
      id: "run-0038", cmd: "plan", repo: "terraform-up-and-running", branch: "master", mode: "promotion", status: "success",
      started: ago(5400), duration: "27s",
      targets: [
        mk("s3", "default", "plan", R.s3, { add: 5, change: 0, destroy: 0 }, { status: "done" }),
        mk("webserver-cluster", "default", "plan", R.cluster, { add: 7, change: 0, destroy: 0 }, { status: "done" })
      ]
    },
    {
      id: "run-0037", cmd: "destroy", repo: "infrastructure", branch: "main", mode: "promotion", status: "cancelled",
      started: ago(9000), duration: "14s",
      targets: [ mk("dev", "company-dev", "apply", R.dev, { add: 0, change: 0, destroy: 5 }, { status: "done" }) ]
    }
  ];

  var ENV_COLORS = ["#79c0ff", "#56d364", "#e3b341", "#d2a8ff", "#76e3ea", "#ffa198"];

  /* ---- state ------------------------------------------------------------- */
  var S = { selected: "run-0041", view: "grid", activeTab: 0, sim: null, refs: {}, dock: "bottom", fsTarget: -1 };
  function run() { return RUNS.find(function (r) { return r.id === S.selected; }); }

  /* ---- helpers ----------------------------------------------------------- */
  function relTime(iso) {
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return s + "s ago";
    if (s < 3600) return Math.floor(s / 60) + "m ago";
    if (s < 86400) return Math.floor(s / 3600) + "h ago";
    return Math.floor(s / 86400) + "d ago";
  }
  function cmdBadge(cmd) {
    var c = cmd === "destroy" ? "red" : cmd === "apply" ? "orange" : cmd === "plan" ? "green" : "blue";
    return '<span class="badge ' + c + '">' + esc(cmd) + "</span>";
  }
  function statusIcon(st) {
    if (st === "running") return '<span class="spin"></span>';
    if (st === "success") return I.checkc;
    if (st === "failed") return I.x;
    return I.stop;
  }
  function aggStats(r) {
    var a = 0, c = 0, d = 0, any = false;
    r.targets.forEach(function (t) { if (t.status !== "queued" && t.status !== "fail") { a += t.stats.add; c += t.stats.change; d += t.stats.destroy; any = true; } });
    return { a: a, c: c, d: d, any: any };
  }
  function colorize(line) {
    var t = line.replace(/^\s+/, ""), cls = "";
    if (/^\+ |^\+$/.test(t)) cls = "tl-add";
    else if (/^- |^-$/.test(t)) cls = "tl-del";
    else if (/^~ /.test(t)) cls = "tl-chg";
    else if (/^#\s/.test(t)) cls = "tl-dim";
    else if (/^Plan:/.test(t)) cls = "tl-plan";
    else if (/^(Apply complete|No changes|Destroy complete)/.test(t)) cls = "tl-ok";
    else if (/^Error|^\[FAILED\]/.test(t)) cls = "tl-err";
    else if (/^data\.|: (Creating|Creation complete|Refreshing|Still)/.test(t)) cls = "tl-data";
    else if (/Acquiring state lock|Reading\.\.\./.test(t)) cls = "tl-dim";
    return cls ? '<span class="' + cls + '">' + esc(line) + "</span>\n" : esc(line) + "\n";
  }

  /* ---- history table ----------------------------------------------------- */
  function renderTable() {
    var rows = RUNS.map(function (r) {
      var sel = r.id === S.selected;
      var tnames = r.targets.map(function (t) { return t.env; });
      var chips = tnames.slice(0, 2).map(function (n) { return '<span class="tgt-chip">' + esc(n) + "</span>"; }).join("") +
        (tnames.length > 2 ? '<span class="tgt-more">+' + (tnames.length - 2) + " more</span>" : "");
      var st = aggStats(r);
      var result = r.status === "running" ? '<span class="res-mini"><span class="z">running…</span></span>'
        : r.status === "failed" ? '<span class="res-mini"><span class="d">failed</span></span>'
        : r.status === "cancelled" ? '<span class="res-mini"><span class="z">—</span></span>'
        : '<span class="res-mini"><span class="' + (st.a ? "a" : "z") + '">+' + st.a + '</span><span class="' + (st.c ? "c" : "z") + '">~' + st.c + '</span><span class="' + (st.d ? "d" : "z") + '">-' + st.d + "</span></span>";
      return '<tr class="' + (sel ? "selected " : "") + (r.status === "running" ? "is-running" : "") + '" data-run="' + r.id + '">' +
        '<td style="width:118px"><span class="run-id">' + (r.status === "running" ? '<span class="live"></span>' : "") + r.id + "</span></td>" +
        '<td style="width:96px">' + cmdBadge(r.cmd) + "</td>" +
        '<td style="width:160px"><span class="mono-cell repo" title="' + esc(r.repo) + '">' + esc(r.repo) + "</span></td>" +
        '<td style="width:118px"><span class="branch-cell">' + I.git + esc(r.branch) + "</span></td>" +
        '<td style="width:170px"><span class="tgt-chips">' + chips + "</span></td>" +
        '<td style="width:120px"><span class="mode-cell ' + (r.mode === "parallel" ? "par" : "") + '">' + (r.mode === "parallel" ? I.par : I.seq) + (r.mode === "parallel" ? "Parallel" : "Promotion") + "</span></td>" +
        '<td style="width:130px">' + result + "</td>" +
        '<td style="width:90px"><span class="mono-cell">' + relTime(r.started) + "</span></td>" +
        '<td style="width:90px"><span class="mono-cell">' + (r.duration || "—") + "</span></td>" +
        '<td style="width:120px"><span class="rstatus ' + r.status + '">' + statusIcon(r.status) + esc(r.status) + "</span></td>" +
      "</tr>";
    }).join("");
    $("#runsTbl").innerHTML =
      "<thead><tr><th>Run ID</th><th>Command</th><th>Repo</th><th>Branch</th><th>Targets</th><th>Mode</th><th>Result</th><th>Started</th><th>Duration</th><th>Status</th></tr></thead><tbody>" + rows + "</tbody>";
    $("#runsCount").textContent = "(" + RUNS.length + ")";
    document.querySelectorAll("#runsTbl tr[data-run]").forEach(function (tr) {
      tr.addEventListener("click", function () { selectRun(tr.getAttribute("data-run")); });
    });
  }
  function selectRun(id) {
    if (S.sim) { clearInterval(S.sim); S.sim = null; }
    S.selected = id; S.view = run().mode === "parallel" ? "grid" : "grid"; S.activeTab = 0;
    renderTable(); renderPanel();
  }

  /* ---- split panel ------------------------------------------------------- */
  function initTargets() {
    // build live working copies
    return run().targets.map(function (t, i) {
      var full = t.status === "done" || t.status === "fail" || run().status === "success" || run().status === "failed" || run().status === "cancelled";
      var streaming = run().status === "running" && t.initStatus === "running";
      return {
        env: t.env, profile: t.profile, lines: t.lines, stats: t.stats, fail: t.fail, speed: t.speed,
        shown: (full || t.initStatus === "done" || t.initStatus === "fail") ? t.lines.slice() : [],
        idx: (full || t.initStatus === "done" || t.initStatus === "fail") ? t.lines.length : 0,
        status: streaming ? "running" : (t.initStatus === "running" ? "running" : t.initStatus),
        tick: 0, color: ENV_COLORS[i % ENV_COLORS.length]
      };
    });
  }
  var T = [];

  function renderPanel() {
    var r = run();
    if (!r) { $("#spBody").innerHTML = '<div class="sp-empty">Select a run to see its output.</div>'; return; }
    T = initTargets();
    $("#spRunId").textContent = r.id;
    $("#spStatus").className = "rstatus " + r.status;
    $("#spStatus").innerHTML = statusIcon(r.status) + esc(r.status);

    var actions = r.status === "running"
      ? '<button class="btn btn-normal btn-sm" id="cancelRun">' + I.stop + "Cancel run</button>"
      : '<button class="btn btn-normal btn-sm">' + I.refresh + "Re-run</button>" +
        '<button class="btn btn-normal btn-sm" id="viewReport">' + I.report + "View report</button>";
    $("#spActions").innerHTML = actions;
    var cr = $("#cancelRun"); if (cr) cr.addEventListener("click", function () { if (S.sim) { clearInterval(S.sim); S.sim = null; } r.status = "cancelled"; T.forEach(function (t) { if (t.status === "running") t.status = "fail"; }); renderTable(); renderPanel(); toast("Run cancelled"); });
    var vr = $("#viewReport"); if (vr) vr.addEventListener("click", function () { var pg = r.cmd === "destroy" ? "Destroy%20Report" : r.cmd === "apply" ? "Apply%20Report" : "Plan%20Report"; location.href = "../reports/" + pg + ".html"; });

    var st = aggStats(r);
    var meta =
      metaItem("Command", cmdBadge(r.cmd)) +
      metaItem("Mode", '<span class="mode-cell ' + (r.mode === "parallel" ? "par" : "") + '" style="font-weight:600">' + (r.mode === "parallel" ? I.par + "Parallel" : I.seq + "Promotion") + "</span>") +
      metaItem("Repo", '<span class="v mono">' + esc(r.repo) + "</span>", true) +
      metaItem("Branch", '<span class="branch-cell">' + I.git + esc(r.branch) + "</span>") +
      metaItem("Targets", r.targets.length + "") +
      metaItem("Started", relTime(r.started)) +
      metaItem("Duration", r.duration || "running…");

    $("#spBody").innerHTML =
      '<div class="meta-strip">' + meta + "</div>" +
      '<div id="progressRow"></div>' +
      '<div id="outArea"></div>';
    renderProgress();
    renderOutput();
    if (r.status === "running") startSim();
  }
  function metaItem(k, v, mono) {
    return '<div class="meta-item"><span class="k">' + k + '</span><span class="v' + (mono ? " mono" : "") + '">' + v + "</span></div>";
  }

  function renderProgress() {
    var total = T.length;
    var done = T.filter(function (t) { return t.status === "done"; }).length;
    var fail = T.filter(function (t) { return t.status === "fail"; }).length;
    var runn = T.filter(function (t) { return t.status === "running"; }).length;
    var promo = run().mode === "promotion";
    var dots = T.map(function (t) {
      var cls = t.status === "running" ? "run" : t.status === "done" ? "done" : t.status === "fail" ? "fail" : "queued";
      return '<span class="tdot ' + cls + '"><span class="d"></span>' + esc(t.env) + "</span>";
    }).join(promo ? '<span class="seq-arrow">' + I.arrow + "</span>" : "");
    $("#progressRow").innerHTML =
      '<div class="progress-row"><div class="progress-bar">' +
        '<i class="pb-done" style="width:' + (done / total * 100) + '%"></i>' +
        '<i class="pb-fail" style="width:' + (fail / total * 100) + '%"></i>' +
        '<i class="pb-run" style="width:' + (runn / total * 100) + '%"></i></div>' +
        '<span class="progress-meta">' + done + "/" + total + " complete" + (fail ? " · " + fail + " failed" : "") + (runn ? " · " + runn + " running" : "") + "</span></div>" +
      '<div class="target-dots">' + dots + "</div>";
  }

  /* ---- output area (mode + view aware) ----------------------------------- */
  function renderOutput() {
    var r = run();
    S.refs = { panes: {}, heads: {}, merged: null };
    if (r.mode === "promotion") { renderPromotion(); return; }
    // parallel
    var head =
      '<div class="out-head"><div class="ot"><span class="par-pill">' + I.par + "Parallel</span>" +
        T.length + " targets running concurrently</div>" +
        '<div class="view-toggle" id="viewToggle">' +
          '<button data-view="grid" class="' + (S.view === "grid" ? "on" : "") + '">' + I.grid + "Grid</button>" +
          '<button data-view="tabs" class="' + (S.view === "tabs" ? "on" : "") + '">' + I.tabs + "Tabs</button>" +
          '<button data-view="merged" class="' + (S.view === "merged" ? "on" : "") + '">' + I.merge + "Merged</button>" +
        "</div></div>";
    var body = S.view === "grid" ? gridHTML() : S.view === "tabs" ? tabsHTML() : mergedHTML();
    $("#outArea").innerHTML = head + body;
    document.querySelectorAll("#viewToggle [data-view]").forEach(function (b) {
      b.addEventListener("click", function () { S.view = b.getAttribute("data-view"); renderOutput(); });
    });
    if (S.view === "grid") { T.forEach(function (t, i) { S.refs.panes[i] = $("#pane" + i); S.refs.heads[i] = $("#head" + i); fillPane(i); }); }
    else if (S.view === "tabs") { wireTabs(); var i = S.activeTab; S.refs.panes[i] = $("#paneTab"); fillPane(i); }
    else { S.refs.merged = $("#mergedPane"); fillMerged(); }
  }
  function cardHead(t, i) {
    var stateCls = t.status, label = t.status === "run" ? "running" : t.status;
    label = t.status === "running" ? "running" : t.status === "done" ? "done" : t.status === "fail" ? "failed" : "queued";
    var stats = (t.status === "done") ? '<span class="tc-stats"><span class="a">+' + t.stats.add + '</span><span class="c">~' + t.stats.change + '</span><span class="d">-' + t.stats.destroy + "</span></span>" : "";
    return '<span class="sd ' + (t.status === "running" ? "run" : t.status) + '"></span>' +
      '<span class="en">' + esc(t.env) + "</span>" +
      '<span class="pr">' + esc(t.profile) + "</span>" +
      '<span class="sp"></span>' + stats +
      '<span class="tc-state ' + (t.status === "running" ? "run" : t.status) + '">' + label + "</span>" +
      '<button class="tc-exp" data-fs="' + i + '" title="Fullscreen">' + I.expand + "</button>";
  }
  function gridHTML() {
    return '<div class="term-grid' + (T.length === 1 ? " one" : "") + '">' + T.map(function (t, i) {
      return '<div class="term-card ' + (t.status === "running" ? "run" : t.status) + '" id="card' + i + '">' +
        '<div class="tc-head" id="head' + i + '">' + cardHead(t, i) + "</div>" +
        '<div class="tc-body" id="pane' + i + '"></div></div>';
    }).join("") + "</div>";
  }
  function tabsHTML() {
    var tabs = T.map(function (t, i) {
      return '<div class="term-tab ' + (i === S.activeTab ? "on" : "") + '" data-tab="' + i + '"><span class="d ' + (t.status === "running" ? "run" : t.status) + '"></span>' + esc(t.env) + "</div>";
    }).join("");
    var t = T[S.activeTab];
    return '<div class="term-tabs">' + tabs + "</div>" +
      '<div class="term-single"><div class="tc-head" id="head' + S.activeTab + '">' + cardHead(t, S.activeTab) + '</div><div class="tc-body" id="paneTab"></div></div>';
  }
  function wireTabs() {
    document.querySelectorAll("[data-tab]").forEach(function (b) {
      b.addEventListener("click", function () { S.activeTab = +b.getAttribute("data-tab"); renderOutput(); });
    });
    var fs = $("[data-fs]"); document.querySelectorAll("[data-fs]").forEach(wireFs);
  }
  function mergedHTML() {
    return '<div class="merged-term"><div class="tc-head"><span class="en">All targets</span><span class="pr">interleaved · prefixed by target</span><span class="sp"></span></div><div class="tc-body" id="mergedPane"></div></div>';
  }
  function fillPane(i) {
    var el = S.refs.panes[i]; if (!el) return;
    var t = T[i];
    el.innerHTML = t.shown.length ? t.shown.map(colorize).join("") : '<span class="waiting">Waiting for output…</span>';
    el.scrollTop = el.scrollHeight;
  }
  function fillMerged() {
    var el = S.refs.merged; if (!el) return;
    // interleave by original order is unknown; show grouped-by-arrival simulation: merge shown arrays round-robin up to max length
    var max = Math.max.apply(null, T.map(function (t) { return t.shown.length; }).concat(0));
    var out = [];
    for (var k = 0; k < max; k++) { T.forEach(function (t) { if (t.shown[k] !== undefined && t.shown[k] !== "") out.push(prefLine(t)); }); }
    // simpler: concatenate each target's shown with prefix, in target order
    out = [];
    T.forEach(function (t) { t.shown.forEach(function (ln) { out.push(prefLineFull(t, ln)); }); });
    el.innerHTML = out.join("") || '<span class="waiting">Waiting for output…</span>';
    el.scrollTop = el.scrollHeight;
  }
  function prefLineFull(t, ln) { return '<span class="merged-pref" style="color:' + t.color + '">[' + esc(t.env) + "] </span>" + colorize(ln); }
  function prefLine(t) { return ""; }

  function wireFs(b) {
    b.addEventListener("click", function (e) { e.stopPropagation(); openFs(+b.getAttribute("data-fs")); });
  }

  /* ---- promotion stacked view -------------------------------------------- */
  function renderPromotion() {
    $("#outArea").innerHTML = '<div class="out-head"><div class="ot"><span class="mode-cell" style="font-weight:700">' + I.seq + "Promotion — runs in order, stops on failure</span></div></div>" +
      T.map(function (t, i) {
        var collapsed = t.status !== "running";
        var stateCls = t.status === "running" ? "run" : t.status === "done" ? "done" : t.status === "fail" ? "fail" : "queued";
        var step = t.status === "done" ? I.check : t.status === "fail" ? "!" : (i + 1);
        var stats = t.status === "done" ? '<span style="font-family:var(--mono);font-size:12px;font-weight:700"><span style="color:var(--green)">+' + t.stats.add + '</span> <span style="color:var(--amber)">~' + t.stats.change + '</span> <span style="color:var(--red)">-' + t.stats.destroy + "</span></span>" : "";
        var stateLabel = t.status === "running" ? '<span class="spin" style="border-color:var(--blue);border-top-color:transparent"></span>' :
          t.status === "queued" ? '<span style="font-size:11.5px;color:var(--text-3);font-weight:600">queued</span>' :
          t.status === "fail" ? '<span style="font-size:11.5px;color:var(--red);font-weight:700">FAILED</span>' : stats;
        return '<div class="promo-sec ' + stateCls + (collapsed ? " collapsed" : "") + '" data-sec="' + i + '">' +
          '<div class="promo-sec-head" data-toggle="' + i + '"><span class="promo-step">' + step + "</span>" +
          '<span class="promo-nm">' + esc(t.env) + '</span><span class="promo-pr">' + esc(t.profile) + "</span>" +
          '<span class="sp"></span>' + stateLabel +
          '<button class="tc-exp" data-fs="' + i + '" title="Fullscreen" style="color:var(--text-3)">' + I.expand + "</button>" +
          '<span class="promo-chev">' + I.chev + "</span></div>" +
          '<div class="promo-term"><div class="tc-body" id="pane' + i + '"></div></div></div>';
      }).join("");
    T.forEach(function (t, i) { S.refs.panes[i] = $("#pane" + i); fillPane(i); });
    document.querySelectorAll("[data-toggle]").forEach(function (b) {
      b.addEventListener("click", function (e) { if (e.target.closest("[data-fs]")) return; var sec = b.closest(".promo-sec"); sec.classList.toggle("collapsed"); });
    });
    document.querySelectorAll("#outArea [data-fs]").forEach(wireFs);
  }

  /* ---- live simulation --------------------------------------------------- */
  function startSim() {
    if (S.sim) clearInterval(S.sim);
    S.sim = setInterval(function () {
      var any = false;
      T.forEach(function (t, i) {
        if (t.status !== "running") return;
        any = true;
        t.tick++;
        if (t.tick % t.speed !== 0) return;
        if (t.idx < t.lines.length) {
          var ln = t.lines[t.idx++];
          t.shown.push(ln);
          appendLine(i, t, ln);
          autoscroll(i);
        }
        if (t.idx >= t.lines.length) {
          t.status = t.fail ? "fail" : "done";
          updateHead(i, t);
          renderProgress();
          maybeAdvancePromotion();
        }
      });
      // overall completion
      if (!T.some(function (t) { return t.status === "running" || t.status === "queued"; })) {
        finishRun();
      } else if (!any && !T.some(function (t) { return t.status === "running"; })) {
        // promotion: start next queued
        maybeAdvancePromotion();
      }
    }, 110);
  }
  function maybeAdvancePromotion() {
    if (run().mode !== "promotion") return;
    if (T.some(function (t) { return t.status === "running"; })) return;
    if (T.some(function (t) { return t.status === "fail"; })) return; // stop on failure
    var next = T.find(function (t) { return t.status === "queued"; });
    if (next) { next.status = "running"; if (run().mode === "promotion") renderPromotion(); renderProgress(); }
  }
  function appendLine(i, t, ln) {
    if (S.fsTarget === i && $("#fsOverlay").classList.contains("show")) {
      var fb = $("#fsBody"); if (fb) { clearWaiting(fb); fb.insertAdjacentHTML("beforeend", colorize(ln)); fb.scrollTop = fb.scrollHeight; }
    }
    if (run().mode === "parallel" && S.view === "merged") {
      var el = S.refs.merged; if (el) { clearWaiting(el); el.insertAdjacentHTML("beforeend", prefLineFull(t, ln)); }
      return;
    }
    if (run().mode === "parallel" && S.view === "tabs") {
      if (i === S.activeTab && S.refs.panes[i]) { clearWaiting(S.refs.panes[i]); S.refs.panes[i].insertAdjacentHTML("beforeend", colorize(ln)); }
      return;
    }
    var p = S.refs.panes[i]; if (p) { clearWaiting(p); p.insertAdjacentHTML("beforeend", colorize(ln)); }
  }
  function clearWaiting(el) { var w = el.querySelector(".waiting"); if (w) el.innerHTML = ""; }
  function autoscroll(i) {
    if (run().mode === "parallel" && S.view === "merged") { if (S.refs.merged) S.refs.merged.scrollTop = S.refs.merged.scrollHeight; return; }
    var p = S.refs.panes[i]; if (p) p.scrollTop = p.scrollHeight;
  }
  function updateHead(i, t) {
    if (S.fsTarget === i && $("#fsOverlay").classList.contains("show")) updateFsStats(t);
    if (run().mode === "promotion") { renderPromotion(); return; }
    if (S.view === "grid") {
      var card = $("#card" + i); if (card) card.className = "term-card " + (t.status === "running" ? "run" : t.status);
      var h = $("#head" + i); if (h) h.innerHTML = cardHead(t, i);
      document.querySelectorAll("#card" + i + " [data-fs]").forEach(wireFs);
    } else if (S.view === "tabs") { renderOutput(); }
    else renderProgress();
  }
  function finishRun() {
    clearInterval(S.sim); S.sim = null;
    var r = run();
    var failed = T.some(function (t) { return t.status === "fail"; });
    r.status = failed ? "failed" : "success";
    r.duration = r.duration || "42s";
    renderTable();
    renderProgress();
    if (r.mode === "promotion") renderPromotion(); else updateAllHeads();
    $("#spStatus").className = "rstatus " + r.status; $("#spStatus").innerHTML = statusIcon(r.status) + esc(r.status);
    $("#spActions").innerHTML = '<button class="btn btn-normal btn-sm">' + I.refresh + "Re-run</button>" + '<button class="btn btn-normal btn-sm" id="viewReport">' + I.report + "View report</button>";
    var vr2 = $("#viewReport"); if (vr2) vr2.addEventListener("click", function () { var pg = r.cmd === "destroy" ? "Destroy%20Report" : r.cmd === "apply" ? "Apply%20Report" : "Plan%20Report"; location.href = "../reports/" + pg + ".html"; });
    toast(r.id + " " + r.status);
  }
  function updateAllHeads() { T.forEach(function (t, i) { var c = $("#card" + i); if (c) { c.className = "term-card " + (t.status === "running" ? "run" : t.status); var h = $("#head" + i); if (h) h.innerHTML = cardHead(t, i); } }); document.querySelectorAll("#outArea [data-fs]").forEach(wireFs); }

  /* ---- fullscreen -------------------------------------------------------- */
  function openFs(i) {
    S.fsTarget = i;
    var t = T[i];
    var ov = $("#fsOverlay");
    $("#fsTitle").textContent = t.env + "  ·  " + t.profile;
    updateFsStats(t);
    $("#fsBody").innerHTML = t.shown.map(colorize).join("") || '<span class="waiting">Waiting…</span>';
    $("#fsBody").scrollTop = $("#fsBody").scrollHeight;
    ov.classList.add("show");
  }
  function updateFsStats(t) {
    var s = t.status === "done" ? '<span class="tc-stats" style="font-size:13px"><span class="a">+' + t.stats.add + '</span><span class="c">~' + t.stats.change + '</span><span class="d">-' + t.stats.destroy + "</span></span>" :
      t.status === "running" ? '<span class="tc-state run" style="font-size:12px">running</span>' :
      t.status === "fail" ? '<span class="tc-state fail" style="font-size:12px">FAILED</span>' : "";
    $("#fsStats").innerHTML = s;
  }

  /* ---- resize handle (axis depends on dock) ------------------------------ */
  function wireResize() {
    var h = $("#spHandle"), panel = $("#splitpanel"), drag = null;
    h.addEventListener("pointerdown", function (e) {
      drag = { x: e.clientX, y: e.clientY, w: panel.offsetWidth, h: panel.offsetHeight };
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", mv); window.addEventListener("pointerup", up);
    });
    function mv(e) {
      if (!drag) return;
      if (S.dock === "side") { var nw = Math.max(340, Math.min(window.innerWidth - 400, drag.w - (e.clientX - drag.x))); panel.style.width = nw + "px"; panel.style.height = ""; }
      else { var nh = Math.max(120, Math.min(window.innerHeight - 160, drag.h - (e.clientY - drag.y))); panel.style.height = nh + "px"; panel.style.width = ""; }
    }
    function up() { drag = null; document.body.style.userSelect = ""; window.removeEventListener("pointermove", mv); window.removeEventListener("pointerup", up); }
  }
  function setDock(d) {
    S.dock = d;
    $("#runsDock").className = "runs-dock " + d;
    $("#splitpanel").style.width = ""; $("#splitpanel").style.height = "";
    document.querySelectorAll("#dockToggle [data-dock]").forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-dock") === d); });
    renderOutput();
  }

  /* ---- toast ------------------------------------------------------------- */
  var tt;
  function toast(m) { var el = $("#toast"); el.innerHTML = I.check + esc(m); el.classList.add("show"); clearTimeout(tt); tt = setTimeout(function () { el.classList.remove("show"); }, 2000); }

  /* ---- init -------------------------------------------------------------- */
  function init() {
    renderTable();
    renderPanel();
    wireResize();
    document.querySelectorAll("#dockToggle [data-dock]").forEach(function (b) { b.addEventListener("click", function () { setDock(b.getAttribute("data-dock")); }); });
    $("#fsClose").addEventListener("click", function () { S.fsTarget = -1; $("#fsOverlay").classList.remove("show"); });
    $("#fsOverlay").addEventListener("click", function (e) { if (e.target.id === "fsOverlay") { S.fsTarget = -1; $("#fsOverlay").classList.remove("show"); } });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") { S.fsTarget = -1; $("#fsOverlay").classList.remove("show"); } });
    $("#fsCopy").addEventListener("click", function () {
      var t = S.fsTarget >= 0 ? T[S.fsTarget] : null;
      if (!t) return;
      var text = t.shown.join("\n");
      navigator.clipboard.writeText(text).then(function () { toast("Output copied"); }).catch(function () { toast("Copy failed"); });
    });
    $("#fsDownload").addEventListener("click", function () {
      var t = S.fsTarget >= 0 ? T[S.fsTarget] : null;
      if (!t) return;
      var r = run();
      var text = t.shown.join("\n");
      var blob = new Blob([text], { type: "text/plain" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url; a.download = (r ? r.cmd : "run") + "-" + t.env + ".txt";
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast("Downloaded " + (r ? r.cmd : "run") + "-" + t.env + ".txt");
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
