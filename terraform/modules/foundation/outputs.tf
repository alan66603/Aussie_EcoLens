output "ml_models_bucket_name"     { value = google_storage_bucket.ml_models.name }
output "inference_sa_email"        { value = google_service_account.inference.email }
output "lambda_role_arns" {
  value = {
    read_query  = aws_iam_role.lambda_read_query.arn
    upload      = aws_iam_role.lambda_upload.arn
    thumbnail   = aws_iam_role.lambda_thumbnail.arn
    query_file  = aws_iam_role.lambda_query_file.arn
    tags_modify = aws_iam_role.lambda_tags_modify.arn
    notify      = aws_iam_role.lambda_notify.arn
    delete      = aws_iam_role.lambda_delete.arn
  }
}
output "bucket_name"               { value = local.bucket_name }
output "table_name"                { value = local.table_name }
output "sns_topic_arn"             { value = aws_sns_topic.notifications.arn }
output "s3_bucket_id"              { value = aws_s3_bucket.media.id }
output "s3_bucket_arn"             { value = aws_s3_bucket.media.arn }
output "api_gateway_id"            { value = aws_apigatewayv2_api.main.id }
output "api_gateway_execution_arn" { value = aws_apigatewayv2_api.main.execution_arn }
output "api_gateway_url"           { value = aws_apigatewayv2_stage.default.invoke_url }
output "cognito_authorizer_id"     { value = aws_apigatewayv2_authorizer.cognito.id }
output "cognito_user_pool_id"      { value = aws_cognito_user_pool.main.id }
output "cognito_client_id"         { value = aws_cognito_user_pool_client.frontend.id }
output "cognito_hosted_ui_url"     { value = "https://${var.cognito_domain_prefix}.auth.${var.aws_region}.amazoncognito.com" }
output "lambda_caller_sa_email"   { value = google_service_account.lambda_caller.email }
output "gcp_sa_secret_arn"        { value = aws_secretsmanager_secret.gcp_sa_key.arn }
