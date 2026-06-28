output "user_pool_id" {
  description = "Cognito user pool id."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito user pool ARN (use for ALB/authorizer integration)."
  value       = aws_cognito_user_pool.this.arn
}

output "user_pool_endpoint" {
  description = "Cognito user pool endpoint (OIDC issuer host)."
  value       = aws_cognito_user_pool.this.endpoint
}

output "web_client_id" {
  description = "App client id for the web app (public, PKCE)."
  value       = aws_cognito_user_pool_client.web.id
}

output "hosted_ui_domain" {
  description = "Hosted-UI domain prefix that brokers federated sign-in."
  value       = aws_cognito_user_pool_domain.this.domain
}

output "scim_token_secret_arn" {
  description = "Secrets Manager ARN whose value (set out-of-band) is the SCIM provisioning bearer token."
  value       = aws_secretsmanager_secret.scim_token.arn
}
