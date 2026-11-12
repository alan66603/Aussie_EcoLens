locals {
  lambda_functions = {
    "fn-upload"             = { source_dir = "${path.root}/../lambda_function/upload",            timeout = 30,  memory_size = 256, role = "upload" }
    "fn-thumbnail"          = { source_dir = "${path.root}/../lambda_function/thumbnail",          timeout = 300, memory_size = 512, role = "thumbnail" }
    "fn-query-tags"         = { source_dir = "${path.root}/../lambda_function/query_tags",         timeout = 30,  memory_size = 256, role = "read_query" }
    "fn-query-species"      = { source_dir = "${path.root}/../lambda_function/query_species",      timeout = 30,  memory_size = 256, role = "read_query" }
    "fn-query-thumbnail"    = { source_dir = "${path.root}/../lambda_function/query_thumbnail",    timeout = 30,  memory_size = 256, role = "read_query" }
    "fn-query-file-init"    = { source_dir = "${path.root}/../lambda_function/query_file_init",    timeout = 30,  memory_size = 256, role = "query_file" }
    "fn-query-file"         = { source_dir = "${path.root}/../lambda_function/query_file",         timeout = 60,  memory_size = 512, role = "query_file" }
    "fn-tags-modify"        = { source_dir = "${path.root}/../lambda_function/tags_modify",        timeout = 30,  memory_size = 256, role = "tags_modify" }
    "fn-delete"             = { source_dir = "${path.root}/../lambda_function/delete",             timeout = 30,  memory_size = 256, role = "delete" }
    "fn-notify-subscribe"   = { source_dir = "${path.root}/../lambda_function/notify_subscribe",   timeout = 10,  memory_size = 128, role = "notify" }
    "fn-notify-unsubscribe" = { source_dir = "${path.root}/../lambda_function/notify_unsubscribe", timeout = 10,  memory_size = 128, role = "notify" }
    "fn-list-files"         = { source_dir = "${path.root}/../lambda_function/list_files",         timeout = 30,  memory_size = 256, role = "read_query" }
    "fn-list-tags"          = { source_dir = "${path.root}/../lambda_function/list_tags",          timeout = 30,  memory_size = 256, role = "read_query" }
    "fn-list-mine"          = { source_dir = "${path.root}/../lambda_function/list_mine",          timeout = 30,  memory_size = 256, role = "read_query" }
    "fn-set-visibility"     = { source_dir = "${path.root}/../lambda_function/set_visibility",     timeout = 30,  memory_size = 256, role = "tags_modify" }
    "fn-show-process"       = { source_dir = "${path.root}/../lambda_function/show_process",       timeout = 30,  memory_size = 256, role = "read_query" }
  }

  api_routes = {
    "upload"             = { method = "POST",   path = "/upload",             function = "fn-upload" }
    "query-tags"         = { method = "POST",   path = "/query/tags",         function = "fn-query-tags" }
    "query-species"      = { method = "POST",   path = "/query/species",      function = "fn-query-species" }
    "query-thumbnail"    = { method = "POST",   path = "/query/thumbnail",    function = "fn-query-thumbnail" }
    "query-file-init"    = { method = "POST",   path = "/query/file/init",    function = "fn-query-file-init" }
    "query-file"         = { method = "POST",   path = "/query/file",         function = "fn-query-file" }
    "tags-modify"        = { method = "POST",   path = "/tags/modify",        function = "fn-tags-modify" }
    "delete"             = { method = "DELETE", path = "/files",              function = "fn-delete" }
    "notify-subscribe"   = { method = "POST",   path = "/notify/subscribe",   function = "fn-notify-subscribe" }
    "notify-unsubscribe" = { method = "POST",   path = "/notify/unsubscribe", function = "fn-notify-unsubscribe" }
    "list-files"         = { method = "GET",    path = "/files",              function = "fn-list-files" }
    "list-tags"          = { method = "GET",    path = "/tags",               function = "fn-list-tags" }
    "list-mine"          = { method = "GET",    path = "/files/mine",         function = "fn-list-mine" }
    "set-visibility"     = { method = "POST",   path = "/files/visibility",   function = "fn-set-visibility" }
    "show-process"       = { method = "GET",    path = "/show_process",       function = "fn-show-process" }
  }
}

