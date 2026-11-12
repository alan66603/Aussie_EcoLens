import json
import os
import uuid

import boto3

# DO NOT rename these variables or change the os.environ key names.
# They are injected by Terraform at deploy time.
# For local testing, set them as shell env vars before running:
#   export BUCKET_NAME=ecolens-media-cloud-best-team
BUCKET_NAME = os.environ["BUCKET_NAME"]

s3 = boto3.client("s3")


def lambda_handler(event, context):
    # POST /query/file/init
    # Request body: {"file_type": "image", "filename": "photo.jpg"}
    # Returns a presigned S3 upload URL. Frontend uploads the file directly to S3,
    # then calls POST /query/file with the returned s3_key.
    # Response: {"upload_url": "https://...", "s3_key": "tmp/abc123.jpg"}

    body         = json.loads(event["body"])
    file_type    = body.get("file_type", "image")
    filename     = body.get("filename", "file")
    content_type = body.get("content_type", "application/octet-stream")
    ext          = filename.rsplit(".", 1)[-1].lower() if "." in filename else "jpg"

    s3_key = f"tmp/{uuid.uuid4()}.{ext}"

    upload_url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": BUCKET_NAME, "Key": s3_key, "ContentType": content_type},
        ExpiresIn=300,
    )

    return {
        "statusCode": 200,
        "body": json.dumps({
            "upload_url": upload_url,
            "s3_key": s3_key,
            "file_type": file_type,
            "content_type": content_type,
        }),
    }
