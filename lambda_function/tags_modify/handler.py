import base64
import json
import os
import re
from decimal import Decimal
from urllib.parse import urlparse

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ["TABLE_NAME"]

dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

TAG_MAX_LENGTH = 30
TAG_PATTERN = re.compile(r"^[a-zA-Z _-]+$")


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
            "Access-Control-Allow-Methods": "OPTIONS,POST",
        },
        "body": json.dumps(body, default=decimal_to_json),
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
        raise ValueError("Request body must be valid JSON.")


def normalise_file_ids(raw_file_ids):
    if raw_file_ids is None:
        return []

    if not isinstance(raw_file_ids, list):
        raise ValueError("file_ids must be a list.")

    file_ids = []

    for file_id in raw_file_ids:
        if not isinstance(file_id, str):
            raise ValueError("Each file_id must be a string.")

        clean_file_id = file_id.strip()

        if clean_file_id:
            file_ids.append(clean_file_id)

    return file_ids


def normalise_urls(raw_urls):
    if raw_urls is None:
        return []

    if not isinstance(raw_urls, list):
        raise ValueError("urls must be a list.")

    urls = []

    for url in raw_urls:
        if not isinstance(url, str):
            raise ValueError("Each url must be a string.")

        clean_url = url.strip()

        if clean_url:
            urls.append(clean_url)

    return urls


def is_valid_tag_name(tag_name):
    if not isinstance(tag_name, str):
        return False

    clean_tag = tag_name.strip().lower()

    if not clean_tag:
        return False

    if len(clean_tag) > TAG_MAX_LENGTH:
        return False

    return TAG_PATTERN.fullmatch(clean_tag) is not None


def normalise_tags(raw_tags):
    """
    Accepts either:
    - {"domestic dog": 2, "red fox": 1}
    - ["domestic dog", "red fox"]

    Validation:
    - tag names must be 30 characters or fewer
    - tag names can only contain English letters, spaces, hyphens, or underscores
    - counts must be positive whole numbers
    """
    if raw_tags is None:
        raise ValueError("tags is required.")

    tag_map = {}

    if isinstance(raw_tags, dict):
        for raw_name, raw_count in raw_tags.items():
            if not isinstance(raw_name, str):
                raise ValueError("Tag names must be strings.")

            tag_name = raw_name.strip().lower()

            if not tag_name:
                continue

            if not is_valid_tag_name(tag_name):
                raise ValueError(
                    "Tag names must be 30 characters or fewer and can only contain English letters, spaces, hyphens, or underscores."
                )

            if isinstance(raw_count, bool):
                raise ValueError(
                    f"Tag count for '{tag_name}' must be a positive whole number."
                )

            if isinstance(raw_count, int):
                count = raw_count
            elif isinstance(raw_count, str) and re.fullmatch(
                r"[1-9][0-9]*", raw_count.strip()
            ):
                count = int(raw_count.strip())
            else:
                raise ValueError(
                    f"Tag count for '{tag_name}' must be a positive whole number."
                )

            if count <= 0:
                raise ValueError(f"Tag count for '{tag_name}' must be greater than 0.")

            tag_map[tag_name] = count

    elif isinstance(raw_tags, list):
        for raw_name in raw_tags:
            if not isinstance(raw_name, str):
                raise ValueError("Tag names must be strings.")

            tag_name = raw_name.strip().lower()

            if not tag_name:
                continue

            if not is_valid_tag_name(tag_name):
                raise ValueError(
                    "Tag names must be 30 characters or fewer and can only contain English letters, spaces, hyphens, or underscores."
                )

            tag_map[tag_name] = 1

    else:
        raise ValueError("tags must be either a map or a list.")

    if not tag_map:
        raise ValueError("At least one valid tag is required.")

    return tag_map


def normalise_operation(raw_operation):
    try:
        operation = int(raw_operation)
    except (TypeError, ValueError):
        raise ValueError("operation must be 1 for add/update or 0 for remove.")

    if operation not in (0, 1):
        raise ValueError("operation must be 1 for add/update or 0 for remove.")

    return operation


def normalise_url_for_match(url):
    if not isinstance(url, str):
        return ""

    clean_url = url.strip()

    if not clean_url:
        return ""

    parsed = urlparse(clean_url)
    return parsed._replace(query="", fragment="").geturl()


def get_url_path(url):
    if not isinstance(url, str):
        return ""

    plain_url = normalise_url_for_match(url)

    if not plain_url:
        return ""

    return urlparse(plain_url).path


