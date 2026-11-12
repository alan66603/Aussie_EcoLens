import json
import os
from decimal import Decimal
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Attr

# DO NOT rename these variables or change the os.environ key names.
# They are injected by Terraform at deploy time.
# For local testing: export TABLE_NAME=ecolens-files  BUCKET_NAME=ecolens-media-cloud-best-team
TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


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


def lambda_handler(event, context):
    # POST /query/thumbnail
    # Request body: {"thumbnail_url": "https://..."}
    # Returns the matched file record for the given thumbnail URL.

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

    thumbnail_url = str(body.get("thumbnail_url", "")).strip()

    if not thumbnail_url:
        return response(400, {"error": "thumbnail_url is required."})

    # Strip query params in case a presigned URL is passed.
    # DynamoDB stores plain thumbnail URLs.
    plain_url = urlparse(thumbnail_url)._replace(query="", fragment="").geturl()

    scan_kwargs = {"FilterExpression": Attr("thumbnail_url").eq(plain_url)}

    while True:
        scan_result = table.scan(**scan_kwargs)

        if scan_result.get("Items"):
            item = scan_result["Items"][0]
            result_item = build_media_result(item, current_user)

            if not result_item:
                return response(404, {"error": "File URL not found."})

            return response(200, result_item)

        last_key = scan_result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return response(404, {"error": "Thumbnail not found."})
