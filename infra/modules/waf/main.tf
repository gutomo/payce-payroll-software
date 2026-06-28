# AWS WAFv2 web ACL (architecture doc §6, §7). Fronts CloudFront (edge) and/or the ALB with AWS
# Managed Rules + a per-IP rate-based rule, fail-open default (ALLOW) with explicit block rules, and
# logging to CloudWatch. Phase 7 hardens/tunes these rules; this is the reusable module.

# WAF logging requires a log group whose name starts with "aws-waf-logs-".
resource "aws_cloudwatch_log_group" "waf" {
  name              = "aws-waf-logs-${var.name}"
  retention_in_days = var.log_retention_days
  tags              = var.tags
}

resource "aws_wafv2_web_acl" "this" {
  name        = var.name
  description = "Managed-rules + rate limiting for ${var.name} (${var.scope})."
  scope       = var.scope

  default_action {
    allow {}
  }

  # Per-IP rate limiting: a tenant or attacker exceeding the budget is throttled (golden path stays up).
  rule {
    name     = "rate-limit-per-ip"
    priority = 1

    action {
      block {}
    }

    statement {
      rate_based_statement {
        limit              = var.rate_limit
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.name}-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rule Groups (OWASP common set, bad inputs, SQLi, IP reputation, anonymous IPs).
  dynamic "rule" {
    for_each = { for group in var.managed_rule_groups : group.name => group }

    content {
      name     = rule.value.name
      priority = rule.value.priority

      # COUNT lets a new rule group be observed before it can block legitimate traffic.
      dynamic "override_action" {
        for_each = rule.value.count_only ? [1] : []
        content {
          count {}
        }
      }
      dynamic "override_action" {
        for_each = rule.value.count_only ? [] : [1]
        content {
          none {}
        }
      }

      statement {
        managed_rule_group_statement {
          name        = rule.value.name
          vendor_name = "AWS"

          dynamic "rule_action_override" {
            for_each = toset(rule.value.excluded_rules)
            content {
              name = rule_action_override.value
              action_to_use {
                count {}
              }
            }
          }
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "${var.name}-${rule.value.name}"
        sampled_requests_enabled   = true
      }
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-web-acl"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  log_destination_configs = [aws_cloudwatch_log_group.waf.arn]
  resource_arn            = aws_wafv2_web_acl.this.arn

  # Don't log Authorization headers / cookies to the WAF logs (no secrets/PII in telemetry).
  redacted_fields {
    single_header {
      name = "authorization"
    }
  }
  redacted_fields {
    single_header {
      name = "cookie"
    }
  }
}

# REGIONAL only: associate with an ALB/API Gateway. CLOUDFRONT scope attaches via the distribution.
resource "aws_wafv2_web_acl_association" "this" {
  count        = var.scope == "REGIONAL" && var.associate_resource_arn != null ? 1 : 0
  resource_arn = var.associate_resource_arn
  web_acl_arn  = aws_wafv2_web_acl.this.arn
}
