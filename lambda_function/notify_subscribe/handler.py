import json
import os
import re

import boto3

SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]

sns = boto3.client("sns")

TAG_PATTERN = re.compile(r"^[a-zA-Z _-]+$")
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


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


def normalise_tag(value):
    return str(value or "").strip().lower()


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "ok"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body."})

    email = str(body.get("email", "")).strip().lower()
    tags = body.get("tags", [])

    if not email or not EMAIL_PATTERN.match(email):
        return response(400, {"error": "A valid email address is required."})

    if not isinstance(tags, list) or len(tags) == 0:
        return response(400, {"error": "tags must be a non-empty list."})

    clean_tags = []
    seen_tags = set()

    for tag in tags:
        clean_tag = normalise_tag(tag)

        if not clean_tag:
            continue

        if not TAG_PATTERN.match(clean_tag):
            return response(
                400,
                {
                    "error": "Invalid tag name. Use letters, spaces, hyphens or underscores only."
                },
            )

        if clean_tag not in seen_tags:
            seen_tags.add(clean_tag)
            clean_tags.append(clean_tag)

    if not clean_tags:
        return response(400, {"error": "At least one valid tag is required."})

    try:
        existing_arn = None
        is_pending   = False
        paginate_kwargs = {"TopicArn": SNS_TOPIC_ARN}

        while True:
            page = sns.list_subscriptions_by_topic(**paginate_kwargs)

            for sub in page.get("Subscriptions", []):
                if sub.get("Endpoint", "").lower() != email:
                    continue

                arn = sub.get("SubscriptionArn", "")

                if arn not in ("PendingConfirmation", "Deleted"):
                    existing_arn = arn
                    break

                if arn == "PendingConfirmation":
                    is_pending = True

            if existing_arn:
                break

            next_token = page.get("NextToken")
            if not next_token:
                break
            paginate_kwargs["NextToken"] = next_token

        if existing_arn:
            sns.set_subscription_attributes(
                SubscriptionArn=existing_arn,
                AttributeName="FilterPolicy",
                AttributeValue=json.dumps({"species": clean_tags}),
            )

            return response(
                200,
                {
                    "message": "Subscription updated with new tags.",
                    "email": email,
                    "tags": clean_tags,
                    "subscription_arn": existing_arn,
                },
            )

        if is_pending:
            return response(
                409,
                {
                    "message": "This email is already subscribed. Please check your inbox and confirm the subscription email.",
                    "email": email,
                    "tags": clean_tags,
                },
            )

        result = sns.subscribe(
            TopicArn=SNS_TOPIC_ARN,
            Protocol="email",
            Endpoint=email,
            Attributes={"FilterPolicy": json.dumps({"species": clean_tags})},
            ReturnSubscriptionArn=True,
        )

        subscription_arn = result.get("SubscriptionArn", "")

        return response(
            200,
            {
                "message": "Subscription request created. Please confirm the subscription from your email inbox.",
                "email": email,
                "tags": clean_tags,
                "subscription_arn": subscription_arn,
            },
        )

    except Exception as error:
        print(f"Subscribe failed: {error}")
        return response(500, {"error": "Failed to create SNS subscription."})
