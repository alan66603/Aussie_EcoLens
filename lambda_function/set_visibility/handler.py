import json
import os

import boto3

TABLE_NAME = os.environ["TABLE_NAME"]

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


def lambda_handler(event, context):
    # POST /files/visibility
    # Request body: {"file_id": "...", "isPersonal": true/false}
    # Only the file owner can change this setting.

    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "ok"})

    try:
        current_user = get_current_user_sub(event)
    except ValueError as error:
        return response(401, {"error": str(error)})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body."})

    file_id = str(body.get("file_id", "")).strip()
    is_personal = body.get("isPersonal")

    if not file_id:
        return response(400, {"error": "file_id is required."})

    if not isinstance(is_personal, bool):
        return response(400, {"error": "isPersonal must be true or false."})

    result = table.get_item(Key={"file_id": file_id})
    item = result.get("Item")

    if not item:
        return response(404, {"error": "File not found."})

    if item.get("owner", "") != current_user:
        return response(403, {"error": "You do not own this file."})

    table.update_item(
        Key={"file_id": file_id},
        UpdateExpression="SET isPersonal = :val",
        ExpressionAttributeValues={":val": is_personal},
    )

    return response(
        200,
        {
            "file_id": file_id,
            "isPersonal": is_personal,
            "message": "Visibility updated.",
        },
    )
