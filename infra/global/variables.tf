variable "region" {
  type        = string
  description = "Home region for the state bucket and lock table."
  default     = "ap-southeast-1"
}

variable "github_owner" {
  type        = string
  description = "GitHub org/user that owns the repo (the OIDC `sub` is scoped to it)."
  default     = "gutomo"
}

variable "github_repo" {
  type        = string
  description = "Repository name the CI roles are scoped to."
  default     = "payce-payroll-software"
}

variable "state_bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for Terraform remote state."
  # No default: a real, unique name (e.g. payce-tfstate-<account-id>) must be supplied per account.
}

variable "lock_table_name" {
  type        = string
  description = "DynamoDB table name for state locking."
  default     = "payce-tfstate-locks"
}

# Environments (GitHub deployment environments) whose workflows may assume the apply role. Gate these
# environments with required reviewers in GitHub so apply still needs human approval (maker-checker).
variable "apply_environments" {
  type        = list(string)
  description = "GitHub environment names permitted to assume the apply role."
  default     = ["staging", "production"]
}

# Well-known GitHub Actions OIDC thumbprints. AWS now validates the issuer via its trust store and
# largely ignores these, but the provider resource still accepts them.
variable "github_oidc_thumbprints" {
  type        = list(string)
  description = "TLS thumbprints for the GitHub Actions OIDC issuer."
  default = [
    "6938fd4d98bab03faadb97b34396831e3780aea1",
    "1c58a3a8518e8759bf075b76b750d4f2df264fce",
  ]
}

variable "tags" {
  type        = map(string)
  description = "Extra tags merged into the default tags."
  default     = {}
}
