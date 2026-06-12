# Graph Report - .  (2026-06-10)

## Corpus Check
- 151 files · ~198,596 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1139 nodes · 2231 edges · 64 communities (54 shown, 10 thin omitted)
- Extraction: 93% EXTRACTED · 7% INFERRED · 0% AMBIGUOUS · INFERRED: 165 edges (avg confidence: 0.85)
- Token cost: 574,518 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_REST API Handlers|REST API Handlers]]
- [[_COMMUNITY_Runner Execution Engine|Runner Execution Engine]]
- [[_COMMUNITY_API Handler Tests|API Handler Tests]]
- [[_COMMUNITY_Run Manager and SSE|Run Manager and SSE]]
- [[_COMMUNITY_Run Split Panel UI|Run Split Panel UI]]
- [[_COMMUNITY_Repositories Page UI|Repositories Page UI]]
- [[_COMMUNITY_Prototype Runs Page JS|Prototype Runs Page JS]]
- [[_COMMUNITY_Prototype Design System|Prototype Design System]]
- [[_COMMUNITY_New Run Modal UI|New Run Modal UI]]
- [[_COMMUNITY_Examples and Prototype Reports|Examples and Prototype Reports]]
- [[_COMMUNITY_Prototype New Run Modal JS|Prototype New Run Modal JS]]
- [[_COMMUNITY_Prototype Modal Run Logic|Prototype Modal Run Logic]]
- [[_COMMUNITY_Prototype Report Renderer|Prototype Report Renderer]]
- [[_COMMUNITY_UI Verification Snapshots|UI Verification Snapshots]]
- [[_COMMUNITY_Graphify Skill Pipeline|Graphify Skill Pipeline]]
- [[_COMMUNITY_Report Viewer UI|Report Viewer UI]]
- [[_COMMUNITY_Frontend Package Dependencies|Frontend Package Dependencies]]
- [[_COMMUNITY_Overview Hub and Routing|Overview Hub and Routing]]
- [[_COMMUNITY_Prototype YAML Editor JS|Prototype YAML Editor JS]]
- [[_COMMUNITY_TypeScript Compiler Config|TypeScript Compiler Config]]
- [[_COMMUNITY_Runs List Page|Runs List Page]]
- [[_COMMUNITY_Toast and Identity Utils|Toast and Identity Utils]]
- [[_COMMUNITY_HTTP Server Wiring|HTTP Server Wiring]]
- [[_COMMUNITY_Prototype Reports List JS|Prototype Reports List JS]]
- [[_COMMUNITY_CLI Demo Recording|CLI Demo Recording]]
- [[_COMMUNITY_HTML Report Generator|HTML Report Generator]]
- [[_COMMUNITY_Reports Page Screenshot|Reports Page Screenshot]]
- [[_COMMUNITY_Report Helper Utilities|Report Helper Utilities]]
- [[_COMMUNITY_Runs Page Screenshot|Runs Page Screenshot]]
- [[_COMMUNITY_Run Detail Screenshot|Run Detail Screenshot]]
- [[_COMMUNITY_New Run Modal Screenshot|New Run Modal Screenshot]]
- [[_COMMUNITY_Overview Page Screenshot|Overview Page Screenshot]]
- [[_COMMUNITY_Config Editor Screenshot|Config Editor Screenshot]]
- [[_COMMUNITY_AWS SSO Session|AWS SSO Session]]
- [[_COMMUNITY_Collapsed Sidebar Screenshot|Collapsed Sidebar Screenshot]]
- [[_COMMUNITY_Retry Branch Modal|Retry Branch Modal]]
- [[_COMMUNITY_STS Badge and API Client|STS Badge and API Client]]
- [[_COMMUNITY_Config YAML Editor Page|Config YAML Editor Page]]
- [[_COMMUNITY_Repositories Page Screenshot|Repositories Page Screenshot]]
- [[_COMMUNITY_Sample Plan Report Data|Sample Plan Report Data]]
- [[_COMMUNITY_Sample Plan Report Data 2|Sample Plan Report Data 2]]
- [[_COMMUNITY_Claude Project Settings|Claude Project Settings]]
- [[_COMMUNITY_Prototype Theme Toggle|Prototype Theme Toggle]]
- [[_COMMUNITY_Prototype STS Simulation|Prototype STS Simulation]]
- [[_COMMUNITY_Prototype Theme Toggle 2|Prototype Theme Toggle 2]]
- [[_COMMUNITY_Prototype Theme Toggle 3|Prototype Theme Toggle 3]]
- [[_COMMUNITY_Help Page|Help Page]]
- [[_COMMUNITY_Prototype Theme Toggle 4|Prototype Theme Toggle 4]]
- [[_COMMUNITY_Prototype Theme Toggle 5|Prototype Theme Toggle 5]]
- [[_COMMUNITY_Relative Time Utility|Relative Time Utility]]
- [[_COMMUNITY_Screenshot Capture Script|Screenshot Capture Script]]
- [[_COMMUNITY_Local Permission Settings|Local Permission Settings]]
- [[_COMMUNITY_Graphify Query Concepts|Graphify Query Concepts]]
- [[_COMMUNITY_Python Screenshot Script|Python Screenshot Script]]
- [[_COMMUNITY_Shared YAML Config|Shared YAML Config]]
- [[_COMMUNITY_Cloudscape Pixel Port|Cloudscape Pixel Port]]
- [[_COMMUNITY_Hash Routing Context|Hash Routing Context]]
- [[_COMMUNITY_HTML Report Concept|HTML Report Concept]]
- [[_COMMUNITY_Reports History Page|Reports History Page]]

