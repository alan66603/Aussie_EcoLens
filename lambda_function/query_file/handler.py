import json
import os
from decimal import Decimal
from urllib.parse import urlparse

import boto3
import google.auth.transport.requests
import requests
from boto3.dynamodb.conditions import Attr
from google.oauth2 import service_account

# DO NOT rename these variables or change the os.environ key names.
# They are injected by Terraform at deploy time.
# For local testing, set them as shell env vars before running:
#   export TABLE_NAME=ecolens-files
#   export INFERENCE_URL=https://<cloud-run-url>
#   export BUCKET_NAME=ecolens-media-cloud-best-team
#   export GCP_SA_SECRET_ARN=arn:aws:secretsmanager:...
TABLE_NAME = os.environ["TABLE_NAME"]
INFERENCE_URL = os.environ["INFERENCE_URL"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
GCP_SA_SECRET_ARN = os.environ["GCP_SA_SECRET_ARN"]

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def get_inference_token():
    secret = boto3.client("secretsmanager").get_secret_value(SecretId=GCP_SA_SECRET_ARN)
    sa_info = json.loads(secret["SecretString"])
    credentials = service_account.IDTokenCredentials.from_service_account_info(
        sa_info, target_audience=INFERENCE_URL
    )
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials.token


def decimal_to_json(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def presign(s3_url):
    key = urlparse(s3_url).path.lstrip("/")
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET_NAME, "Key": key},
        ExpiresIn=3600,
    )


def build_media_result(item, current_user):
    file_url = item.get("file_url", "")

    if not file_url:
        return None

    file_type = item.get("file_type", "image")
    thumbnail_url = item.get("thumbnail_url", "")
    is_personal = item.get("isPersonal", True)
    owner = item.get("owner", "")

    is_mine = owner == current_user
    can_edit = is_mine or (is_personal is False)

    file_presigned_url = presign(file_url)

    if file_type == "image":
        display_source = thumbnail_url or file_url
        display_url = presign(display_source)
        thumbnail_presigned_url = presign(thumbnail_url) if thumbnail_url else ""
    else:
        display_url = file_presigned_url
        thumbnail_presigned_url = ""

    return {
        "file_id": item.get("file_id", ""),
        "file_type": file_type,
        "display_url": display_url,
        "file_url": file_presigned_url,
        "actual_file_url": file_url,
        "thumbnail_url": thumbnail_url,
        "thumbnail_presigned_url": thumbnail_presigned_url,
        "tags": item.get("tags", {}),
        "owner": owner,
        "isPersonal": is_personal,
        "can_edit": can_edit,
        "is_mine": is_mine,
    }


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps(body, default=decimal_to_json),
    }


def call_inference(tmp_key, file_type):
    download_url = s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET_NAME, "Key": tmp_key},
        ExpiresIn=60,
    )
    response = requests.post(
        INFERENCE_URL + "/predict",
        headers={"Authorization": f"Bearer {get_inference_token()}"},
        json={"file_url": download_url, "file_type": file_type},
    )
    return response.json()["tags"]


def lambda_handler(event, context):
    # POST /query/file
    # Request body: {"s3_key": "tmp/abc123.jpg", "file_type": "image"}
    # Frontend uploads file directly to S3 via presigned URL from /query/file/init,
    # then calls this endpoint with the S3 key. File is deleted after inference.

    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "ok"})

    current_user = (
        event.get("requestContext", {})
        .get("authorizer", {})
        .get("jwt", {})
        .get("claims", {})
        .get("sub", "")
    )

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body."})

    tmp_key = str(body.get("s3_key", "")).strip()
    file_type = str(body.get("file_type", "")).strip().lower()

    if not tmp_key:
        return response(400, {"error": "s3_key is required."})

    if file_type not in ("image", "video"):
        return response(400, {"error": "file_type must be image or video."})

    try:
        tags = call_inference(tmp_key, file_type)
    finally:
        s3.delete_object(Bucket=BUCKET_NAME, Key=tmp_key)

    filter_expr = None

    for species in tags:
        condition = Attr(f"tags.{species}").gte(1)
        filter_expr = condition if filter_expr is None else filter_expr & condition

    if filter_expr is None:
        return response(200, {"results": []})

    results = []
    scan_kwargs = {"FilterExpression": filter_expr}

    while True:
        scan_result = table.scan(**scan_kwargs)

        for item in scan_result.get("Items", []):
            result_item = build_media_result(item, current_user)

            if result_item:
                results.append(result_item)

        last_key = scan_result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return response(200, {"results": results})
