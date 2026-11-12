variable "gcp_project_id"        { type = string }
variable "gcp_region"            { type = string }
variable "detector_version"      { type = string }
variable "classifier_version"    { type = string }
variable "ml_models_bucket_name" { type = string }
variable "inference_sa_email"       { type = string }
variable "lambda_caller_sa_email"  { type = string }
variable "api_gateway_url" {
  type    = string
  default = ""
}