resource "null_resource" "build_layer" {
  triggers = {
    requirements = filemd5("${path.root}/../lambda_layer/requirements.txt")
  }

  provisioner "local-exec" {
    command = "pip3 install -r ${path.root}/../lambda_layer/requirements.txt -t ${path.root}/../lambda_layer/python --quiet --platform manylinux2014_x86_64 --only-binary=:all: --python-version 3.13 --implementation cp"
  }
}

data "archive_file" "layer_zip" {
  type        = "zip"
  source_dir  = "${path.root}/../lambda_layer"
  output_path = "/tmp/ecolens-layer.zip"
  depends_on  = [null_resource.build_layer]
}

resource "aws_s3_object" "layer_zip" {
  bucket = var.bucket_name
  key    = "lambda-layers/ecolens-dependencies.zip"
  source = data.archive_file.layer_zip.output_path
  etag   = data.archive_file.layer_zip.output_md5

  depends_on = [data.archive_file.layer_zip]
}

resource "aws_lambda_layer_version" "dependencies" {
  s3_bucket        = var.bucket_name
  s3_key           = aws_s3_object.layer_zip.key
  layer_name       = "ecolens-dependencies"
  compatible_runtimes = ["python3.13"]
  source_code_hash = data.archive_file.layer_zip.output_base64sha256
}

data "archive_file" "lambda_zips" {
  for_each    = local.lambda_functions
  type        = "zip"
  source_dir  = each.value.source_dir
  output_path = "/tmp/${each.key}.zip"
}

resource "aws_lambda_function" "functions" {
  for_each         = local.lambda_functions
  function_name    = each.key
  role             = var.lambda_role_arns[each.value.role]
  runtime          = var.lambda_runtime
  handler          = "handler.lambda_handler"
  filename         = data.archive_file.lambda_zips[each.key].output_path
  source_code_hash = data.archive_file.lambda_zips[each.key].output_base64sha256
  timeout          = each.value.timeout
  memory_size      = each.value.memory_size
  layers           = [aws_lambda_layer_version.dependencies.arn]

  environment {
    variables = {
      BUCKET_NAME        = var.bucket_name
      TABLE_NAME         = var.table_name
      INFERENCE_URL      = var.inference_url
      SNS_TOPIC_ARN      = var.sns_topic_arn
      GCP_SA_SECRET_ARN  = var.gcp_sa_secret_arn
    }
  }
}

resource "aws_apigatewayv2_integration" "lambda" {
  for_each           = local.api_routes
  api_id             = var.api_gateway_id
  integration_type   = "AWS_PROXY"
  integration_method = "POST"
  integration_uri    = aws_lambda_function.functions[each.value.function].invoke_arn
}

resource "aws_apigatewayv2_route" "routes" {
  for_each           = local.api_routes
  api_id             = var.api_gateway_id
  route_key          = "${each.value.method} ${each.value.path}"
  authorization_type = "JWT"
  authorizer_id      = var.cognito_authorizer_id
  target             = "integrations/${aws_apigatewayv2_integration.lambda[each.key].id}"
}

resource "aws_lambda_permission" "apigw" {
  for_each      = local.api_routes
  statement_id  = "AllowAPIGateway-${each.key}"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions[each.value.function].function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}

resource "aws_lambda_permission" "s3_invoke_thumbnail" {
  statement_id  = "AllowS3InvokeThumbnail"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions["fn-thumbnail"].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = var.s3_bucket_arn
}

resource "aws_s3_bucket_notification" "thumbnail_trigger" {
  bucket = var.s3_bucket_id

  lambda_function {
    lambda_function_arn = aws_lambda_function.functions["fn-thumbnail"].arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "original/"
  }

  depends_on = [aws_lambda_permission.s3_invoke_thumbnail]
}
