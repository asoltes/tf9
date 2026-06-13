variable "name" {
  description = "Region label, used to namespace resource inputs."
  type        = string
}

variable "release" {
  description = "Bumped to force in-place updates on clusters and stable services."
  type        = string
}

variable "ring" {
  description = "Bumped to force replacement of volatile services."
  type        = string
}

variable "services" {
  description = "Number of stable services (in-place updates; grow for creates)."
  type        = number
}

variable "volatile" {
  description = "Number of volatile services (forced replacements)."
  type        = number
}

variable "observability" {
  description = "Number of observability resources (net-new creates)."
  type        = number
}

variable "legacy" {
  description = "Number of legacy resources (destroyed when set to 0)."
  type        = number
}