def find_record_by_url(url):
    plain_url = normalise_url_for_match(url)

    if not plain_url:
        return None

    scan_kwargs = {
        "FilterExpression": Attr("file_url").eq(plain_url)
        | Attr("thumbnail_url").eq(plain_url)
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

    target_path = get_url_path(plain_url)

    if not target_path:
        return None

    scan_kwargs = {}

    while True:
        result = table.scan(**scan_kwargs)

        for item in result.get("Items", []):
            file_path = get_url_path(item.get("file_url", ""))
            thumbnail_path = get_url_path(item.get("thumbnail_url", ""))

            if target_path in (file_path, thumbnail_path):
                return item

        last_key = result.get("LastEvaluatedKey")

        if not last_key:
            break

        scan_kwargs["ExclusiveStartKey"] = last_key

    return None


def get_record_by_file_id(file_id):
    result = table.get_item(Key={"file_id": file_id})
    return result.get("Item")


def apply_tag_operation(current_tags, tags_to_modify, operation):
    updated_tags = dict(current_tags or {})

    if operation == 1:
        for tag, count in tags_to_modify.items():
            updated_tags[tag] = count
    else:
        for tag in tags_to_modify:
            updated_tags.pop(tag, None)

    return updated_tags


def update_tags_only(file_id, updated_tags):
    table.update_item(
        Key={"file_id": file_id},
        UpdateExpression="SET tags = :tags",
        ExpressionAttributeValues={
            ":tags": updated_tags,
        },
    )


def process_record(record, source_identifier, tags_to_modify, operation, current_user):
    if not record:
        return {
            "identifier": source_identifier,
            "status": "not_found",
            "message": "No file record found for this identifier.",
        }

    file_id = record.get("file_id")

    if not file_id:
        return {
            "identifier": source_identifier,
            "status": "invalid_record",
            "message": "Matched record does not contain file_id.",
        }

    # Safe default:
    # Missing isPersonal should be treated as private/view-only, not public editable.
    is_personal = record.get("isPersonal", True)
    owner = record.get("owner", "")
    can_edit = (owner == current_user) or (is_personal is False)

    if not can_edit:
        return {
            "identifier": source_identifier,
            "file_id": file_id,
            "status": "forbidden",
            "message": "You do not have permission to edit tags on this file.",
        }

    current_tags = record.get("tags", {})
    updated_tags = apply_tag_operation(current_tags, tags_to_modify, operation)

    update_tags_only(file_id, updated_tags)

    return {
        "identifier": source_identifier,
        "file_id": file_id,
        "status": "updated",
        "operation": operation,
        "tags": updated_tags,
    }


def normalise_updates(raw_updates):
    """
    New independent per-file workflow.

    Request body:
    {
      "updates": [
        {"file_id": "...", "tags": {"domestic dog": 1}, "operation": 1},
        {"file_id": "...", "tags": {"red fox": 2}, "operation": 1}
      ]
    }
    """
    if raw_updates is None:
        return []

    if not isinstance(raw_updates, list):
        raise ValueError("updates must be a list.")

    updates = []

    for index, raw_update in enumerate(raw_updates):
        if not isinstance(raw_update, dict):
            raise ValueError(f"updates[{index}] must be an object.")

        file_id = str(raw_update.get("file_id", "")).strip()
        url = str(raw_update.get("url", "")).strip()

        if not file_id and not url:
            raise ValueError(f"updates[{index}] must include file_id or url.")

        tags = normalise_tags(raw_update.get("tags"))
        operation = normalise_operation(raw_update.get("operation"))

        updates.append(
            {
                "file_id": file_id,
                "url": url,
                "tags": tags,
                "operation": operation,
            }
        )

    return updates


def handle_independent_updates(updates, current_user):
    results = []

    for update in updates:
        if update["file_id"]:
            record = get_record_by_file_id(update["file_id"])
            identifier = update["file_id"]
        else:
            record = find_record_by_url(update["url"])
            identifier = update["url"]

        results.append(
            process_record(
                record=record,
                source_identifier=identifier,
                tags_to_modify=update["tags"],
                operation=update["operation"],
                current_user=current_user,
            )
        )

    return results


def handle_legacy_bulk_update(body, current_user):
    file_ids = normalise_file_ids(body.get("file_ids"))
    urls = normalise_urls(body.get("urls"))
    tags_to_modify = normalise_tags(body.get("tags"))
    operation = normalise_operation(body.get("operation"))

    if not file_ids and not urls:
        raise ValueError("Either file_ids, urls, or updates must be provided.")

    results = []

    for file_id in file_ids:
        record = get_record_by_file_id(file_id)
        results.append(
            process_record(
                record=record,
                source_identifier=file_id,
                tags_to_modify=tags_to_modify,
                operation=operation,
                current_user=current_user,
            )
        )

    for url in urls:
        record = find_record_by_url(url)
        results.append(
            process_record(
                record=record,
                source_identifier=url,
                tags_to_modify=tags_to_modify,
                operation=operation,
                current_user=current_user,
            )
        )

    return results, operation, tags_to_modify


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "ok"})

    try:
        current_user = get_current_user_sub(event)
    except ValueError as error:
        return response(401, {"message": str(error)})

    try:
        body = parse_body(event)

        updates = normalise_updates(body.get("updates"))

        if updates:
            results = handle_independent_updates(updates, current_user=current_user)

            return response(
                200,
                {
                    "message": "per-file tag modification completed",
                    "mode": "independent",
                    "results": results,
                },
            )

        results, operation, modified_tags = handle_legacy_bulk_update(
            body,
            current_user=current_user,
        )

        return response(
            200,
            {
                "message": "bulk tag modification completed",
                "mode": "bulk",
                "operation": operation,
                "modified_tags": modified_tags,
                "results": results,
            },
        )

    except ValueError as error:
        return response(
            400,
            {
                "message": str(error),
            },
        )

    except Exception as error:
        print(f"Unexpected error: {error}")
        return response(
            500,
            {
                "message": "Internal server error.",
            },
        )
