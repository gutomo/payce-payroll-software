# Remote state in S3 with a DynamoDB lock table (architecture doc §12.2). The bucket/table are
# created once by the global bootstrap (infra/global) and are NOT managed by this env. Values are
# left as placeholders here; `terraform init` is run with `-backend-config` (or a partial backend
# file) in CI so no account-specific names land in the repo.
terraform {
  backend "s3" {
    # bucket         = "payce-tfstate-<account>"   # set via -backend-config in CI
    key = "staging/sso-waf-dr.tfstate"
    # region         = "ap-southeast-1"            # set via -backend-config in CI
    # dynamodb_table = "payce-tfstate-locks"       # set via -backend-config in CI
    encrypt = true
  }
}
