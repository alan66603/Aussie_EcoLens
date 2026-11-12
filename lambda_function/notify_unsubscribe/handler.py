import json
import os
import re

import boto3

SNS_TOPIC_ARN = os.environ["SNS_TOPIC_ARN"]

sns = boto3.client("sns")

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


def find_subscriptions_by_email(email):
    matches = []
    next_token = None

    while True:
        kwargs = {"TopicArn": SNS_TOPIC_ARN}

        if next_token:
            kwargs["NextToken"] = next_token

        result = sns.list_subscriptions_by_topic(**kwargs)

        for subscription in result.get("Subscriptions", []):
            if str(subscription.get("Endpoint", "")).strip().lower() == email:
                matches.append(subscription)

        next_token = result.get("NextToken")

        if not next_token:
            break

    return matches


def lambda_handler(event, context):
    if event.get("requestContext", {}).get("http", {}).get("method") == "OPTIONS":
        return response(200, {"message": "ok"})

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return response(400, {"error": "Invalid JSON body."})

    email = str(body.get("email", "")).strip().lower()

    if not email or not EMAIL_PATTERN.match(email):
        return response(400, {"error": "A valid email address is required."})

    try:
        subscriptions = find_subscriptions_by_email(email)

        if not subscriptions:
            return response(
                404,
                {
                    "message": "No subscription found for this email.",
                    "email": email,
                },
            )

        removed = []
        pending = []

        for subscription in subscriptions:
            subscription_arn = subscription.get("SubscriptionArn", "")

            if subscription_arn == "Deleted":
                continue

            if not subscription_arn or subscription_arn == "PendingConfirmation":
                pending.append(
                    {
                        "email": email,
                        "status": "pending_confirmation",
                        "message": "This email has not confirmed the SNS subscription yet, so it cannot be unsubscribed by ARN from this endpoint.",
                    }
                )
                continue

            sns.unsubscribe(SubscriptionArn=subscription_arn)

            removed.append(
                {
                    "email": email,
                    "subscription_arn": subscription_arn,
                    "status": "unsubscribed",
                }
            )

        if not removed and not pending:
            return response(
                404,
                {
                    "message": "No active subscription found for this email.",
                    "email": email,
                },
            )

        return response(
            200,
            {
                "message": "Unsubscribe request completed.",
                "email": email,
                "removed": removed,
                "pending": pending,
            },
        )

    except Exception as error:
        print(f"Unsubscribe failed: {error}")
        return response(500, {"error": "Failed to unsubscribe from SNS."})
