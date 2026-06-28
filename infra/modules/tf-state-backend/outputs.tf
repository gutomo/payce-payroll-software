output "bucket_name" {
  description = "Name of the state S3 bucket (use as backend `bucket`)."
  value       = aws_s3_bucket.state.id
}

output "bucket_arn" {
  description = "ARN of the state S3 bucket."
  value       = aws_s3_bucket.state.arn
}

output "lock_table_name" {
  description = "Name of the DynamoDB lock table (use as backend `dynamodb_table`)."
  value       = aws_dynamodb_table.locks.name
}

output "lock_table_arn" {
  description = "ARN of the DynamoDB lock table."
  value       = aws_dynamodb_table.locks.arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key encrypting the state (use as backend `kms_key_id`)."
  value       = aws_kms_key.state.arn
}
