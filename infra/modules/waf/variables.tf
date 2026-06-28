variable "name" {
  type        = string
  description = "Name prefix for the web ACL and its log group."
}

variable "scope" {
  type        = string
  description = "WAF scope: CLOUDFRONT (edge; must be created in us-east-1) or REGIONAL (ALB/API Gateway)."
  default     = "REGIONAL"
  validation {
    condition     = contains(["CLOUDFRONT", "REGIONAL"], var.scope)
    error_message = "scope must be CLOUDFRONT or REGIONAL."
  }
}

variable "rate_limit" {
  type        = number
  description = "Requests per 5-minute window per client IP before the rate-based rule blocks."
  default     = 2000
}

variable "managed_rule_groups" {
  type = list(object({
    name           = string
    priority       = number
    count_only     = optional(bool, false) # true = COUNT (observe) instead of block, for safe rollout
    excluded_rules = optional(list(string), [])
  }))
  description = "AWS managed rule groups to attach, in priority order."
  default = [
    { name = "AWSManagedRulesCommonRuleSet", priority = 10 },
    { name = "AWSManagedRulesKnownBadInputsRuleSet", priority = 20 },
    { name = "AWSManagedRulesSQLiRuleSet", priority = 30 },
    { name = "AWSManagedRulesAmazonIpReputationList", priority = 40 },
    { name = "AWSManagedRulesAnonymousIpList", priority = 50 },
  ]
}

variable "associate_resource_arn" {
  type        = string
  description = "Optional REGIONAL resource ARN (e.g. an ALB) to associate the web ACL with. Ignored for CLOUDFRONT (attach via the distribution's web_acl_id output instead)."
  default     = null
}

variable "log_retention_days" {
  type        = number
  description = "Retention for the WAF CloudWatch log group."
  default     = 90
}

variable "tags" {
  type        = map(string)
  description = "Tags applied to all resources."
  default     = {}
}
