import json
import os
from decimal import Decimal
from urllib.parse import urlparse

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)
s3 = boto3.client("s3")


class _DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def _resp(status: int, body: dict) -> dict:
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,Authorization",
            "Access-Control-Allow-Methods": "OPTIONS,GET",
        },
        "body": json.dumps(body, cls=_DecimalEncoder),
    }


def s3_key_from_url(s3_url):
    parsed = urlparse(str(s3_url or ""))
    path = parsed.path.lstrip("/")

    if path.startswith(f"{BUCKET_NAME}/"):
        path = path[len(BUCKET_NAME) + 1 :]

    return path


def presign(s3_url):
    key = s3_key_from_url(s3_url)

    if not key:
        return ""

    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET_NAME, "Key": key},
        ExpiresIn=3600,
    )


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return _resp(200, {"message": "ok"})

    params = event.get("queryStringParameters") or {}
    file_id = params.get("file_id", "")

    if not file_id:
        return _resp(400, {"error": "file_id is required"})

    result = table.get_item(Key={"file_id": file_id})
    item = result.get("Item")

    if not item:
        return _resp(202, {"status": "processing"})

    if not item.get("tags"):
        return _resp(202, {"status": "processing"})

    file_type = item.get("file_type")
    plain_file_url = item.get("file_url")
    plain_thumbnail_url = item.get("thumbnail_url")

    file_presigned_url = presign(plain_file_url)

    display_url = (
        presign(plain_thumbnail_url or plain_file_url)
        if file_type == "image"
        else file_presigned_url
    )

    return _resp(
        200,
        {
            "status": "ready",
            "file_id": item.get("file_id", file_id),
            "file_type": file_type,
            "display_url": display_url,
            "file_url": file_presigned_url,
            "thumbnail_url": plain_thumbnail_url,
            "tags": item["tags"],
        },
    )
