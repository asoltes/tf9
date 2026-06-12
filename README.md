# tf9

`tf9` runs Terraform commands across ordered repository targets. The CLI and
local web UI share one YAML configuration file and the same binary.

## Demo

![tf9 demo](docs/demo.svg)

## Features

| Feature | Description |
|---|---|
| **Multi-target promotion** | Targets execute in YAML order (dev → staging → prod). `apply` stops on first failure. |
| **Registered repos** | Register any Terraform repository and its targets once; run across all of them with `--repo`. |
| **CWD mode** | Run `tf9 plan` or `tf9 apply` from any directory that contains `.tf` files — no config needed. Reports and history are recorded the same way. |
| **Native approval gate** | `apply` and `destroy` let terraform show its own plan and `Enter a value:` prompt. `--force` adds `-auto-approve` to skip it (CI/CD). |
| **Parallel execution** | `--parallel` runs up to four targets concurrently for `plan` and read-only commands, streaming prefixed output per target. |
| **Live web UI** | `tf9 serve` opens a local React UI with real-time SSE streaming, a run history panel, and per-environment terminal cards. |
| **Web approval gate** | In the web UI, an amber bar intercepts terraform's `Enter a value:` prompt — click Approve or Deny without leaving the browser. |
| **HTML reports** | Every run saves a self-contained HTML report under `~/.config/tf9/reports/`. Live reports update as each target finishes. |
| **Run history** | The last 200 CLI and web runs are persisted to `~/.config/tf9/runs.json` and visible in the Runs page. |
| **AWS SSO** | Each unique profile/account pair is validated against STS once per run; expired sessions trigger `aws sso login` automatically. |
| **Config management** | `tf9 config repo/target` commands and the in-app YAML editor share the same config file. |

## Screenshots

### Overview
![Overview](docs/screenshots/01-overview.png)

### Runs history with live split panel
![Runs detail](docs/screenshots/03-runs-detail.png)

### New Run modal — command, repo, branch, targets
![New run modal](docs/screenshots/04-new-run-modal.png)

### Repositories
![Repositories](docs/screenshots/05-repositories.png)

### Config YAML editor
![Config YAML editor](docs/screenshots/06-config-yaml.png)

### Reports
![Reports](docs/screenshots/07-reports.png)

### Collapsible sidebar
![Sidebar collapsed](docs/screenshots/08-sidebar-collapsed.png)

## Prerequisites

- Go 1.24.1 or newer
- Node.js 18 or newer and npm
- Terraform
- AWS CLI v2
- Git

## Build

```bash
git clone https://github.com/asoltes/tf-companion.git
cd tf-companion
make build
```

The React frontend is embedded into the generated `tf9` binary.

To install it on your user PATH:

```bash
make install
tf9 --help
```

By default this installs to `~/.local/bin/tf9`. Override the destination with
`make install BINDIR=/path/on/your/PATH`.

## Quick Start

```bash
# Start the web UI (auto-opens browser at http://127.0.0.1:8080)
tf9 serve

# Or try the demo (no AWS/Terraform required)
make demo
```

## Configuration

The default configuration path is `~/.config/tf9/config.yaml`.

```yaml
version: 1

web:
  # Require web applies to use the exact plan saved by a reviewed Plan run.
  saved_plan_apply: true

repositories:
  - name: infrastructure
    path: /absolute/path/to/infrastructure
    targets:
      - name: dev
        directory: environments/dev
        aws_profile: company-dev
        account_id: "123456789012"
        region: eu-west-2
      - name: staging
        directory: environments/staging
        aws_profile: company-staging
      - name: prod
        directory: environments/prod
        aws_profile: company-prod
        disabled: false
```

Targets execute in file order. `account_id`, `region`, and `disabled` are
optional. When `account_id` is present, tf9 verifies the AWS account returned
by STS before running Terraform.

Select another file with `--config` or `TF9_CONFIG`:

```bash
tf9 --config ./team-config.yaml config repo list
TF9_CONFIG=./team-config.yaml tf9 serve
```

