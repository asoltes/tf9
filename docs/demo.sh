#!/usr/bin/env bash
# Demo script for asciinema recording.
# Run via: asciinema rec docs/demo.cast --command "bash docs/demo.sh"
set -e

TF9="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/tf9"
CFG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/examples/sample-config.yaml"
PROFILE="ctp-loadtest-euw2"
DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/examples/infrastructure/environments/dev"

type_cmd() {
  printf '\033[1;32m$\033[0m '
  local s="$*"
  for ((i = 0; i < ${#s}; i++)); do
    printf '%s' "${s:$i:1}"
    sleep 0.03
  done
  printf '\n'
  sleep 0.25
}

run() {
  type_cmd "$@"
  eval "$@"
  echo
}

clear
sleep 0.5

# ── Section 1: version / help ───────────────────────────────────────────────
type_cmd "tf9 --help"
"$TF9" --help
echo
sleep 1

# ── Section 2: list configured repos ────────────────────────────────────────
printf '\033[2m# list registered repositories\033[0m\n'
sleep 0.4
type_cmd "tf9 --config ./examples/sample-config.yaml config repo list"
"$TF9" --config "$CFG" config repo list
echo
sleep 1

# ── Section 3: plan a registered repo (all targets) ─────────────────────────
printf '\033[2m# plan all targets in promotion order\033[0m\n'
sleep 0.4
type_cmd "tf9 --config ./examples/sample-config.yaml plan --repo infrastructure --profile $PROFILE"
"$TF9" --config "$CFG" plan --repo infrastructure --profile "$PROFILE"
echo
sleep 1.5

# ── Section 4: CWD mode ─────────────────────────────────────────────────────
printf '\033[2m# CWD mode — run from any terraform directory, no config needed\033[0m\n'
sleep 0.4
type_cmd "cd examples/infrastructure/environments/dev"
cd "$DEV_DIR"
sleep 0.3

type_cmd "tf9 plan --profile $PROFILE"
"$TF9" plan --profile "$PROFILE"
echo
sleep 1
