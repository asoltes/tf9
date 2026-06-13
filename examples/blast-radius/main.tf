# Blast-radius demo — uses only the built-in terraform_data resource, so it
# needs no providers, no cloud credentials, and no network access.
#
# The repository is split into four "region" modules. Each becomes a separate
# cluster in the tf9 Graph View, with an internal foundation -> gateway ->
# cluster -> service dependency chain. Select a region's foundation/gateway and
# its whole cluster lights up as the blast radius.
#
# The variable DEFAULTS below are the "after" desired state. The committed
# terraform.tfstate was produced by applying the "before" values (see
# regenerate.sh), so a plain `terraform plan` surfaces a mix of
# add / update / replace / destroy across every cluster.

terraform {
  required_version = ">= 1.4"
}

variable "release"       { default = "v2" }   # bumped v1 -> v2 (in-place updates)
variable "ring"          { default = "r2" }   # bumped r1 -> r2 (forced replacements)
variable "services"      { default = 35 }     # grew 28 -> 35 (new adds)
variable "volatile"      { default = 25 }
variable "observability" { default = 6 }      # grew 0 -> 6 (new adds)
variable "legacy"        { default = 0 }       # shrank 8 -> 0 (destroys)

module "region_alpha" {
  source        = "./modules/region"
  name          = "alpha"
  release       = var.release
  ring          = var.ring
  services      = var.services
  volatile      = var.volatile
  observability = var.observability
  legacy        = var.legacy
}

module "region_bravo" {
  source        = "./modules/region"
  name          = "bravo"
  release       = var.release
  ring          = var.ring
  services      = var.services
  volatile      = var.volatile
  observability = var.observability
  legacy        = var.legacy
}

module "region_charlie" {
  source        = "./modules/region"
  name          = "charlie"
  release       = var.release
  ring          = var.ring
  services      = var.services
  volatile      = var.volatile
  observability = var.observability
  legacy        = var.legacy
}

module "region_delta" {
  source        = "./modules/region"
  name          = "delta"
  release       = var.release
  ring          = var.ring
  services      = var.services
  volatile      = var.volatile
  observability = var.observability
  legacy        = var.legacy
}
