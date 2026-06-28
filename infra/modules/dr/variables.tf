variable "name" {
  type        = string
  description = "Name prefix for the backup vaults, plan, and IAM role."
}

variable "protected_resource_arns" {
  type        = list(string)
  description = "Resource ARNs to back up (e.g. the Aurora cluster). Empty selects nothing — by-tag selection still applies."
  default     = []
}

variable "selection_tag" {
  type = object({
    key   = string
    value = string
  })
  description = "Resources carrying this tag are also included in the backup plan."
  default = {
    key   = "backup"
    value = "true"
  }
}

variable "schedule" {
  type        = string
  description = "Cron expression for the backup rule. Default: hourly, to keep RPO well under the 1h target."
  default     = "cron(0 * * * ? *)"
}

variable "delete_after_days" {
  type        = number
  description = "Days to retain recovery points in the primary vault before deletion."
  default     = 35
}

variable "dr_copy_delete_after_days" {
  type        = number
  description = "Days to retain the cross-region DR copy before deletion."
  default     = 35
}

variable "start_window_minutes" {
  type        = number
  description = "Minutes AWS Backup waits for a job to start before marking it failed."
  default     = 60
}

variable "completion_window_minutes" {
  type        = number
  description = "Minutes AWS Backup allows a job to run before cancelling it."
  default     = 180
}

variable "kms_key_arn" {
  type        = string
  description = "Optional KMS key for the primary vault. Null uses the AWS-managed Backup key."
  default     = null
}

variable "dr_kms_key_arn" {
  type        = string
  description = "Optional KMS key for the DR-region vault. Null uses the AWS-managed Backup key in that region."
  default     = null
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources."
  default     = {}
}
