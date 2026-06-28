output "primary_vault_arn" {
  description = "ARN of the primary-region backup vault."
  value       = aws_backup_vault.primary.arn
}

output "dr_vault_arn" {
  description = "ARN of the DR-region backup vault that receives cross-region copies."
  value       = aws_backup_vault.dr.arn
}

output "backup_plan_id" {
  description = "Id of the backup plan."
  value       = aws_backup_plan.this.id
}

output "backup_role_arn" {
  description = "ARN of the IAM role AWS Backup assumes for backup/restore."
  value       = aws_iam_role.backup.arn
}
