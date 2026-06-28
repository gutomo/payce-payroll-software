# The bootstrap creates the very bucket/table the other envs use for remote state, so it cannot store
# its own state there on the first apply (chicken-and-egg). It therefore starts with LOCAL state.
# After the first apply, migrate this state into the new bucket by uncommenting the block below and
# running `terraform init -migrate-state`.
#
# terraform {
#   backend "s3" {
#     bucket         = "payce-tfstate-<account>"
#     key            = "global/bootstrap.tfstate"
#     region         = "ap-southeast-1"
#     dynamodb_table = "payce-tfstate-locks"
#     encrypt        = true
#   }
# }
