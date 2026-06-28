output "state_bucket_name" {
  description = "S3 bucket for remote state — set as the backend `bucket` in each env."
  value       = module.tf_state_backend.bucket_name
}

output "lock_table_name" {
  description = "DynamoDB lock table — set as the backend `dynamodb_table` in each env."
  value       = module.tf_state_backend.lock_table_name
}

output "state_kms_key_arn" {
  description = "KMS key encrypting remote state — set as the backend `kms_key_id`."
  value       = module.tf_state_backend.kms_key_arn
}

output "oidc_provider_arn" {
  description = "GitHub Actions OIDC provider ARN."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "ci_plan_role_arn" {
  description = "Role ARN for the CI plan job (`role-to-assume`)."
  value       = module.ci_plan_role.role_arn
}

output "ci_apply_role_arn" {
  description = "Role ARN for the CI apply job (`role-to-assume`)."
  value       = module.ci_apply_role.role_arn
}