Legacy `envs`, `repos`, and `repo-configs/*.json` files are migrated
automatically and moved to a timestamped backup directory.

## Manage Configuration

```bash
# Repositories
tf9 config repo list
tf9 config repo add infrastructure /absolute/path/to/infrastructure
tf9 config repo remove infrastructure

# Targets
tf9 config target list --repo infrastructure
tf9 config target add --repo infrastructure dev environments/dev \
  --profile company-dev --account-id 123456789012 --region eu-west-2
tf9 config target move --repo infrastructure prod --after staging
tf9 config target remove --repo infrastructure dev
```

The web UI edits the same repository targets. Settings also includes a raw
Config YAML editor for direct changes to this file. The editor validates the
schema before saving and preserves comments and ordering.

An example repo and matching config live under `examples/`:

```bash
tf9 --config ./examples/sample-config.yaml config repo list
tf9 --config ./examples/sample-config.yaml plan --repo infrastructure
```

## Run Terraform

```bash
# Plan all targets in a repo
tf9 plan --repo infrastructure

# Filter to a specific target
tf9 plan dev --repo infrastructure

# Apply and destroy — always prompt for confirmation before running
tf9 apply prod --repo infrastructure
tf9 destroy dev --repo infrastructure

# Skip confirmation (useful in CI/CD)
tf9 apply --repo infrastructure --force

# Run up to four targets concurrently (plan/state only — not apply/destroy)
tf9 plan --repo infrastructure --parallel

# Pass Terraform-specific flags after --
tf9 plan --repo infrastructure -- -refresh=false

# Resource targeting
tf9 plan --repo infrastructure --target aws_s3_bucket.example

# Variable files
tf9 apply --repo infrastructure --var-file vars/override.tfvars

# Force-unlock a stuck state
tf9 apply --repo infrastructure --lock-ids dev:abc123,staging:def456

# Other Terraform commands (state, output, etc.)
tf9 state list --repo infrastructure
tf9 state list --repo infrastructure --filter dev
tf9 output --repo infrastructure

# Unmanaged run — discovers .tf directories below the current directory
tf9 plan
tf9 plan --profile my-aws-profile
```

Without `--repo`, tf9 first checks whether the current directory itself
contains `.tf` files and runs there directly. If it doesn't, it falls back to
scanning immediate subdirectories for `.tf` files. Both modes use `--profile`
or `AWS_PROFILE` for authentication, and both record reports and run history
exactly like a managed repo run.

Plan, apply, and destroy accept a positional target filter. Other Terraform
commands use `--filter`, so arguments such as `state list`, output names, import
IDs, and lock IDs pass through unchanged.

Sequential execution is the default. `--parallel` runs up to four targets
concurrently and streams output with target prefixes. Apply and destroy always
remain sequential.

Each unique AWS profile/account combination is validated once per run.

### CLI Approval Gate

For `apply` and `destroy`, tf9 runs terraform without `-auto-approve` so
terraform itself shows the full plan and then asks:

```
Do you want to perform these actions?
  Terraform will perform the actions described above.
  Only 'yes' will be accepted to approve.

  Enter a value:
```

This is identical to running `terraform apply` directly — you see exactly what
will change before confirming. Pass `--force` to add `-auto-approve` and skip
the prompt entirely (useful in CI/CD pipelines).

## Web UI

```bash
tf9 serve
tf9 serve --port 9090
tf9 serve --report latest
tf9 serve --report 2
```

The default address is <http://127.0.0.1:8080>. The server manages a PID file
so a second `tf9 serve` kills the first before starting.

### Pages

| Page | Description |
|---|---|
| **Overview** | Hub cards — quick links to all sections |
| **Runs** | Run history with status badges and live split panel |
| **Repositories** | Manage repos and pipeline stages; drag-and-drop reorder |
| **Config** | Raw YAML editor with schema validation |
| **Reports** | Browse and view saved HTML plan reports |
| **Help** | In-app documentation |

