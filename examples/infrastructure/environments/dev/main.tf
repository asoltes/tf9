terraform {
  required_version = ">= 1.0"
}

locals {
  environment = "dev"
}

output "environment" {
  value = local.environment
}
