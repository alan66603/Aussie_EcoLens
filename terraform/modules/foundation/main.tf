locals {
  bucket_name = "ecolens-media-cloud-best-team"
  table_name  = "ecolens-files"
}

# --- GCP APIs ---

resource "google_project_service" "run" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "storage" {
  service            = "storage.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifact_registry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "iam" {
  service            = "iam.googleapis.com"
  disable_on_destroy = false
}

# --- GCS model bucket ---

resource "google_storage_bucket" "ml_models" {
  name          = "${var.gcp_project_id}-ecolens-models"
  location      = var.gcp_region
  force_destroy = true

  versioning {
    enabled = true
  }

  uniform_bucket_level_access = true

  depends_on = [google_project_service.storage]
}

# --- Service Account for inference Cloud Run ---

resource "google_service_account" "inference" {
  account_id   = "ecolens-inference-sa"
  display_name = "EcoLens Inference Service Account"

  depends_on = [google_project_service.iam]
}

resource "google_storage_bucket_iam_member" "inference_model_reader" {
  bucket = google_storage_bucket.ml_models.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.inference.email}"
}

# --- Artifact Registry ---

resource "google_artifact_registry_repository" "ecolens" {
  location      = var.gcp_region
  repository_id = "ecolens"
  format        = "DOCKER"

  cleanup_policies {
    id     = "keep-5-most-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  depends_on = [google_project_service.artifact_registry]
}

# --- GCP Service Account for Lambda → Inference calls ---

resource "google_service_account" "lambda_caller" {
  account_id   = "ecolens-lambda-caller"
  display_name = "EcoLens Lambda Caller - calls Cloud Run inference"

  depends_on = [google_project_service.iam]
}

resource "google_service_account_key" "lambda_caller_key" {
  service_account_id = google_service_account.lambda_caller.name
}

resource "aws_secretsmanager_secret" "gcp_sa_key" {
  name                    = "ecolens-gcp-sa-key"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "gcp_sa_key" {
  secret_id     = aws_secretsmanager_secret.gcp_sa_key.id
  secret_string = base64decode(google_service_account_key.lambda_caller_key.private_key)
}

# --- AWS IAM ---

locals {
  lambda_trust_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

# read_query: fn-query-tags, fn-query-species, fn-query-thumbnail, fn-list-files, fn-show-process
resource "aws_iam_role" "lambda_read_query" {
  name               = "ecolens-lambda-read-query"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_read_query_basic" {
  role       = aws_iam_role.lambda_read_query.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_read_query" {
  name = "ecolens-read-query-policy"
  role = aws_iam_role.lambda_read_query.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:Scan", "dynamodb:Query"]
        Resource = "arn:aws:dynamodb:*:*:table/${local.table_name}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = [
          "arn:aws:s3:::${local.bucket_name}/original/*",
          "arn:aws:s3:::${local.bucket_name}/thumbnails/*",
        ]
      }
    ]
  })
}

# upload: fn-upload
resource "aws_iam_role" "lambda_upload" {
  name               = "ecolens-lambda-upload"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_upload_basic" {
  role       = aws_iam_role.lambda_upload.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_upload" {
  name = "ecolens-upload-policy"
  role = aws_iam_role.lambda_upload.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:Scan"]
        Resource = "arn:aws:dynamodb:*:*:table/${local.table_name}"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "arn:aws:s3:::${local.bucket_name}/original/*"
      }
    ]
  })
}

