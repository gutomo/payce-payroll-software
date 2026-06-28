output "role_arn" {
  description = "ARN of the role GitHub Actions assumes (set as `role-to-assume`)."
  value       = aws_iam_role.this.arn
}

output "role_name" {
  description = "Name of the role."
  value       = aws_iam_role.this.name
}
