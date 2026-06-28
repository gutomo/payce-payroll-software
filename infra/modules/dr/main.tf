# Disaster recovery via AWS Backup (architecture doc §10). A primary-region vault takes scheduled
# backups and copies each recovery point to a vault in a second region, giving cross-region durability
# for the warm-standby / pilot-light target (RPO <= 5 min via Aurora PITR, RTO <= 1 hr). Aurora's own
# continuous PITR is the fine-grained RPO mechanism; this plan adds point-in-time recovery points and,
# crucially, the cross-region copy so a full-region loss is recoverable.

# DR-region vault. Created through the aws.dr provider alias the caller supplies.
resource "aws_backup_vault" "dr" {
  provider    = aws.dr
  name        = "${var.name}-dr"
  kms_key_arn = var.dr_kms_key_arn
  tags        = var.tags
}

# Primary-region vault.
resource "aws_backup_vault" "primary" {
  name        = var.name
  kms_key_arn = var.kms_key_arn
  tags        = var.tags
}

# AWS Backup needs a service role it can assume to read sources and write recovery points.
data "aws_iam_policy_document" "backup_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["backup.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "backup" {
  name               = "${var.name}-backup"
  assume_role_policy = data.aws_iam_policy_document.backup_assume.json
  tags               = var.tags
}

resource "aws_iam_role_policy_attachment" "backup" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
}

resource "aws_iam_role_policy_attachment" "restore" {
  role       = aws_iam_role.backup.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForRestores"
}

resource "aws_backup_plan" "this" {
  name = var.name

  rule {
    rule_name         = "scheduled-with-dr-copy"
    target_vault_name = aws_backup_vault.primary.name
    schedule          = var.schedule
    start_window      = var.start_window_minutes
    completion_window = var.completion_window_minutes

    lifecycle {
      delete_after = var.delete_after_days
    }

    # Copy every recovery point to the other region for region-loss survivability.
    copy_action {
      destination_vault_arn = aws_backup_vault.dr.arn
      lifecycle {
        delete_after = var.dr_copy_delete_after_days
      }
    }
  }

  tags = var.tags
}

resource "aws_backup_selection" "this" {
  name         = "${var.name}-selection"
  iam_role_arn = aws_iam_role.backup.arn
  plan_id      = aws_backup_plan.this.id

  resources = var.protected_resource_arns

  # Anything tagged for backup is swept in even if not explicitly listed.
  selection_tag {
    type  = "STRINGEQUALS"
    key   = var.selection_tag.key
    value = var.selection_tag.value
  }
}
