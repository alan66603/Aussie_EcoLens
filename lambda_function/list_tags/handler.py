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
            "Access-Control-Allow-Methods": "OPTIONS,GET",
        },
        "body": json.dumps(body),
    }


def lambda_handler(event, context):
    # GET /tags
    # Scans all DynamoDB items and returns every unique tag name across all files.

    method = event.get("requestContext", {}).get("http", {}).get("method")

    if method == "OPTIONS":
        return response(200, {"message": "ok"})

    tag_set = set()
    scan_kwargs = {"ProjectionExpression": "tags"}

    while True:
        result = table.scan(**scan_kwargs)

        for item in result.get("Items", []):
            tags = item.get("tags", {})

            if isinstance(tags, dict):
                for tag in tags.keys():
                    clean_tag = str(tag).strip().lower()

                    if clean_tag:
                        tag_set.add(clean_tag)

        last_key = result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return response(200, {"tags": sorted(tag_set)})
