import json
import os
from decimal import Decimal
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def decimal_to_json(value):
    if isinstance(value, Decimal):
        return int(value) if value % 1 == 0 else float(value)

    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "OPTIONS,GET",
        },
        "body": json.dumps(body, default=decimal_to_json),
    }


def get_current_user_sub(event):
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    # HTTP API JWT authorizer format:
    # requestContext.authorizer.jwt.claims.sub
    user_sub = authorizer.get("jwt", {}).get("claims", {}).get("sub", "")

    if user_sub:
        return user_sub

    # REST API / Cognito authorizer format:
    # requestContext.authorizer.claims.sub
    user_sub = authorizer.get("claims", {}).get("sub", "")

    if user_sub:
        return user_sub

    # Some integrations may pass claims directly under authorizer.
    user_sub = authorizer.get("sub", "")

    if user_sub:
        return user_sub

    return ""


def presign(s3_url):
    if not s3_url:
        return ""

    key = urlparse(s3_url).path.lstrip("/")

    if not key:
        return ""

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


def lambda_handler(event, context):
    # GET /files/mine
    # Returns only files owned by the current user.

    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if method == "OPTIONS":
        return response(200, {"message": "ok"})

    current_user = get_current_user_sub(event)

    if not current_user:
        print("Unable to identify current user. requestContext:")
        print(json.dumps(event.get("requestContext", {}), default=str))

        return response(
            401,
            {
                "error": "Unable to identify current user.",
                "message": "The API route may not have a Cognito/JWT authorizer attached, or the JWT claims structure is different.",
            },
        )

    scan_kwargs = {"FilterExpression": Attr("owner").eq(current_user)}

    results = []

    while True:
        scan_result = table.scan(**scan_kwargs)

        for item in scan_result.get("Items", []):
            result_item = build_media_result(item, current_user)

            if result_item:
                # /files/mine only returns the current user's own files.
                result_item["can_edit"] = True
                result_item["is_mine"] = True
                results.append(result_item)

        last_key = scan_result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return response(200, {"results": results})
