variable "lambda_role_arns" {
  type = map(string)
}
variable "bucket_name"               { type = string }
variable "table_name"                { type = string }
variable "sns_topic_arn"             { type = string }
variable "inference_url" {
  type    = string
  default = ""
}
variable "api_gateway_id"            { type = string }
variable "api_gateway_execution_arn" { type = string }
variable "cognito_authorizer_id"     { type = string }
variable "s3_bucket_id"              { type = string }
variable "s3_bucket_arn"             { type = string }
variable "gcp_sa_secret_arn"        { type = string }
variable "lambda_runtime" {
  type    = string
  default = "python3.13"
}
