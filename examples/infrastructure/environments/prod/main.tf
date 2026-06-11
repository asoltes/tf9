terraform {
  required_version = ">= 1.0"
}

locals {
  environment = "prod"
}

output "environment" {
  value = local.environment
}