# thumbnail: fn-thumbnail
resource "aws_iam_role" "lambda_thumbnail" {
  name               = "ecolens-lambda-thumbnail"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_thumbnail_basic" {
  role       = aws_iam_role.lambda_thumbnail.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_thumbnail" {
  name = "ecolens-thumbnail-policy"
  role = aws_iam_role.lambda_thumbnail.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = "arn:aws:s3:::${local.bucket_name}/original/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "arn:aws:s3:::${local.bucket_name}/thumbnails/*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:UpdateItem"]
        Resource = "arn:aws:dynamodb:*:*:table/${local.table_name}"
      },
      {
        Effect   = "Allow"
        Action   = ["sns:Publish"]
        Resource = aws_sns_topic.notifications.arn
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.gcp_sa_key.arn
      }
    ]
  })
}

# query_file: fn-query-file-init, fn-query-file
resource "aws_iam_role" "lambda_query_file" {
  name               = "ecolens-lambda-query-file"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_query_file_basic" {
  role       = aws_iam_role.lambda_query_file.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_query_file" {
  name = "ecolens-query-file-policy"
  role = aws_iam_role.lambda_query_file.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${local.bucket_name}/tmp/*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = [
          "arn:aws:s3:::${local.bucket_name}/original/*",
          "arn:aws:s3:::${local.bucket_name}/thumbnails/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = "arn:aws:dynamodb:*:*:table/${local.table_name}"
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.gcp_sa_key.arn
      }
    ]
  })
}

# tags_modify: fn-tags-modify
resource "aws_iam_role" "lambda_tags_modify" {
  name               = "ecolens-lambda-tags-modify"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_tags_modify_basic" {
  role       = aws_iam_role.lambda_tags_modify.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_tags_modify" {
  name = "ecolens-tags-modify-policy"
  role = aws_iam_role.lambda_tags_modify.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
        Resource = "arn:aws:dynamodb:*:*:table/${local.table_name}"
      }
    ]
  })
}

# notify: fn-notify-subscribe, fn-notify-unsubscribe
resource "aws_iam_role" "lambda_notify" {
  name               = "ecolens-lambda-notify"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_notify_basic" {
  role       = aws_iam_role.lambda_notify.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_notify" {
  name = "ecolens-notify-policy"
  role = aws_iam_role.lambda_notify.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sns:Subscribe", "sns:Unsubscribe", "sns:ListSubscriptionsByTopic", "sns:SetSubscriptionAttributes", "sns:GetSubscriptionAttributes"]
        Resource = aws_sns_topic.notifications.arn
      }
    ]
  })
}

# delete: fn-delete
resource "aws_iam_role" "lambda_delete" {
  name               = "ecolens-lambda-delete"
  assume_role_policy = local.lambda_trust_policy
}

resource "aws_iam_role_policy_attachment" "lambda_delete_basic" {
  role       = aws_iam_role.lambda_delete.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "lambda_delete" {
  name = "ecolens-delete-policy"
  role = aws_iam_role.lambda_delete.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["s3:DeleteObject"]
        Resource = [
          "arn:aws:s3:::${local.bucket_name}/original/*",
          "arn:aws:s3:::${local.bucket_name}/thumbnails/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:DeleteItem", "dynamodb:Scan"]
        Resource = "arn:aws:dynamodb:*:*:table/${local.table_name}"
      }
    ]
  })
}

# --- S3 ---

resource "aws_s3_bucket" "media" {
  bucket = local.bucket_name
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "media" {
  bucket = aws_s3_bucket.media.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  bucket = aws_s3_bucket.media.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "HEAD"]
    allowed_origins = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# --- DynamoDB ---

resource "aws_dynamodb_table" "files" {
  name         = local.table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "file_id"

  attribute {
    name = "file_id"
    type = "S"
  }
}

# --- SNS ---

resource "aws_sns_topic" "notifications" {
  name = "ecolens-notifications"
}

# --- Cognito ---

resource "aws_cognito_user_pool" "main" {
  name                     = "ecolens-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  schema {
    name                = "given_name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  schema {
    name                = "family_name"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = false
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = var.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_user_pool_client" "frontend" {
  name         = "ecolens-frontend"
  user_pool_id = aws_cognito_user_pool.main.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["email", "openid", "profile"]
  supported_identity_providers         = ["COGNITO"]

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  # Placeholder until frontend Cloud Run URL is known.
  # After cloudrun apply: fill frontend_url in terraform.tfvars, then re-apply foundation.
  callback_urls = var.frontend_url != "" ? ["${var.frontend_url}/callback"] : ["https://localhost:3000/callback"]
  logout_urls   = var.frontend_url != "" ? [var.frontend_url] : ["https://localhost:3000"]
}

# --- API Gateway ---

resource "aws_apigatewayv2_api" "main" {
  name          = "ecolens-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["GET", "POST", "DELETE", "OPTIONS"]
    allow_headers = ["Authorization", "Content-Type"]
    max_age       = 300
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_authorizer" "cognito" {
  api_id           = aws_apigatewayv2_api.main.id
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name             = "cognito-jwt"

  jwt_configuration {
    audience = [aws_cognito_user_pool_client.frontend.id]
    issuer   = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.main.id}"
  }
}
