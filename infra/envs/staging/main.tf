# Staging composition for the Phase 7 security/DR stack: WAF (edge + regional), Cognito SSO, and
# AWS Backup cross-region DR. This is the reference env; dev and prod mirror it with different tfvars.
# SKELETON ONLY — not applied. `terraform init -backend=false` + `validate`/`fmt` gate it in CI.

locals {
  common_tags = {
    Project     = "payce"
    Environment = "staging"
    ManagedBy   = "terraform"
    Component   = "sso-waf-dr"
  }
}

# Edge WAF on the CloudFront distribution — must be created in us-east-1.
module "waf_edge" {
  source = "../../modules/waf"
  providers = {
    aws = aws.us_east_1
  }

  name               = "payce-staging-edge"
  scope              = "CLOUDFRONT"
  rate_limit         = var.waf_rate_limit
  log_retention_days = var.log_retention_days
  tags               = local.common_tags
}

# Regional WAF on the ALB. associate_resource_arn stays null until the ALB exists in a later phase.
module "waf_alb" {
  source = "../../modules/waf"

  name                   = "payce-staging-alb"
  scope                  = "REGIONAL"
  rate_limit             = var.waf_rate_limit
  associate_resource_arn = var.alb_arn
  log_retention_days     = var.log_retention_days
  tags                   = local.common_tags
}

module "sso" {
  source = "../../modules/sso"

  name              = "payce-staging"
  domain_prefix     = var.cognito_domain_prefix
  callback_urls     = var.cognito_callback_urls
  logout_urls       = var.cognito_logout_urls
  mfa_configuration = "ON"
  saml_providers    = var.saml_providers
  oidc_providers    = var.oidc_providers
  tags              = local.common_tags
}

module "dr" {
  source = "../../modules/dr"
  providers = {
    aws    = aws
    aws.dr = aws.dr
  }

  name                    = "payce-staging"
  protected_resource_arns = var.dr_protected_resource_arns
  tags                    = local.common_tags
}
