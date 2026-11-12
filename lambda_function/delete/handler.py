import json
import os
from urllib.parse import urlparse, unquote
import base64

import boto3
from boto3.dynamodb.conditions import Attr

# DO NOT rename these variables or change the os.environ key names.
TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3")
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)


def response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "OPTIONS,DELETE",
        },
        "body": json.dumps(body),
    }


def get_current_user_sub(event):
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    user_sub = authorizer.get("jwt", {}).get("claims", {}).get("sub", "")

    if user_sub:
        return user_sub

    user_sub = authorizer.get("claims", {}).get("sub", "")

    if user_sub:
        return user_sub

    user_sub = authorizer.get("sub", "")

    if user_sub:
        return user_sub

    raise ValueError("Unable to identify current user from Cognito claims.")


def parse_body(event):
    body = event.get("body")

    if body is None:
        return {}

    if event.get("isBase64Encoded"):
        body = base64.b64decode(body).decode("utf-8")

    if isinstance(body, dict):
        return body

    try:
        return json.loads(body)
    except json.JSONDecodeError:
        raise ValueError("Invalid JSON body.")


def strip_presigned_params(url):
    if not isinstance(url, str):
        return ""

    clean_url = url.strip()

    if not clean_url:
        return ""

    parsed = urlparse(clean_url)
    return parsed._replace(query="", fragment="").geturl()


def s3_key_from_url(url):
    """
    Extract S3 object key from these formats:

    https://bucket.s3.amazonaws.com/original/a.jpg
    https://bucket.s3.us-east-1.amazonaws.com/original/a.jpg
    https://s3.amazonaws.com/bucket/original/a.jpg
    https://s3.us-east-1.amazonaws.com/bucket/original/a.jpg
    """
    plain_url = strip_presigned_params(url)

    if not plain_url:
        return ""

    parsed = urlparse(plain_url)
    path = unquote(parsed.path.lstrip("/"))

    # Path-style URL:
    # /bucket/key -> key
    if path.startswith(f"{BUCKET_NAME}/"):
        path = path[len(BUCKET_NAME) + 1 :]

    return path


def canonical_s3_url(url):
    """
    Convert any accepted S3 URL format into the DynamoDB stored format:
    https://<bucket>.s3.amazonaws.com/<key>
    """
    key = s3_key_from_url(url)

    if not key:
        return ""

    return f"https://{BUCKET_NAME}.s3.amazonaws.com/{key}"


def find_record_by_url(input_url):
    """
    Find DynamoDB item by file_url or thumbnail_url.
    Supports exact URL, presigned URL, regional/non-regional S3 URL,
    and path-style S3 URL.
    """
    plain_input_url = strip_presigned_params(input_url)
    canonical_input_url = canonical_s3_url(input_url)
    target_key = s3_key_from_url(input_url)

    if not plain_input_url and not canonical_input_url and not target_key:
        return None

    possible_urls = list(
        {value for value in [plain_input_url, canonical_input_url] if value}
    )

    for candidate_url in possible_urls:
        scan_kwargs = {
            "FilterExpression": Attr("file_url").eq(candidate_url)
            | Attr("thumbnail_url").eq(candidate_url)
        }

        while True:
            result = table.scan(**scan_kwargs)
            items = result.get("Items", [])

            if items:
                return items[0]

            last_key = result.get("LastEvaluatedKey")

            if not last_key:
                break

            scan_kwargs["ExclusiveStartKey"] = last_key

    if not target_key:
        return None

    scan_kwargs = {}

    while True:
        result = table.scan(**scan_kwargs)

        for item in result.get("Items", []):
            file_key = s3_key_from_url(item.get("file_url", ""))
            thumbnail_key = s3_key_from_url(item.get("thumbnail_url", ""))

            if target_key in [file_key, thumbnail_key]:
                return item

        last_key = result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return None


def delete_s3_object_by_url(url):
    key = s3_key_from_url(url)

    if not key:
        return None

    s3.delete_object(Bucket=BUCKET_NAME, Key=key)
    return key


def delete_record(item):
    file_id = item.get("file_id")

    if not file_id:
        raise ValueError("Matched DynamoDB item does not contain file_id.")

    deleted_keys = []

    file_url = item.get("file_url", "")
    original_key = delete_s3_object_by_url(file_url)

    if original_key:
        deleted_keys.append(original_key)

    if item.get("file_type") == "image" and item.get("thumbnail_url"):
        thumbnail_key = delete_s3_object_by_url(item["thumbnail_url"])

        if thumbnail_key:
            deleted_keys.append(thumbnail_key)

    table.delete_item(Key={"file_id": file_id})

    return {
        "file_id": file_id,
        "file_type": item.get("file_type", ""),
        "deleted_keys": deleted_keys,
    }


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "ok"})

    try:
        current_user = get_current_user_sub(event)
    except ValueError as error:
        return response(401, {"error": str(error)})

    try:
        body = parse_body(event)
        urls = body.get("urls", [])

        if not isinstance(urls, list) or not urls:
            return response(400, {"error": "urls must be a non-empty list."})

        results = []

        for raw_url in urls:
            input_url = str(raw_url or "").strip()

            if not input_url:
                results.append(
                    {
                        "url": raw_url,
                        "status": "skipped",
                        "message": "Empty URL skipped.",
                    }
                )
                continue

            try:
                record = find_record_by_url(input_url)

                if not record:
                    results.append(
                        {
                            "url": input_url,
                            "status": "not_found",
                            "message": "No DynamoDB record found for this URL.",
                            "normalised_url": strip_presigned_params(input_url),
                            "canonical_url": canonical_s3_url(input_url),
                            "s3_key": s3_key_from_url(input_url),
                        }
                    )
                    continue

                if record.get("owner", "") != current_user:
                    results.append(
                        {
                            "url": input_url,
                            "status": "forbidden",
                            "file_id": record.get("file_id", ""),
                            "message": "You do not own this file, so it cannot be deleted.",
                        }
                    )
                    continue

                deleted = delete_record(record)

                results.append(
                    {
                        "url": input_url,
                        "status": "deleted",
                        "file_id": deleted["file_id"],
                        "file_type": deleted["file_type"],
                        "deleted_keys": deleted["deleted_keys"],
                        "message": "File, thumbnail if applicable, and database record deleted.",
                    }
                )

            except Exception as item_error:
                print(f"Failed to delete {input_url}: {item_error}")
                results.append(
                    {
                        "url": input_url,
                        "status": "error",
                        "message": str(item_error),
                        "normalised_url": strip_presigned_params(input_url),
                        "canonical_url": canonical_s3_url(input_url),
                        "s3_key": s3_key_from_url(input_url),
                    }
                )

        return response(
            200,
            {
                "message": "Delete request completed.",
                "results": results,
            },
        )

    except ValueError as error:
        return response(400, {"error": str(error)})

    except Exception as error:
        print(f"Unexpected delete error: {error}")
        return response(500, {"error": "Internal server error."})
