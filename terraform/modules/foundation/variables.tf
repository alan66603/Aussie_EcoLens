variable "gcp_project_id"        { type = string }
variable "gcp_region"            { type = string }
variable "aws_region"            { type = string }
variable "cognito_domain_prefix" { type = string }

variable "frontend_url" {
  type        = string
  default     = ""
  description = "GCP Cloud Run frontend URL - fill in terraform.tfvars after cloudrun apply, then re-apply foundation to update Cognito callback URL"
}
