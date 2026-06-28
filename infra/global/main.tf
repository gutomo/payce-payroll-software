# Account-global bootstrap (architecture doc §12.1/§12.2): the Terraform remote-state backend, the
# GitHub Actions OIDC provider, and two CI roles — a read-only PLAN role (PRs) and an APPLY role gated
# behind GitHub deployment environments. Run once per account with LOCAL state, then migrate state into
# the bucket it creates (see backend.tf). SKELETON — not applied.

locals {
  common_tags = merge({
    Project   = "payce"
    Scope     = "global"
    ManagedBy = "terraform"
    Component = "bootstrap"
  }, var.tags)

  repo_sub = "repo:${var.github_owner}/${var.github_repo}"

  # PLAN runs on PRs and on main pushes (read-only).
  plan_subjects = [
    "${local.repo_sub}:pull_request",
    "${local.repo_sub}:ref:refs/heads/main",
  ]

  # APPLY runs only from gated GitHub environments (add required reviewers there → maker-checker).
  apply_subjects = [for e in var.apply_environments : "${local.repo_sub}:environment:${e}"]
}

# GitHub Actions federates into this account via OIDC; no static AWS keys anywhere.
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = var.github_oidc_thumbprints
  tags            = local.common_tags
}

module "tf_state_backend" {
  source = "../modules/tf-state-backend"

  bucket_name     = var.state_bucket_name
  lock_table_name = var.lock_table_name
  tags            = local.common_tags
}

# --- PLAN role policy: read state, hold the lock, decrypt state. Read of resources comes from the
#     attached ReadOnlyAccess managed policy. ---
data "aws_iam_policy_document" "plan" {
  statement {
    sid       = "StateBucketRead"
    actions   = ["s3:GetObject", "s3:ListBucket"]
    resources = [module.tf_state_backend.bucket_arn, "${module.tf_state_backend.bucket_arn}/*"]
  }
  statement {
    sid       = "StateLock"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [module.tf_state_backend.lock_table_arn]
  }
  statement {
    sid       = "StateDecrypt"
    actions   = ["kms:Decrypt", "kms:DescribeKey"]
    resources = [module.tf_state_backend.kms_key_arn]
  }
}

# --- APPLY role policy: state read/write + the write actions for the resources the envs manage. Read
#     actions come from ReadOnlyAccess. This is a STARTER policy; tighten resource scopes as ARNs
#     stabilise. Wildcard resources below are unavoidable for create-time actions whose ARNs don't
#     exist yet (web ACLs, user pools, vaults). ---
#tfsec:ignore:aws-iam-no-policy-wildcards
data "aws_iam_policy_document" "apply" {
  statement {
    sid       = "StateBucketReadWrite"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    resources = [module.tf_state_backend.bucket_arn, "${module.tf_state_backend.bucket_arn}/*"]
  }
  statement {
    sid       = "StateLock"
    actions   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:DescribeTable"]
    resources = [module.tf_state_backend.lock_table_arn]
  }
  statement {
    sid       = "StateCrypto"
    actions   = ["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
    resources = [module.tf_state_backend.kms_key_arn]
  }

  statement {
    sid = "WafManage"
    actions = [
      "wafv2:CreateWebACL", "wafv2:UpdateWebACL", "wafv2:DeleteWebACL",
      "wafv2:PutLoggingConfiguration", "wafv2:DeleteLoggingConfiguration",
      "wafv2:AssociateWebACL", "wafv2:DisassociateWebACL",
      "wafv2:TagResource", "wafv2:UntagResource",
    ]
    resources = ["*"]
  }

  statement {
    sid = "CognitoManage"
    actions = [
      "cognito-idp:CreateUserPool", "cognito-idp:UpdateUserPool", "cognito-idp:DeleteUserPool",
      "cognito-idp:CreateUserPoolDomain", "cognito-idp:DeleteUserPoolDomain",
      "cognito-idp:CreateUserPoolClient", "cognito-idp:UpdateUserPoolClient", "cognito-idp:DeleteUserPoolClient",
      "cognito-idp:CreateIdentityProvider", "cognito-idp:UpdateIdentityProvider", "cognito-idp:DeleteIdentityProvider",
      "cognito-idp:SetUserPoolMfaConfig", "cognito-idp:TagResource", "cognito-idp:UntagResource",
    ]
    resources = ["*"]
  }

  statement {
    sid = "BackupManage"
    actions = [
      "backup:CreateBackupVault", "backup:DeleteBackupVault", "backup:PutBackupVaultAccessPolicy",
      "backup:CreateBackupPlan", "backup:UpdateBackupPlan", "backup:DeleteBackupPlan",
      "backup:CreateBackupSelection", "backup:DeleteBackupSelection",
      "backup:TagResource", "backup:UntagResource",
    ]
    resources = ["*"]
  }

  statement {
    sid = "WafLogGroups"
    actions = [
      "logs:CreateLogGroup", "logs:DeleteLogGroup", "logs:PutRetentionPolicy",
      "logs:TagResource", "logs:UntagResource",
    ]
    resources = ["arn:aws:logs:*:*:log-group:aws-waf-logs-*"]
  }

  statement {
    sid = "SsoSecrets"
    actions = [
      "secretsmanager:CreateSecret", "secretsmanager:DeleteSecret", "secretsmanager:UpdateSecret",
      "secretsmanager:PutSecretValue", "secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret",
      "secretsmanager:TagResource", "secretsmanager:UntagResource",
    ]
    resources = ["arn:aws:secretsmanager:*:*:secret:payce-*", "arn:aws:secretsmanager:*:*:secret:payce/*"]
  }

  # Manage only the payce-* service roles (e.g. the AWS Backup service role) — never arbitrary roles.
  statement {
    sid = "ServiceRoles"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:UpdateAssumeRolePolicy",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:TagRole", "iam:UntagRole", "iam:PassRole",
    ]
    resources = ["arn:aws:iam::*:role/payce-*"]
  }
}

module "ci_plan_role" {
  source = "../modules/github-oidc"

  role_name           = "payce-ci-plan"
  oidc_provider_arn   = aws_iam_openid_connect_provider.github.arn
  subject_claims      = local.plan_subjects
  managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
  inline_policy_json  = data.aws_iam_policy_document.plan.json
  tags                = local.common_tags
}

module "ci_apply_role" {
  source = "../modules/github-oidc"

  role_name           = "payce-ci-apply"
  oidc_provider_arn   = aws_iam_openid_connect_provider.github.arn
  subject_claims      = local.apply_subjects
  managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
  inline_policy_json  = data.aws_iam_policy_document.apply.json
  tags                = local.common_tags
}
