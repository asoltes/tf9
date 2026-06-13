# One self-contained "region" cluster. Each instantiation becomes its own
# module node in the tf9 graph, so the resources below cluster together and the
# internal foundation -> gateway -> cluster -> service dependency chain gives the
# module a real blast radius.
#
# Uses only the built-in terraform_data resource — no providers or credentials.

terraform {
  required_version = ">= 1.4"
}

# Foundation + gateway are stable anchors: everything in the region depends on
# them, so selecting one lights up the whole cluster.
resource "terraform_data" "foundation" {
  input = "foundation-${var.name}"
}

resource "terraform_data" "gateway" {
  input            = "gateway-${var.name}"
  triggers_replace = [terraform_data.foundation.output]
}

# Clusters take an in-place input bump (release v1 -> v2) -> UPDATE.
resource "terraform_data" "cluster" {
  count            = 3
  input            = "cluster-${var.name}-${count.index}-${var.release}"
  triggers_replace = [terraform_data.gateway.output]
}

# Stable services: input bump only -> UPDATE. Depend on the gateway.
resource "terraform_data" "service_stable" {
  count            = var.services
  input            = "svc-stable-${var.name}-${count.index}-${var.release}"
  triggers_replace = [terraform_data.gateway.output]
}

# Volatile services: keyed on a changing ring + cluster output -> REPLACE.
resource "terraform_data" "service_volatile" {
  count            = var.volatile
  input            = "svc-vol-${var.name}-${count.index}-${var.release}"
  triggers_replace = [terraform_data.cluster[count.index % 3].output, var.ring]
}

# Observability: net-new in the desired state -> CREATE. Depend on the cluster.
resource "terraform_data" "observability" {
  count            = var.observability
  input            = "obs-${var.name}-${count.index}-${var.release}"
  triggers_replace = [terraform_data.cluster[count.index % 3].output]
}

# Legacy: present in the "before" state, removed in the desired state -> DESTROY.
resource "terraform_data" "legacy" {
  count = var.legacy
  input = "legacy-${var.name}-${count.index}"
}
