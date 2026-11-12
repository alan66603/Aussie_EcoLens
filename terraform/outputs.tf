output "inference_url" {
  description = "GCP Cloud Run inference service URL (INFERENCE_URL)"
  value       = module.cloudrun.inference_url
}

output "frontend_url" {
  description = "GCP Cloud Run frontend URL"
  value       = module.cloudrun.frontend_url
}

output "api_gateway_url" {
  description = "API Gateway invoke URL - copy to terraform.tfvars after foundation apply"
  value       = module.foundation.api_gateway_url
}

output "sns_topic_arn" {
  description = "AWS SNS topic ARN (SNS_TOPIC_ARN)"
  value       = module.foundation.sns_topic_arn
}

output "bucket_name" {
  description = "S3 bucket name (BUCKET_NAME)"
  value       = module.foundation.bucket_name
}

output "table_name" {
  description = "DynamoDB table name (TABLE_NAME)"
  value       = module.foundation.table_name
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = module.foundation.cognito_user_pool_id
}

output "cognito_client_id" {
  description = "Cognito App Client ID (used by the frontend)"
  value       = module.foundation.cognito_client_id
}

output "cognito_hosted_ui_url" {
  description = "Cognito Hosted UI login URL"
  value       = module.foundation.cognito_hosted_ui_url
}
