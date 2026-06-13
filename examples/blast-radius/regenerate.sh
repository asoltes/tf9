#!/usr/bin/env bash
# Rebuild the committed "before" terraform.tfstate used by the blast-radius demo.
#
# The variable DEFAULTS in main.tf describe the "after" desired state. This
# script applies the "before" values so that a later `terraform plan` (or a tf9
# plan run) surfaces a mix of add / update / replace / destroy.
#
# Uses only the built-in terraform_data resource — no providers, no cloud
# credentials, no network access.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf .terraform .terraform.lock.hcl terraform.tfstate terraform.tfstate.backup
terraform init -no-color >/dev/null

terraform apply -no-color -auto-approve \
  -var release=v1 \
  -var ring=r1 \
  -var services=28 \
  -var volatile=25 \
  -var observability=0 \
  -var legacy=8

rm -rf .terraform .terraform.lock.hcl terraform.tfstate.backup

echo
echo "Before-state rebuilt. Preview the change set with:"
echo "  terraform plan"
