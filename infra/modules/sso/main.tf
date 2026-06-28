# Cognito user pool as the enterprise SSO/SCIM broker (architecture doc §7). Tenants federate via
# SAML 2.0 or OIDC into a single pool; the app talks OIDC to Cognito and never to each IdP directly.
# MFA is ON by default. No client secrets live in HCL/tfvars — OIDC secrets are read at plan/apply
# time from Secrets Manager (golden rule 3). Phase 7 wires this to the ALB/web app; this is the module.

resource "aws_cognito_user_pool" "this" {
  name = var.name

  # Enterprise users arrive pre-verified from their IdP; email is the username attribute.
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  mfa_configuration = var.mfa_configuration

  # Software-token (TOTP) MFA; SMS is intentionally not enabled (cost/phishing surface).
  dynamic "software_token_mfa_configuration" {
    for_each = var.mfa_configuration == "OFF" ? [] : [1]
    content {
      enabled = true
    }
  }

  # Defense-in-depth even though enterprise IdPs own the real password policy.
  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 1
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Surface compromised-credential / unusual-sign-in protection.
  user_pool_add_ons {
    advanced_security_mode = "ENFORCED"
  }

  tags = var.tags
}

# Hosted-UI domain that brokers the federated sign-in redirect.
resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

# SAML providers: metadata URL only, no secret. Keyed by stable provider name (e.g. tenant slug).
resource "aws_cognito_identity_provider" "saml" {
  for_each = var.saml_providers

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = each.key
  provider_type = "SAML"

  provider_details = {
    MetadataURL = each.value.metadata_url
    IDPSignout  = "true"
  }

  attribute_mapping = each.value.attribute_mapping
}

# OIDC client secrets are stored in Secrets Manager, referenced by id/ARN — never in tfvars or state
# inputs. Read the current version at plan/apply time so the secret value only transits Terraform.
data "aws_secretsmanager_secret_version" "oidc_client_secret" {
  for_each  = var.oidc_providers
  secret_id = each.value.client_secret_secret_id
}

resource "aws_cognito_identity_provider" "oidc" {
  for_each = var.oidc_providers

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = each.key
  provider_type = "OIDC"

  provider_details = {
    client_id                 = each.value.client_id
    client_secret             = data.aws_secretsmanager_secret_version.oidc_client_secret[each.key].secret_string
    oidc_issuer               = each.value.issuer
    authorize_scopes          = each.value.authorize_scopes
    attributes_request_method = "GET"
  }

  attribute_mapping = each.value.attribute_mapping
}

# App client used by the web app. No generated secret: the Next.js app uses PKCE (public client) and
# the authorization-code flow, so there is no client secret to leak.
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = false

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Only the federated IdPs (plus COGNITO as a break-glass) may sign in.
  supported_identity_providers = concat(
    ["COGNITO"],
    [for k, v in aws_cognito_identity_provider.saml : k],
    [for k, v in aws_cognito_identity_provider.oidc : k],
  )

  # Short-lived access/ID tokens, longer refresh; rotate refresh tokens on use.
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true
}

# SCIM provisioning bearer token. We create+manage the secret container here so IdPs can push
# joiner/mover/leaver events; the token VALUE is set out-of-band (rotation), never committed.
resource "aws_secretsmanager_secret" "scim_token" {
  name        = "${var.name}/scim-bearer-token"
  description = "Bearer token enterprise IdPs use for SCIM user provisioning into ${var.name}."
  tags        = var.tags
}
