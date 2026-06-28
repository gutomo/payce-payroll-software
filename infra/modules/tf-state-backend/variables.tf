variable "bucket_name" {
  type        = string
  description = "Globally-unique S3 bucket name for Terraform remote state."
}

variable "lock_table_name" {
  type        = string
  description = "DynamoDB table name for state locking."
  default     = "payce-tfstate-locks"
}

variable "kms_deletion_window_days" {
  type        = number
  description = "Waiting period before the state KMS key is deleted."
  default     = 30
}

variable "noncurrent_version_retention_days" {
  type        = number
  description = "Days to keep noncurrent state object versions before expiring them."
  default     = 90
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources."
  default     = {}
}
