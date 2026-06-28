# IAM and the OIDC provider are global; the state bucket/lock table live in the home region.
provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}
