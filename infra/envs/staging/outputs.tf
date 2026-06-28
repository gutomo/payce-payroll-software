output "edge_web_acl_arn" {
  description = "CLOUDFRONT-scope WAF web ACL ARN (set as the distribution's web_acl_id)."
  value       = module.waf_edge.web_acl_arn
}

output "alb_web_acl_arn" {
  description = "REGIONAL WAF web ACL ARN for the ALB."
  value       = module.waf_alb.web_acl_arn
}

output "cognito_user_pool_id" {
  description = "Cognito user pool id for staging SSO."
  value       = module.sso.user_pool_id
}

output "cognito_web_client_id" {
  description = "Cognito app client id for the staging web app."
  value       = module.sso.web_client_id
}

output "scim_token_secret_arn" {
  description = "Secrets Manager ARN holding the SCIM provisioning bearer token."
  value       = module.sso.scim_token_secret_arn
}

output "dr_vault_arn" {
  description = "DR-region backup vault ARN."
  value       = module.dr.dr_vault_arn
}