## God Nodes (most connected - your core abstractions)
1. `$()` - 47 edges
2. `Config` - 40 edges
3. `$()` - 37 edges
4. `Handler()` - 37 edges
5. `$()` - 35 edges
6. `ResponseWriter` - 30 edges
7. `jsonErr()` - 30 edges
8. `jsonOK()` - 27 edges
9. `Request` - 27 edges
10. `Run()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `RunManager` --shares_data_with--> `runs.json Persisted Run History`  [EXTRACTED]
  internal/api/manager.go → CLAUDE.md
- `CLI Approval Gate (Native Terraform Prompt)` --references--> `runTerraform()`  [EXTRACTED]
  CLAUDE.md → cmd/tf9/main.go
- `runTerraform()` --conceptually_related_to--> `cmd/tf9/main.go CLI Commands Package`  [EXTRACTED]
  cmd/tf9/main.go → CLAUDE.md
- `safeJoin()` --conceptually_related_to--> `internal/api HTTP Handlers and RunManager`  [EXTRACTED]
  internal/api/handlers.go → CLAUDE.md
- `RunManager` --conceptually_related_to--> `internal/api HTTP Handlers and RunManager`  [EXTRACTED]
  internal/api/manager.go → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Terraform Approval Gate Flow (CLI and Web)** — claude_cli_approval_gate, readme_native_approval_gate, readme_web_approval_gate, tf9_main_runterraform, runner_runner_run [EXTRACTED 0.90]
- **Web UI Run Lifecycle** — readme_new_run_modal, api_manager_runmanager, claude_sse_streaming, readme_split_panel_terminal, readme_run_statuses, readme_retry_failed [INFERRED 0.85]
- **Graphify Two-Track Extraction Pipeline** — graphify_skill_ast_extraction, graphify_skill_semantic_extraction, graphify_skill_extraction_cache, references_extraction_spec_subagent_prompt, references_extraction_spec_node_id_format [EXTRACTED 0.90]
- **tf9 Dark/Light Theming System** — design_handoff_tf9_readme_dark_light_mode, design_handoff_tf9_readme_design_tokens, design_handoff_tf9_readme_terminal_tokens, design_handoff_tf9_theme_js, design_handoff_tf9_theme_css, design_handoff_tf9_cloudscape_css [EXTRACTED 1.00]
- **Live Run Monitoring Experience (Runs page)** — design_handoff_tf9_readme_split_panel, design_handoff_tf9_readme_fullscreen_modal, design_handoff_tf9_readme_terminal_tokens, design_handoff_tf9_readme_promotion_mode [EXTRACTED 1.00]
- **Shared Report Rendering System (plan/apply/destroy)** — reports_apply_report_page, reports_report_js, reports_report_css, reports_data_apply_js, design_handoff_tf9_readme_report_pages [EXTRACTED 1.00]
- **Design Handoff Prototype Page Suite** — reports_destroy_report, reports_plan_report, reports_reports, repos_repositories, runs_new_run_modal, runs_runs [EXTRACTED 1.00]
- **tf9-color-mode Theme Persistence Contract** — specs_2026_06_08_prototype_pixel_port_design_fouc_theme_init, frontend_index, reports_plan_report, reports_destroy_report, reports_tf9_plan_20260609_070026, reports_tf9_plan_20260609_070051, reports_tf9_plan_20260609_070126 [INFERRED 0.95]
- **tf9 UI Redesign Spec Lineage (redesign -> parity -> pixel-port)** — specs_2026_06_07_tf9_ui_redesign, specs_2026_06_07_tf9_ui_prototype_parity_design, specs_2026_06_08_prototype_pixel_port_design [INFERRED 0.95]

## Communities (64 total, 10 thin omitted)

### Community 0 - "REST API Handlers"
Cohesion: 0.10
Nodes (71): awsProfileDetail, addRepo(), browseRepo(), cancelRun(), checkoutRepo(), cherryPickRepo(), deleteReport(), downloadReport() (+63 more)

### Community 1 - "Runner Execution Engine"
Cohesion: 0.08
Nodes (53): Builder, CWD Mode (Run Without Configured Repo), internal/runner Execution Engine, Context, Mutex, RepoTarget, Time, T (+45 more)

### Community 2 - "API Handler Tests"
Cohesion: 0.09
Nodes (54): TestAWSIdentityMethodNotAllowed(), TestConfigAPIReadsAndPreservesRawYAML(), TestConfigAPIRejectsRevisionConflict(), TestDriftAPIIsRemoved(), testHandler(), TestRepoAPIRejectsTargetWithoutAWSProfile(), TestRepoAPIWritesRepositoryAndTargetsToSharedConfig(), TestRunRequestDecodesLockIDs() (+46 more)

### Community 3 - "Run Manager and SSE"
Cohesion: 0.07
Nodes (37): lineWriter, AppendCLIRun(), gitBranch(), NewRunManager(), Run, RunManager, runRecord, RunRequest (+29 more)

### Community 4 - "Run Split Panel UI"
Cohesion: 0.08
Nodes (35): ConfirmModalProps, applyFilter(), cmdBadgeClass(), Dock, duration(), FsFilter, FullscreenState, I (+27 more)

### Community 5 - "Repositories Page UI"
Cohesion: 0.07
Nodes (38): ConfigureProps, DragState, RepoRowData, Repos(), StageCard(), TargetWithGate, useProtoToast(), EditStageModal() (+30 more)

### Community 6 - "Prototype Runs Page JS"
Cohesion: 0.13
Nodes (44): $(), aggStats(), appendLine(), applyLines(), autoscroll(), cardHead(), clearWaiting(), cmdBadge() (+36 more)

### Community 7 - "Prototype Design System"
Cohesion: 0.06
Nodes (45): Config YAML Editor Page Prototype (Config YAML.html), editor.css — Config YAML Editor Styles, editor.js — Config YAML Editor Logic, cloudscape.css — Design Tokens Stylesheet, Overview Hub Page Prototype (index.html), Config YAML Editor Concept, Dark/Light Theming via html[data-theme], Cloudscape-Style Design Tokens (cloudscape.css) (+37 more)

### Community 8 - "New Run Modal UI"
Cohesion: 0.08
Nodes (34): buildGroups(), COMMON, Group, I, Mode, Props, readGroupOverrides(), readOverrides() (+26 more)

### Community 9 - "Examples and Prototype Reports"
Cohesion: 0.09
Nodes (35): Examples README, Example tf9 Config (sample-config.yaml), frontend/index.html SPA Entry, Example Infrastructure Repo README, Destroy Report Prototype Page, Plan Report Prototype Page, Reports History Prototype Page, add (+27 more)

### Community 10 - "Prototype New Run Modal JS"
Cohesion: 0.18
Nodes (36): $(), activeTargets(), addTarget(), arrayMove(), closeModal(), deriveGroups(), endDrag(), envColor() (+28 more)

### Community 11 - "Prototype Modal Run Logic"
Cohesion: 0.19
Nodes (33): $(), buildGroups(), checkedTargets(), cliPreview(), copy(), doRun(), endDrag(), envColor() (+25 more)

### Community 12 - "Prototype Report Renderer"
Cohesion: 0.15
Nodes (30): allOpen(), applyCodes(), applyThemeIcon(), autoCollapseEmpty(), autoOpen(), buildCards(), buildDetails(), buildHeader() (+22 more)

### Community 13 - "UI Verification Snapshots"
Cohesion: 0.07
Nodes (28): Runs Page Snapshot (STS Checking, Empty Table), Runs Page Snapshot (STS Checking, Duplicate Capture), New Run Modal Snapshot (init Command, STS Authenticated), New Run Modal Snapshot (plan Command Selected), Failed Run Split Panel Snapshot (run-0001, exit 255), Fullscreen Terminal Snapshot (Output Filters and Search), Fullscreen Terminal Snapshot (Repeat Capture), AGENTS.md Developer Guide Pointer (+20 more)

### Community 14 - "Graphify Skill Pipeline"
Cohesion: 0.09
Nodes (25): Graphify Skill Trigger Instruction, Structural AST Extraction (Part A), EXTRACTED/INFERRED/AMBIGUOUS Audit Trail, Community Detection, Community Labeling (Step 5), Cumulative Token Cost Tracker, Semantic Extraction Cache, God Nodes Analysis (+17 more)

### Community 15 - "Report Viewer UI"
Cohesion: 0.12
Nodes (15): NewRunModal(), useToast(), AnsiState, applyCodes(), EnvBlock(), fmtTime(), highlight(), I (+7 more)

### Community 16 - "Frontend Package Dependencies"
Cohesion: 0.10
Nodes (20): dependencies, react, react-dom, devDependencies, jsdom, @types/react, @types/react-dom, typescript (+12 more)

### Community 17 - "Overview Hub and Routing"
Cohesion: 0.15
Nodes (16): CARDS, HubCard, Overview(), OverviewProps, ReportsPage(), NavContext, NavCtx, useNav() (+8 more)

### Community 18 - "Prototype YAML Editor JS"
Cohesion: 0.27
Nodes (19): $(), curLineIndex(), esc(), format(), gotoLine(), highlight(), hlLine(), hlVal() (+11 more)

### Community 19 - "TypeScript Compiler Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleResolution, noEmit (+10 more)

### Community 20 - "Runs List Page"
Cohesion: 0.12
Nodes (10): Dock, BrowseEntry, BrowseResult, ImportSpec, Paginated, RepoConfig, ReportData, ReportEnvResult (+2 more)

### Community 21 - "Toast and Identity Utils"
Cohesion: 0.14
Nodes (7): ShowToast, Toast, ToastContext, ToastProvider(), ToastType, identityLabel(), Mode

### Community 22 - "HTTP Server Wiring"
Cohesion: 0.20
Nodes (15): HandlerFunc, RunManager, Time, Handler, reportEntry, freePort(), indexHandler(), killPreviousServer() (+7 more)

### Community 23 - "Prototype Reports List JS"
Cohesion: 0.29
Nodes (16): $(), cmdBadge(), esc(), filtered(), init(), relTime(), renderCards(), renderFilters() (+8 more)

### Community 24 - "CLI Demo Recording"
Cohesion: 0.18
Nodes (15): AWS Profile Override (--profile ctp-loadtest-euw2), tf9 config repo list Command, CWD Mode (Plan From Any Terraform Directory), tf9 --help Output, HTML Plan Report Output, infrastructure Example Repo (2 Targets), tf9 plan Command, Plan Summary Table (ENVIRONMENT/ADD/CHANGE/DESTROY/STATUS) (+7 more)

### Community 25 - "HTML Report Generator"
Cohesion: 0.23
Nodes (15): HTML, EnvResult, Time, EnvResult, Options, ansiStyle(), ansiToHTML(), colorizeLine() (+7 more)

### Community 26 - "Reports Page Screenshot"
Cohesion: 0.15
Nodes (16): Breadcrumb Navigation (tf9 / Reports), Cards/List View Toggle, Dark Theme UI, Environment Count Chips (N envs / N failed), Operation Filter Tabs (All/Plan/Apply/Destroy), Operation Type Badges (init/plan), Relative Time Labels (4m ago, 2h ago), Report Card Grid (+8 more)

### Community 27 - "Report Helper Utilities"
Cohesion: 0.21
Nodes (7): changeBarProportions(), commandCounts(), filterByCommand(), badgeColor(), CmdBadge(), ViewMode, Report

### Community 28 - "Runs Page Screenshot"
Cohesion: 0.15
Nodes (15): CLI-Originated Run (run-cli-* ID format), Command Badges (init/plan), Dark Theme, ecp-infra-tf Repository, New Run Button, Promotion Run Mode, Run Status Indicators (failed/success/done), Run Output Streaming (select a run to stream its output) (+7 more)

### Community 29 - "Run Detail Screenshot"
Cohesion: 0.16
Nodes (15): CLI-Originated Run (run-cli- prefix), Dark Theme UI, Live Target Output Terminal, New Run Button, Promotion Chain Visualization, Promotion Mode (in-order, stops on failure), Run Actions (Re-run, View report), Run Detail Split Panel (+7 more)

### Community 30 - "New Run Modal Screenshot"
Cohesion: 0.16
Nodes (15): Branch Selector with Up-to-date Indicator, CLI Command Preview (tf9 init -r ecp-infra-tf), Command Selector (init/plan/apply/destroy), Dark Theme UI, More Commands Dropdown, New Run Modal Screenshot, Parallel Mode (up to four targets at once), Promotion Mode (sequential, stop on first failure) (+7 more)

### Community 31 - "Overview Page Screenshot"
Cohesion: 0.20
Nodes (14): AWS SSO Authentication Status, Card Grid Layout, Config YAML Editor, Dark/Light Theme Toggle, Help Page, New Run Flow, Overview Page (tf9 Web UI), Promotion Pipeline (+6 more)

### Community 32 - "Config Editor Screenshot"
Cohesion: 0.19
Nodes (14): Per-Target AWS Profile and Region Mapping, Shared Config File (~/.config/tf9/config.yaml), Config YAML Editor Page (tf9 Web UI), Dark Theme Mode, Disabled Target Flag (fix-prod-euw2 disabled: true), ecp-infra-tf Repository Entry, No-Credentials-In-Config Policy, Reload and Save Actions (+6 more)

### Community 33 - "AWS SSO Session"
Cohesion: 0.27
Nodes (10): awsIdentityResponse, Identity, callerAccount(), EnsureSession(), GetIdentity(), parseIdentity(), TestParseIdentity(), TestParseIdentityInvalidJSON() (+2 more)

### Community 34 - "Collapsed Sidebar Screenshot"
Cohesion: 0.21
Nodes (12): Breadcrumb Navigation, Collapsed Side Navigation, Dark Theme, New Run Button, Promotion Run Mode, Run Status Indicators (success/failed), Runs Page, Runs History Table (+4 more)

### Community 35 - "Retry Branch Modal"
Cohesion: 0.22
Nodes (8): RepoStatus, I, Props, RepoStatus, Props, repoGit, GitChangedFile, Run

### Community 36 - "STS Badge and API Client"
Cohesion: 0.22
Nodes (7): ActionState, AuthState, api, awsApi, reportsApi, GitCommit, Identity

### Community 37 - "Config YAML Editor Page"
Cohesion: 0.25
Nodes (9): ConfigYaml(), esc(), highlightHtml(), hlLine(), hlVal(), I, Problem, Sev (+1 more)

### Community 38 - "Repositories Page Screenshot"
Cohesion: 0.22
Nodes (11): Add Repository Action, All Repositories Table, AWS Profiles (ctp-dev-euw2, ctp-qa-euw2, ctp-loadtest-euw2), Config YAML (~/.config/tf9/config.yaml), Dark Theme UI, ecp-infra-tf Repository, Promotion Pipeline, Repositories Page (+3 more)

### Community 39 - "Sample Plan Report Data"
Cohesion: 0.20
Nodes (9): add, change, command, destroy, envs, failed, repoLabel, results (+1 more)

### Community 40 - "Sample Plan Report Data 2"
Cohesion: 0.20
Nodes (9): add, change, command, destroy, envs, failed, repoLabel, results (+1 more)

### Community 41 - "Claude Project Settings"
Cohesion: 0.33
Nodes (5): enableAllProjectMcpServers, enabledPlugins, frontend-design@claude-plugins-official, hooks, PreToolUse

### Community 42 - "Prototype Theme Toggle"
Cohesion: 0.60
Nodes (3): get(), init(), paintButtons()

### Community 43 - "Prototype STS Simulation"
Cohesion: 0.70
Nodes (4): getAuth(), init(), render(), setAuth()

### Community 44 - "Prototype Theme Toggle 2"
Cohesion: 0.60
Nodes (3): get(), init(), paintButtons()

### Community 45 - "Prototype Theme Toggle 3"
Cohesion: 0.60
Nodes (3): get(), init(), paintButtons()

### Community 47 - "Prototype Theme Toggle 4"
Cohesion: 0.60
Nodes (3): get(), init(), paintButtons()

### Community 48 - "Prototype Theme Toggle 5"
Cohesion: 0.60
Nodes (3): get(), init(), paintButtons()

### Community 52 - "Graphify Query Concepts"
Cohesion: 0.67
Nodes (3): Fast Path: Query Existing Graph, Native CLAUDE.md Integration (graphify claude install), Constrained Query Vocabulary Expansion

## Ambiguous Edges - Review These
- `Ordered Terraform Targets (fix-dev/qa/loadtest/prod-euw2)` → `Dark Theme Mode`  [AMBIGUOUS]
  docs/screenshots/06-config-yaml.png · relation: conceptually_related_to
- `STS Identity Badge (Checking state)` → `Run Status Indicators (success/failed)`  [AMBIGUOUS]
  docs/screenshots/08-sidebar-collapsed.png · relation: conceptually_related_to

## Knowledge Gaps
- **245 isolated node(s):** `frontend-design@claude-plugins-official`, `enableAllProjectMcpServers`, `PreToolUse`, `allow`, `Mutex` (+240 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **10 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Ordered Terraform Targets (fix-dev/qa/loadtest/prod-euw2)` and `Dark Theme Mode`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `STS Identity Badge (Checking state)` and `Run Status Indicators (success/failed)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `RunSplitPanel()` connect `Run Split Panel UI` to `Overview Hub and Routing`, `Prototype Runs Page JS`, `Report Viewer UI`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `cardHead()` connect `Prototype Runs Page JS` to `Run Split Panel UI`?**
  _High betweenness centrality (0.026) - this node is a cross-community bridge._
- **Why does `Run()` connect `Runner Execution Engine` to `HTML Report Generator`, `Run Manager and SSE`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `Handler()` (e.g. with `GetIdentity()` and `Load()`) actually correct?**
  _`Handler()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `frontend-design@claude-plugins-official`, `enableAllProjectMcpServers`, `PreToolUse` to the rest of the system?**
  _249 weakly-connected nodes found - possible documentation gaps or missing edges._