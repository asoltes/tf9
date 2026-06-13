# Blast-radius demo

A deliberately large, self-contained Terraform configuration for exercising the
tf9 **Graph View** blast-radius visualization. The Terraform uses only the
built-in `terraform_data` resource, so it needs **no providers, no cloud
credentials, and no network access**.

The repository is split into **four `region` modules** (`alpha`, `bravo`,
`charlie`, `delta`), all instances of `modules/region`. Each becomes its own
**cluster** in the Graph View, with an internal dependency chain.

## What the plan looks like

The variable defaults in `main.tf` are the *desired* ("after") state. The
committed `terraform.tfstate` was produced by applying the *previous* ("before")
values (see `regenerate.sh`). Running a plan therefore produces a rich mix
(figures below are across all four regions):

| Action  | ~count | Where it comes from |
|---------|--------|---------------------|
| update  | ~124   | `cluster` + `service_stable` get an in-place `input` bump (`v1`→`v2`) |
| replace | ~100   | `service_volatile` keyed on a changed `ring` + cluster output |
| create  | ~52    | new `observability` resources + extra `service_stable` instances |
| destroy | ~32    | `legacy` resources removed in the desired state |

≈284 resources total. `terraform plan` reports: **152 to add, 124 to change,
132 to destroy** (replacements count as add+destroy).

## Cluster + dependency layout (what makes blast radius visible)

Each `region` module is an independent cluster with this internal chain:

```
foundation ──▶ gateway ──▶ cluster[0..2] ──▶ service_volatile[*]
                       │                  └─▶ observability[*]
                       └─▶ service_stable[*]
legacy[*]   (standalone — contained blast radius)
```

- Select a region's **foundation** or **gateway** → its entire cluster (~71
  resources) lights up as the blast radius.
- Select a single **cluster** node → only its dependent volatile/observability
  services highlight.
- The four regions are independent, so they render as four separate clusters
  (cross-module references pass through variables and intentionally do not create
  edges between clusters).

## Try it

**Plain Terraform** — see the change set (local modules need `init` once; still
no providers/creds):

```bash
cd examples/blast-radius
terraform init       # registers the local modules
terraform plan
```

**tf9 CLI, credential-free** — runs init+plan and writes an HTML report, no AWS
profile required (CWD mode skips the AWS gate):

```bash
cd examples/blast-radius && tf9 plan
```

**tf9 Graph View** — the graph artifact is only produced by a **web run**.
Configured targets carry an AWS profile, so the web run applies tf9's normal
profile gate (the `blast-radius` target reuses the demo's `example-dev` profile,
exactly like the `infrastructure` targets). Start the server, launch a `plan`,
then open **Graph View**:

```bash
./tf9 --config ./examples/sample-config.yaml serve
# New Run → repo: blast-radius → command: plan → Run
# then open Graph View and select a region's foundation node
```

## Rebuilding the state

To regenerate the committed "before" state (e.g. after editing `main.tf` or the
module):

```bash
./examples/blast-radius/regenerate.sh
```
