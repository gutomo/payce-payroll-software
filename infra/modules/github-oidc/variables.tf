variable "role_name" {
  type        = string
  description = "Name of the IAM role GitHub Actions assumes."
}

variable "oidc_provider_arn" {
  type        = string
  description = "ARN of the GitHub Actions OIDC provider in this account."
}

# Allowed `sub` claims, e.g. repo:gutomo/payce-payroll-software:ref:refs/heads/main or
# repo:gutomo/payce-payroll-software:environment:staging. Wildcards (StringLike) are supported but should
# be as narrow as possible — never repo:org/*:* (that would let any repo branch assume the role).
variable "subject_claims" {
  type        = list(string)
  description = "GitHub OIDC `sub` claim patterns permitted to assume the role."
  validation {
    condition     = length(var.subject_claims) > 0
    error_message = "At least one subject claim is required; an empty list would allow no one (or, if loosened, everyone)."
  }
}

variable "audience" {
  type        = string
  description = "Expected OIDC audience (`aud`) claim."
  default     = "sts.amazonaws.com"
}

variable "managed_policy_arns" {
  type        = list(string)
  description = "Managed policy ARNs to attach to the role."
  default     = []
}

variable "inline_policy_json" {
  type        = string
  description = "Optional inline policy (JSON) attached to the role. Null attaches none."
  default     = null
}

variable "max_session_duration" {
  type        = number
  description = "Maximum assumed-session duration in seconds."
  default     = 3600
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to the role."
  default     = {}
}
