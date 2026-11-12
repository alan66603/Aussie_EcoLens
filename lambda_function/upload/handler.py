import json
import os
import uuid

import boto3
from boto3.dynamodb.conditions import Attr

# DO NOT rename these variables or change the os.environ key names.
# They are injected by Terraform at deploy time.
# For local testing, set them as shell env vars before running:
#   export BUCKET_NAME=ecolens-media
#   export TABLE_NAME=ecolens-files
BUCKET_NAME = os.environ["BUCKET_NAME"]
TABLE_NAME = os.environ["TABLE_NAME"]

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
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps(body),
    }


def get_current_user_sub(event):
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})

    # HTTP API JWT authorizer / payload 2.0:
    # requestContext.authorizer.jwt.claims.sub
    user_sub = authorizer.get("jwt", {}).get("claims", {}).get("sub", "")

    if user_sub:
        return user_sub

    # REST API / Cognito authorizer / payload 1.0:
    # requestContext.authorizer.claims.sub
    user_sub = authorizer.get("claims", {}).get("sub", "")

    if user_sub:
        return user_sub

    # Some integrations may flatten sub directly under authorizer.
    user_sub = authorizer.get("sub", "")

    if user_sub:
        return user_sub

    raise ValueError("Unable to identify current user from Cognito claims.")


def checksum_exists(checksum):
    scan_kwargs = {
        "FilterExpression": Attr("checksum").eq(checksum),
        "ProjectionExpression": "file_id",
    }

    while True:
        result = table.scan(**scan_kwargs)

        if result.get("Items"):
            return True

        last_key = result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return False


def lambda_handler(event, context):
    # POST /upload
    # Request:
    # {
    #   "filename": "koala.jpg",
    #   "contentType": "image/jpeg",
    #   "checksum": "<sha256hex>"
    # }
    #
    # Response:
    # {
    #   "presigned_url": "...",
    #   "file_id": "<uuid>"
    # }

    method = event.get("requestContext", {}).get("http", {}).get("method", "")

    if method == "OPTIONS":
        return response(200, {"message": "ok"})

    try:
        owner = get_current_user_sub(event)
    except ValueError as error:
        return response(401, {"error": str(error)})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body."})

    filename = str(body.get("filename", "")).strip()
    content_type = str(body.get("contentType", "")).strip()
    checksum = str(body.get("checksum", "")).strip()

    if not filename or not content_type or not checksum:
        return response(
            400,
            {"error": "filename, contentType and checksum are required."},
        )

    if content_type.startswith("image/"):
        file_type = "image"
    elif content_type.startswith("video/"):
        file_type = "video"
    else:
        return response(
            400,
            {"error": f"Unsupported contentType: {content_type}"},
        )

    if checksum_exists(checksum):
        return response(409, {"error": "File already exists."})

    file_id = str(uuid.uuid4())
    _, ext = os.path.splitext(filename)

    if not ext:
        ext = ".jpg" if file_type == "image" else ".mp4"

    s3_key = f"original/{file_id}{ext.lower()}"

    table.put_item(
        Item={
            "file_id": file_id,
            "checksum": checksum,
            "file_type": file_type,
            "owner": owner,
            # True = everyone can view/query, but only the owner can edit tags.
            "isPersonal": True,
        }
    )

    presigned_url = s3.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": BUCKET_NAME,
            "Key": s3_key,
            "ContentType": content_type,
        },
        ExpiresIn=300,
    )

    return response(
        200,
        {
            "presigned_url": presigned_url,
            "file_id": file_id,
        },
    )
