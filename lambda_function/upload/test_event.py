import json
import os
import sys

os.environ["BUCKET_NAME"] = "ecolens-media-cloud-best-team"
os.environ["TABLE_NAME"]  = "ecolens-files"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"

sys.path.insert(0, os.path.dirname(__file__))
from handler import lambda_handler

event = {
    "body": json.dumps({
        "filename": "wombat.jpg",
        "contentType": "image/jpeg",
        "fileSize": 345678,
        "checksum": "testabc123deadbeef"
    })
}

result = lambda_handler(event, None)
print(f"Status: {result['statusCode']}")
print(json.dumps(json.loads(result["body"]), indent=2))