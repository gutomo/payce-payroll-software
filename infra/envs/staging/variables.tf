variable "region" {
  type        = string
  description = "Primary AWS region for the staging stack."
  default     = "ap-southeast-1"
}

variable "dr_region" {
  type        = string
  description = "Secondary region that receives cross-region backup copies."
  default     = "ap-southeast-2"
}

variable "waf_rate_limit" {
  type        = number
  description = "Per-IP request budget per 5-minute window before WAF throttles."
  default     = 2000
}

variable "log_retention_days" {
  type        = number
  description = "Retention for WAF CloudWatch log groups."
  default     = 90
}

variable "alb_arn" {
  type        = string
  description = "ARN of the ALB to associate the regional WAF with. Null until the ALB exists."
  default     = null
}

variable "cognito_domain_prefix" {
  type        = string
  description = "Globally-unique Cognito hosted-UI domain prefix."
  default     = "payce-staging"
}

variable "cognito_callback_urls" {
  type        = list(string)
  description = "Allowed OAuth callback URLs for the staging web app."
  default     = ["https://staging.example.com/api/auth/callback/cognito"]
}

variable "cognito_logout_urls" {
  type        = list(string)
  description = "Allowed sign-out redirect URLs for the staging web app."
  default     = ["https://staging.example.com"]
}

# SAML providers carry only an IdP metadata URL (no secret) — safe in tfvars.
variable "saml_providers" {
  type = map(object({
    metadata_url      = string
    attribute_mapping = optional(map(string), { email = "email" })
  }))
  description = "Enterprise SAML providers to federate into the staging pool."
  default     = {}
}

# OIDC providers reference a Secrets Manager secret id for the client secret — never the secret itself.
variable "oidc_providers" {
  type = map(object({
    issuer                  = string
    client_id               = string
    client_secret_secret_id = string
    authorize_scopes        = optional(string, "openid email profile")
    attribute_mapping       = optional(map(string), { email = "email" })
  }))
  description = "Enterprise OIDC providers to federate into the staging pool."
  default     = {}
}

variable "dr_protected_resource_arns" {
  type        = list(string)
  description = "Resource ARNs (e.g. the Aurora cluster) to back up. Empty until those resources exist."
  default     = []
}
