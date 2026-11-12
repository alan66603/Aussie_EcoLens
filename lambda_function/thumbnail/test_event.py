import json
import os
import sys

os.environ["BUCKET_NAME"]        = "ecolens-media-cloud-best-team"
os.environ["TABLE_NAME"]         = "ecolens-files"
os.environ["INFERENCE_URL"]      = "http://localhost:8080"  # local inference for testing
os.environ["SNS_TOPIC_ARN"]      = "arn:aws:sns:us-east-1:657082816446:ecolens-notifications"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"

sys.path.insert(0, os.path.dirname(__file__))
from handler import lambda_handler

event = {
    "Records": [
        {
            "s3": {
                "bucket": {"name": "ecolens-media-cloud-best-team"},
                "object": {"key": "original/11beecf3-ea28-4193-9801-c4ed8b6de033.mp4"},
            }
        }
    ]
}

result = lambda_handler(event, None)
print(f"Status: {result['statusCode']}")
print(json.dumps(json.loads(result["body"]), indent=2))
