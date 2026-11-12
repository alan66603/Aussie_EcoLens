# GCP

variable "gcp_project_id" {
  description = "GCP project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for all resources"
  type        = string
  default     = "us-central1"
}

variable "gcp_zone" {
  description = "GCP zone"
  type        = string
  default     = "us-central1-a"
}

variable "detector_version" {
  description = "Detector model version (e.g. v1 -> models/detector/mdv5a-v1.pt)"
  type        = string
  default     = "v1"
}

variable "classifier_version" {
  description = "Classifier model version (e.g. v3 -> models/classifier/speciesnet-v3.pt)"
  type        = string
  default     = "v3"
}

# AWS

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "api_gateway_url" {
  description = "AWS API Gateway invoke URL (used by the frontend)"
  type        = string
  default     = ""
}

variable "cognito_domain_prefix" {
  description = "Cognito Hosted UI domain prefix - must be globally unique (e.g. ecolens-yourname)"
  type        = string
}

variable "frontend_url" {
  description = "GCP Cloud Run frontend URL - fill in after cloudrun apply, then re-apply foundation to update Cognito callback URL"
  type        = string
  default     = ""
}