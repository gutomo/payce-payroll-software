# An IAM role GitHub Actions assumes via OIDC (architecture doc §7, §12.2) — no long-lived AWS keys in
# the repo or in GitHub secrets. The trust policy pins the audience and the `sub` claim to specific
# repo refs/environments so only the intended workflows can assume the role.

locals {
  # Condition-key prefix is the OIDC provider host (GitHub's well-known issuer).
  oidc_host = "token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [var.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = [var.audience]
    }

    condition {
      test     = "StringLike"
      variable = "${local.oidc_host}:sub"
      values   = var.subject_claims
    }
  }
}

resource "aws_iam_role" "this" {
  name                 = var.role_name
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = var.max_session_duration
  tags                 = var.tags
}

resource "aws_iam_role_policy_attachment" "managed" {
  for_each   = toset(var.managed_policy_arns)
  role       = aws_iam_role.this.name
  policy_arn = each.value
}

resource "aws_iam_role_policy" "inline" {
  count  = var.inline_policy_json == null ? 0 : 1
  name   = "${var.role_name}-inline"
  role   = aws_iam_role.this.id
  policy = var.inline_policy_json
}
