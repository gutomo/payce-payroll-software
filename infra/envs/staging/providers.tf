# Two AWS providers: the primary region, plus an alias for the DR region the dr module copies into.
# default_tags stamp every resource for cost allocation and ownership (architecture doc §12.2).
# Credentials come from the CI OIDC role at apply time — never static keys in this repo.

provider "aws" {
  region = var.region

  default_tags {
    tags = local.common_tags
  }
}

provider "aws" {
  alias  = "dr"
  region = var.dr_region

  default_tags {
    tags = local.common_tags
  }
}

# us-east-1 is required for CLOUDFRONT-scoped WAF web ACLs.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.common_tags
  }
}
