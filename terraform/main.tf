# Step 1 - apply once (GCP base + AWS base, no Docker images or Lambda code needed)
#   terraform apply -target=module.foundation
#
# Step 2 - apply after Alan + Jason push Docker images
#   terraform apply -target=module.cloudrun
#
# Step 3 - apply every time a teammate commits handler.py changes
#   terraform apply -target=module.lambda
#
# After step 2: copy frontend_url output into terraform.tfvars, then re-apply foundation
#   to update the Cognito callback URL.

module "foundation" {
  source = "./modules/foundation"

  gcp_project_id        = var.gcp_project_id
  gcp_region            = var.gcp_region
  aws_region            = var.aws_region
  cognito_domain_prefix = var.cognito_domain_prefix
  frontend_url          = var.frontend_url
}

module "cloudrun" {
  source = "./modules/cloudrun"

  gcp_project_id        = var.gcp_project_id
  gcp_region            = var.gcp_region
  detector_version      = var.detector_version
  classifier_version    = var.classifier_version
  ml_models_bucket_name = module.foundation.ml_models_bucket_name
  inference_sa_email    = module.foundation.inference_sa_email
  lambda_caller_sa_email = module.foundation.lambda_caller_sa_email
  api_gateway_url       = var.api_gateway_url
}

module "lambda" {
  source = "./modules/lambda"

  lambda_role_arns          = module.foundation.lambda_role_arns
  bucket_name               = module.foundation.bucket_name
  table_name                = module.foundation.table_name
  sns_topic_arn             = module.foundation.sns_topic_arn
  inference_url             = module.cloudrun.inference_url
  api_gateway_id            = module.foundation.api_gateway_id
  api_gateway_execution_arn = module.foundation.api_gateway_execution_arn
  cognito_authorizer_id     = module.foundation.cognito_authorizer_id
  s3_bucket_id              = module.foundation.s3_bucket_id
  s3_bucket_arn             = module.foundation.s3_bucket_arn
  gcp_sa_secret_arn         = module.foundation.gcp_sa_secret_arn
}
