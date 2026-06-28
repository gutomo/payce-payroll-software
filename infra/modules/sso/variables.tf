variable "name" {
  type        = string
  description = "Name for the Cognito user pool and related resources."
}

variable "domain_prefix" {
  type        = string
  description = "Globally-unique prefix for the Cognito hosted-UI domain (<prefix>.auth.<region>.amazoncognito.com)."
}

variable "callback_urls" {
  type        = list(string)
  description = "Allowed OAuth callback URLs for the app client."
}

variable "logout_urls" {
  type        = list(string)
  description = "Allowed sign-out redirect URLs for the app client."
}

variable "mfa_configuration" {
  type        = string
  description = "Cognito MFA mode: OFF, ON, or OPTIONAL."
  default     = "ON"
  validation {
    condition     = contains(["OFF", "ON", "OPTIONAL"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, ON, or OPTIONAL."
  }
}

# Enterprise SAML providers, keyed by a stable provider name (often the tenant slug). SAML needs no
# client secret — only IdP metadata — so these are safe to keep in tfvars.
variable "saml_providers" {
  type = map(object({
    metadata_url      = string
    attribute_mapping = optional(map(string), { email = "email" })
  }))
  description = "SAML 2.0 identity providers to federate into the pool."
  default     = {}
}

# Enterprise OIDC providers. The client secret is NEVER stored here (golden rule 3): it is read at
# plan/apply time from the referenced Secrets Manager secret.
variable "oidc_providers" {
  type = map(object({
    issuer                  = string
    client_id               = string
    client_secret_secret_id = string # Secrets Manager secret id/ARN holding the OIDC client secret
    authorize_scopes        = optional(string, "openid email profile")
    attribute_mapping       = optional(map(string), { email = "email" })
  }))
  description = "OIDC identity providers to federate into the pool."
  default     = {}
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources."
  default     = {}
}
