import io
import json
import os
from datetime import datetime, timezone

import boto3
import google.auth.transport.requests
import requests
from google.oauth2 import service_account
from PIL import Image

BUCKET_NAME       = os.environ["BUCKET_NAME"]
TABLE_NAME        = os.environ["TABLE_NAME"]
INFERENCE_URL     = os.environ["INFERENCE_URL"]
SNS_TOPIC_ARN     = os.environ["SNS_TOPIC_ARN"]
GCP_SA_SECRET_ARN = os.environ["GCP_SA_SECRET_ARN"]

s3         = boto3.client("s3")
dynamodb   = boto3.resource("dynamodb")
table      = dynamodb.Table(TABLE_NAME)
sns_client = boto3.client("sns")


THUMBNAIL_MAX_PX = 200
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


def get_inference_token() -> str:
    secret = boto3.client("secretsmanager").get_secret_value(SecretId=GCP_SA_SECRET_ARN)
    sa_info = json.loads(secret["SecretString"])
    credentials = service_account.IDTokenCredentials.from_service_account_info(
        sa_info, target_audience=INFERENCE_URL
    )
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials.token


def _make_thumbnail(image_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img.thumbnail((THUMBNAIL_MAX_PX, THUMBNAIL_MAX_PX), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _call_inference(presigned_url: str, file_type: str) -> dict:
    resp = requests.post(
        f"{INFERENCE_URL}/predict",
        headers={"Authorization": f"Bearer {get_inference_token()}"},
        json={"file_url": presigned_url, "file_type": file_type},
        timeout=300,
    )
    resp.raise_for_status()
    return resp.json().get("tags", {})


def lambda_handler(event, context):
    for record in event.get("Records", []):
        bucket = record["s3"]["bucket"]["name"]
        key    = record["s3"]["object"]["key"]

        # Extract file_id and extension from S3 key: original/<file_id>.<ext>
        filename = key.split("/")[-1]
        file_id, ext = os.path.splitext(filename)
        file_type = "image" if ext.lower() in IMAGE_EXTS else "video"

        # Permanent S3 URL stored in DynamoDB
        file_url = f"https://{BUCKET_NAME}.s3.amazonaws.com/{key}"

        # Presigned GET URL for inference (Cloud Run downloads from here)
        presigned = s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": bucket, "Key": key},
            ExpiresIn=3600,
        )

        # Call inference
        tags = _call_inference(presigned, file_type)

        # Generate thumbnail for images
        thumbnail_url = None
        if file_type == "image":
            obj = s3.get_object(Bucket=bucket, Key=key)
            thumb_bytes = _make_thumbnail(obj["Body"].read())
            thumb_key = f"thumbnails/{file_id}.jpg"
            s3.put_object(
                Bucket=BUCKET_NAME,
                Key=thumb_key,
                Body=thumb_bytes,
                ContentType="image/jpeg",
            )
            thumbnail_url = f"https://{BUCKET_NAME}.s3.amazonaws.com/{thumb_key}"

        # Update DynamoDB record created by upload Lambda
        update_expr = "SET file_url = :fu, file_type = :ft, tags = :t, uploaded_at = :ua"
        expr_values = {
            ":fu": file_url,
            ":ft": file_type,
            ":t":  tags,
            ":ua": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }

        if thumbnail_url:
            update_expr += ", thumbnail_url = :tu"
            expr_values[":tu"] = thumbnail_url

        table.update_item(
            Key={"file_id": file_id},
            UpdateExpression=update_expr,
            ExpressionAttributeValues=expr_values,
        )

        # SNS notification
        if tags:
            sns_client.publish(
                TopicArn=SNS_TOPIC_ARN,
                Message=f"New {file_type} uploaded with species: {', '.join(tags.keys())}",
                MessageAttributes={
                    "species": {
                        "DataType": "String.Array",
                        "StringValue": json.dumps(list(tags.keys())),
                    }
                },
            )

    return {"statusCode": 200, "body": json.dumps({"message": "ok"})}
