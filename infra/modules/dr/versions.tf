terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.40"
      # The DR vault lives in a second region; callers pass a provider aliased to it as aws.dr.
      configuration_aliases = [aws, aws.dr]
    }
  }
}