### New Run Modal

Open via the **New run** button or the `+` icon. Fields:

- **Command** — plan, apply, destroy, state, output, import, force-unlock
- **Repo** — one of the configured repositories
- **Branch** — current branch shown; pull button to fetch latest
- **Targets** — pipeline checkboxes grouped by environment; uncheck to skip
- **Auto-approve** — skip the mid-run confirmation for apply/destroy
- **Parallel** — run plan targets concurrently
- **Env filter** — type to filter which targets run
- **Extra flags** — pass raw Terraform arguments (e.g. `-target=aws_s3_bucket.x`)
- **Promotion order** — drag stages to set sequential promotion order

A live CLI preview at the bottom of the modal shows the exact command that will
run, including all resolved flags.

### Live Terminal (Split Panel)

Clicking any run opens the split panel — dock it at the **bottom** or **side**,
or go **fullscreen**. The panel streams live output via SSE as terraform runs.
Each environment gets its own collapsible terminal card.

**Promotion runs** display a vertical stepper with collapsible sections — each
stage auto-expands while running and collapses when done. The promotion stops on
first failure.

**Parallel runs** display a multi-column grid or tab view with a merged option
to see all output in one stream.

### Approval Gate (Web UI)

When `auto-approve` is off and an apply/destroy run reaches terraform's
`Enter a value:` prompt, the split panel intercepts the output and shows an
amber approval bar:

```
⚠  Terraform is waiting for your approval — only "yes" will be accepted to apply.
[  yes  ] [ Approve ] [ Deny ]
```

- **Approve** — sends `yes` to terraform; the run continues.
- **Deny** — sends `no` to terraform; the run ends with status **denied**
  (amber, distinct from the red failed status).

### Run Statuses

| Status | Color | Meaning |
|---|---|---|
| `running` | blue | Terraform is executing |
| `success` | green | All targets completed successfully |
| `failed` | red | Terraform exited non-zero (error or rejected plan) |
| `denied` | amber | User clicked Deny on the approval gate |
| `cancelled` | grey | User cancelled the run |

### Retry Failed

On a failed run, the **Retry failed** button replays only the targets that
failed. Clicking it opens the **Retry Branch Modal**, which shows:

- The current git branch
- Pull button to fetch latest changes before retrying
- Git status summary
- Confirmation to proceed

### Repositories Page

Each repository is shown as a card or table row. Actions:

- **Rename** — edit the repo name inline
- **Delete** — remove the repo from config
- **Edit stages** — open the EditStage modal to configure pipeline groups and
  promotion gates
- **Drag-and-drop reorder** — drag stage cards to change execution order

## Global CLI Flags

All `tf9` commands accept:

| Flag | Default | Description |
|---|---|---|
| `--config` | `~/.config/tf9/config.yaml` | Configuration file path |
| `--repo`, `-r` | — | Configured repository name |
| `--filter` | — | Target name filter |
| `--profile`, `-p` | — | Override AWS profile for all targets |
| `--nonprod` | false | Skip targets whose names start with `prod` |
| `--report-dir` | `~/.config/tf9/reports` | Directory to save HTML reports |
| `--no-report` | false | Disable HTML report generation |
| `--show-report` | false | Open the generated report in the web UI after run |
| `--timeout` | 30m | Maximum Terraform run duration |
| `--force` | false | Skip apply/destroy confirmation |
| `--parallel` | false | Run up to four targets concurrently |
| `--target` | — | Terraform resource target (repeatable) |
| `--var-file` | — | Terraform variable file (repeatable) |
| `--lock-ids` | — | Per-target lock IDs for force-unlock (e.g. `dev:abc,staging:def`) |

## Sensitive Data

The YAML file stores AWS profile names and optional account metadata, never AWS
credentials. Authentication remains in the AWS CLI configuration.

Terraform reports can contain infrastructure details. They are stored outside
the repository under `~/.config/tf9/reports` by default and should be reviewed
before sharing.
