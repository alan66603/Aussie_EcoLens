# Aussie EcoLens

Multi-cloud serverless wildlife observation platform (FIT5225 Assignment 2). Team 112

---

## API Integration Testing

An end-to-end test script is provided in `api_testing/test_api.py`. It covers all 15 API endpoints in sequence using a single image (and optionally a video).

### Prerequisites

- Python 3.9+
- A registered Cognito account (sign up via the frontend first)
- A test image (`.jpg` or `.png`) - wildlife photos produce better results since the ML model will detect species tags
- (Optional) A test video (`.mp4`)

### Setup

```bash
cd api_testing
python3 -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install requests boto3
```

Place your test image (and optional video) inside `api_testing/`:

```
api_testing/
  test_api.py
  your_image.jpg        <- put your image here
  your_video.mp4        <- optional
  venv/                 <- created by python3 -m venv
```

### Run

```bash
python3 test_api.py \
  --email your@email.com \
  --password YourPassword \
  --image ./your_image.jpg \
  --video ./your_video.mp4
```

The `--video` argument is optional. If omitted, only the image path is tested.

### What it tests

| # | Endpoint | What is verified |
|---|----------|-----------------|
| 1 | Auth | Cognito login, ID token received |
| 2 | POST /upload | Image upload, presigned URL, S3 PUT |
| 3 | POST /upload | Duplicate detection -> 409 |
| 4 | POST /upload | Video upload, S3 PUT |
| 5 | GET /show_process | Polls until inference completes (max 120 s) |
| 6 | GET /files | Results list, required fields present |
| 7 | GET /files/mine | Returns only owned files, `is_mine = true` |
| 8 | GET /tags | Returns non-empty tag list |
| 9 | POST /query/tags | AND query with min count, >= 1 result |
| 10 | POST /query/species | Species query, >= 1 result |
| 11 | POST /query/thumbnail | Thumbnail URL -> correct file record |
| 12 | POST /query/file/init + /query/file | Query-by-file, tmp file cleaned up automatically |
| 13 | POST /tags/modify | Add tag (operation=1), tag appears in record |
| 14 | POST /tags/modify | Remove tag (operation=0), tag no longer in record |
| 15 | POST /files/visibility | Toggle public/personal, then restore |
| 16 | POST /notify/subscribe | Subscribe email, filter policy set |
| 17 | POST /notify/unsubscribe | Unsubscribe, subscription removed |
| 18 | DELETE /files | Delete uploaded files, S3 + DynamoDB cleaned up |

Steps 9-11 are automatically skipped if the ML model returns no tags (e.g. the image has no detectable wildlife).

---

## Deployed Resources (Updated as infra is applied)

| Key | Value |
|-----|-------|
| **API Gateway URL** | `https://ugercq42f6.execute-api.us-east-1.amazonaws.com/` |
| **Cognito User Pool ID** | `us-east-1_z9tbqMpuu` |
| **Cognito Client ID** | `346ic6jl3fiu96igg5p1ri7i03` |
| **SNS Topic ARN** | `arn:aws:sns:us-east-1:657082816446:ecolens-notifications` |
| **S3 Bucket** | `ecolens-media-cloud-best-team` |
| **DynamoDB Table** | `ecolens-files` |
| **GCP Project ID** | `fit5225-ass2-496903` |
| **GCP Region** | `us-central1` |
| **Artifact Registry** | `us-central1-docker.pkg.dev/fit5225-ass2-496903/ecolens` |
| **Cognito Hosted UI** | `https://ecolens-best-team-work-ass2.auth.us-east-1.amazoncognito.com` |
| **Frontend URL** | `https://ecolens-frontend-mh6xjksdxq-uc.a.run.app` |
| **Inference URL** | `https://ecolens-inference-mh6xjksdxq-uc.a.run.app` |

### API Endpoints

Base URL: `https://ugercq42f6.execute-api.us-east-1.amazonaws.com`

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/upload` | fn-upload | Get presigned upload URL (checksum dedup) |
| POST | `/query/tags` | fn-query-tags | Find files by species + min count |
| POST | `/query/species` | fn-query-species | Find files containing a species |
| POST | `/query/thumbnail` | fn-query-thumbnail | Get full-size URL from thumbnail URL |
| POST | `/query/file/init` | fn-query-file-init | Get presigned upload URL for query file |
| POST | `/query/file` | fn-query-file | Run inference on uploaded file, return matches |
| POST | `/tags/modify` | fn-tags-modify | Add or remove tags on files |
| DELETE | `/files` | fn-delete | Delete files from S3 + DynamoDB |
| POST | `/notify/subscribe` | fn-notify-subscribe | Subscribe email to species notifications |
| POST | `/notify/unsubscribe` | fn-notify-unsubscribe | Unsubscribe email |
| GET | `/files` | fn-list-files | List all uploaded files with presigned URLs |
| GET | `/files/mine` | fn-list-mine | List only files owned by the current user |
| GET | `/tags` | fn-list-tags | List all unique tag names in the database |
| POST | `/files/visibility` | fn-set-visibility | Set a file's visibility (personal or public) |
| GET | `/show_process` | fn-show-process | Poll inference status for an uploaded file |

> `fn-thumbnail` is S3-triggered (not an API endpoint) - invoked automatically when a file is uploaded to `original/`.

---

## Project Structure

```
fit5225-assignment-2/
|
|-- cloudrun_function/                  # GCP Cloud Run services (Docker containers)
|   |-- frontend/                       # Jason: React frontend app
|   |   |-- Dockerfile                  # multi-stage: npm build -> nginx serves dist/
|   |
|   |-- inference/                      # Alan: ML inference service
|       |-- Dockerfile                  # Python Flask app container
|       |-- inference.py                # POST /predict endpoint - run ML model, return species counts
|       |-- requirements.txt            # Python dependencies (torch, opencv, flask, gcs client)
|
|-- lambda_function/                    # AWS Lambda functions (Python)
|   |-- upload/handler.py               # Alan:  POST /upload - checksum, S3 upload, ML tagging, DynamoDB write
|   |-- thumbnail/handler.py            # Alan:  triggered by S3 - generate image thumbnail with OpenCV
|   |-- show_process/handler.py         # Alan:  GET /process - poll inference status for uploaded file
|   |-- query_tags/handler.py           # Quan:  POST /query/tags - find files by species + min count (AND)
|   |-- query_species/handler.py        # Quan:  POST /query/species - find files containing a species
|   |-- query_thumbnail/handler.py      # Quan:  POST /query/thumbnail - get full-size URL from thumbnail URL
|   |-- query_file_init/handler.py      # Quan:  POST /query/file/init - return presigned S3 upload URL for tmp file
|   |-- query_file/handler.py           # Quan:  POST /query/file - run inference on tmp file, return matching files
|   |-- list_files/handler.py           # Quan:  GET /files - list all uploaded files with presigned URLs
|   |-- list_mine/handler.py            # Quan:  GET /files/mine - list files owned by current user
|   |-- list_tags/handler.py            # Quan:  GET /tags - list all unique tag names in the database
|   |-- set_visibility/handler.py       # Quan:  POST /files/visibility - set file personal/public visibility
|   |-- tags_modify/handler.py          # Jason: POST /tags/modify - bulk add/remove tags
|   |-- notify_subscribe/handler.py     # Jason: POST /notify/subscribe - subscribe email to SNS
|   |-- notify_unsubscribe/handler.py   # Jason: POST /notify/unsubscribe - unsubscribe email from SNS
|   |-- delete/handler.py               # Jason: DELETE /files - remove files from S3 + DynamoDB
|
|-- terraform/                          # Teddy: all infrastructure as code
|   |-- versions.tf                     # Terraform provider versions (AWS, GCP, archive)
|   |-- variables.tf                    # Input variable declarations
|   |-- terraform.tfvars                # Actual variable values (gitignored, fill in before apply)
|   |-- main.tf                         # Root module: wires foundation, cloudrun, lambda modules together
|   |-- outputs.tf                      # Output values printed after terraform apply
|   |-- modules/
|       |-- foundation/                 # AWS base: IAM roles, S3, DynamoDB, Cognito, API Gateway, SNS
|       |-- cloudrun/                   # GCP: Cloud Run inference + frontend services
|       |-- lambda/                     # AWS Lambda functions + layer + API Gateway routes
|
|-- .gitignore                          # Excludes terraform state, tfvars, zip files
|-- README.md                           # This file
```

---

## Work Allocation

| Person | Responsibilities |
|--------|-----------------|
| Teddy  | Infrastructure (AWS + GCP), Terraform, API Gateway, Cognito, SNS |
| Alan   | `fn-upload`, `fn-thumbnail`, `fn-show-process` |
| Quan   | `fn-query-tags`, `fn-query-species`, `fn-query-thumbnail`, `fn-query-file-init`, `fn-query-file`, `fn-list-files`, `fn-list-mine`, `fn-list-tags`, `fn-set-visibility` |
| Jason  | `fn-tags-modify`, `fn-notify-subscribe`, `fn-notify-unsubscribe`, `fn-delete`, Frontend |

---

## Quick Start - What Each Person Needs To Do

---

### Teddy (Infrastructure)

Infrastructure is split into 3 modules. Apply them in order as dependencies become available.

**Step 1 - Foundation (run now, no dependencies)**

Fill in `terraform/terraform.tfvars`:
- `gcp_project_id` - your GCP project ID
- `cognito_domain_prefix` - globally unique string (e.g. `ecolens-yourname`)

Then apply:
```bash
cd terraform
terraform init
terraform apply -target=module.foundation
```

Foundation already applied. Outputs:

| Key | Value |
|-----|-------|
| `api_gateway_url` | `https://ugercq42f6.execute-api.us-east-1.amazonaws.com/` |
| `cognito_user_pool_id` | `us-east-1_z9tbqMpuu` |
| `cognito_client_id` | `346ic6jl3fiu96igg5p1ri7i03` |
| `sns_topic_arn` | `arn:aws:sns:us-east-1:657082816446:ecolens-notifications` |

**Step 2 - Cloud Run (after Alan + Jason push Docker images)**

If both images are ready, deploy everything at once:
```bash
terraform apply -target=module.cloudrun
```

If only Jason's frontend image is ready (Alan not yet):
```bash
terraform apply -target=module.cloudrun.google_cloud_run_v2_service.frontend
terraform apply -target=module.cloudrun.google_cloud_run_v2_service_iam_member.frontend_public
```

If Jason re-pushes a new image with the same tag (e.g. `latest`), Terraform won't detect the change. Force re-deploy:
```bash
terraform apply -replace=module.cloudrun.google_cloud_run_v2_service.frontend -target=module.cloudrun.google_cloud_run_v2_service.frontend
terraform apply -replace=module.cloudrun.google_cloud_run_v2_service_iam_member.frontend_public -target=module.cloudrun.google_cloud_run_v2_service_iam_member.frontend_public
```

> **Note:** Do NOT run `terraform apply -target=module.cloudrun` while Alan's inference image is not ready - it will fail because `inference:latest` doesn't exist in Artifact Registry yet.

Once Alan's inference image is ready, deploy the rest:
```bash
terraform apply -target=module.cloudrun.google_cloud_run_v2_service.inference
terraform apply -target=module.cloudrun.google_cloud_run_v2_service_iam_member.inference_lambda_invoker
```

If Alan re-pushes a new image (e.g. model version update), force re-deploy:
```bash
terraform apply -replace=module.cloudrun.google_cloud_run_v2_service.inference -target=module.cloudrun.google_cloud_run_v2_service.inference
terraform apply -replace=module.cloudrun.google_cloud_run_v2_service_iam_member.inference_lambda_invoker -target=module.cloudrun.google_cloud_run_v2_service_iam_member.inference_lambda_invoker
```

Copy the `frontend_url` output into `terraform.tfvars`, then re-apply foundation to update the Cognito callback URL:
```bash
terraform apply -target=module.foundation
```

**Step 3 - Lambda (every time a teammate commits handler.py changes)**

```bash
terraform apply -target=module.lambda
```

**Check all outputs at any time:**
```bash
terraform output
```

**IAM Roles (managed in `terraform/modules/foundation/main.tf`)**

Each Lambda function has its own IAM role with minimum required permissions. See [AWS IAM Roles](#aws-iam-roles) for the full breakdown. Roles are created in Step 1 (foundation) and automatically assigned to functions in Step 3 (lambda).

If you add a new Lambda function, add its role in `foundation/main.tf`, export it in `foundation/outputs.tf`, and add the role key to `lambda/main.tf`.

---

### Alan (Inference + Lambda)

**Prerequisites:** Install [Docker](https://docs.docker.com/get-docker/) and [gcloud CLI](https://cloud.google.com/sdk/docs/install)

You have two separate areas to work on:

**Area 1 - GCP Inference service: `cloudrun_function/inference/`**

This is a Python Flask app that runs the ML model on GCP Cloud Run.
The placeholder is already set up. Edit `cloudrun_function/inference/inference.py`:
- Implement `POST /predict` to accept an image/video and return species counts
- Add any extra Python packages you need to `cloudrun_function/inference/requirements.txt`

**How Lambda sends files to `/predict`:**

The S3 bucket is private, so Lambda cannot pass a plain S3 URL. Instead, Lambda generates a **presigned URL** (a time-limited URL with AWS signature embedded) and passes it to Inference. Inference downloads the file directly using that URL - no AWS credentials needed.

Expected request body from Lambda:
```json
{
  "file_url": "https://ecolens-media-cloud-best-team.s3.amazonaws.com/original/abc.jpg?X-Amz-Signature=...&X-Amz-Expires=60",
  "file_type": "image"
}
```

Expected response:
```json
{"koala": 2, "wombat": 1}
```

Download the file in `/predict`:
```python
import requests, tempfile

def predict():
    data = request.get_json()
    image_url = data["image_url"]
    file_type  = data["file_type"]   # "image" or "video"

    with tempfile.NamedTemporaryFile() as tmp:
        tmp.write(requests.get(image_url).content)
        tmp.flush()
        # run your model on tmp.name
```

**Important - model loading from GCS:**

The model file is NOT bundled inside the Docker image. Instead, it is stored in GCS and downloaded at container startup. Reasons:
- The `.pt` file is large (hundreds of MB) - bundling it would make the image huge and slow to push
- Switching model versions only requires uploading a new `.pt` to GCS - no Docker rebuild needed

The GCS bucket is **private**. You do not need to handle authentication manually - the Cloud Run service runs under a Service Account (`ecolens-inference-sa`) that already has read access to the bucket. The `google-cloud-storage` SDK picks up credentials automatically when running inside Cloud Run.

Download both models at startup using:
```python
import os
from google.cloud import storage

MODEL_BUCKET       = os.environ["MODEL_BUCKET"]
DETECTOR_VERSION   = os.environ["DETECTOR_VERSION"]    # e.g. "v1"
CLASSIFIER_VERSION = os.environ["CLASSIFIER_VERSION"]  # e.g. "v3"

client = storage.Client()
bucket = client.bucket(MODEL_BUCKET)

bucket.blob(f"models/detector/mdv5a-{DETECTOR_VERSION}.pt").download_to_filename("/tmp/detector.pt")
bucket.blob(f"models/classifier/speciesnet-{CLASSIFIER_VERSION}.pt").download_to_filename("/tmp/classifier.pt")
# /tmp is the only writable path in a Cloud Run container
```
Then load `/tmp/detector.pt` and `/tmp/classifier.pt` with PyTorch as usual.

The env vars `MODEL_BUCKET`, `DETECTOR_VERSION`, and `CLASSIFIER_VERSION` are injected by Terraform.

**Updating a model version (no Docker rebuild needed):**

1. Upload the new `.pt` file to GCS at the versioned path:
```bash
# Example: upgrading detector to v2
gsutil cp /path/to/new_mdv5a.pt \
  gs://fit5225-ass2-496903-ecolens-models/models/detector/mdv5a-v2.pt

# Example: upgrading classifier to v2
gsutil cp /path/to/new_model.pt \
  gs://fit5225-ass2-496903-ecolens-models/models/classifier/speciesnet-v2.pt
```

2. Tell Teddy to update `terraform/terraform.tfvars`:
```
detector_version   = "v2"
classifier_version = "v2"
```

3. Teddy re-deploys Cloud Run:
```bash
terraform apply -replace=module.cloudrun.google_cloud_run_v2_service.inference \
  -target=module.cloudrun.google_cloud_run_v2_service.inference
```

Cloud Run will download the new model from GCS on the next cold start — no code changes required.

Once ready, build and push the Docker image.
Find your GCP project ID in the [GCP Console](https://console.cloud.google.com/) - it is shown in the top project selector dropdown.

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud auth configure-docker us-central1-docker.pkg.dev

docker build -t us-central1-docker.pkg.dev/<your-project-id>/ecolens/inference:latest ./cloudrun_function/inference
docker push us-central1-docker.pkg.dev/<your-project-id>/ecolens/inference:latest
```
Tell Teddy when done so he can run `terraform apply`.

**Area 2 - Lambda functions: `lambda_function/`**

Edit the following files (see [Lambda Function Reference](#lambda-function-reference) for what each one must do):
- `lambda_function/upload/handler.py`
- `lambda_function/thumbnail/handler.py`
- `lambda_function/show_process/handler.py`

**DynamoDB schema - follow this exactly when reading/writing:**
```
file_id       (String, PK) - auto-generated UUID for the record
checksum      (String)     - SHA256 checksum of the file
file_url      (String)     - S3 URL of the original file
thumbnail_url (String)     - S3 URL of the thumbnail (images only)
file_type     (String)     - "image" or "video"
tags          (Map)        - species counts e.g. {"koala": 2, "wombat": 1}
uploaded_at   (String)     - ISO 8601 timestamp e.g. "2026-05-14T10:30:00Z"
owner         (String)     - Cognito sub of the user who uploaded the file
isPersonal    (Boolean)    - true = only owner can edit tags; false = all users can edit tags
```
Do not add or rename fields. DynamoDB has no schema enforcement - wrong field names will silently store garbage.

**upload calls inference - use this pattern:**

The inference Cloud Run is private. Lambda authenticates using a GCP service account key stored in AWS Secrets Manager.

```python
import os, json, boto3, requests
import google.auth.transport.requests
from google.oauth2 import service_account

INFERENCE_URL     = os.environ["INFERENCE_URL"]
GCP_SA_SECRET_ARN = os.environ["GCP_SA_SECRET_ARN"]

def get_inference_token():
    secret = boto3.client("secretsmanager").get_secret_value(SecretId=GCP_SA_SECRET_ARN)
    sa_info = json.loads(secret["SecretString"])
    credentials = service_account.IDTokenCredentials.from_service_account_info(
        sa_info, target_audience=INFERENCE_URL
    )
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials.token

def call_inference(presigned_url, file_type):
    token = get_inference_token()
    response = requests.post(
        INFERENCE_URL + "/predict",
        headers={"Authorization": f"Bearer {token}"},
        json={"file_url": presigned_url, "file_type": file_type}
    )
    return response.json()  # {"koala": 2, "wombat": 1}
```

`google-auth` and `requests` are pre-installed via the shared Lambda Layer - no `requirements.txt` needed.

Commit and push. Tell Teddy to run `terraform apply` to deploy.

---

### Jason (Frontend + Lambda)

**Prerequisites:** Install [Docker](https://docs.docker.com/get-docker/) and [gcloud CLI](https://cloud.google.com/sdk/docs/install)

Jason is responsible for the React frontend and the following Lambda functions:

- `lambda_function/tags_modify/handler.py`
- `lambda_function/notify_subscribe/handler.py`
- `lambda_function/notify_unsubscribe/handler.py`
- `lambda_function/delete/handler.py`

---

## Area 1 - Frontend: `cloudrun_function/frontend/`

This is a React app served by nginx on GCP Cloud Run.

The `Dockerfile` uses a multi-stage build: `npm run build` compiles the app, then nginx serves the `dist/` output.

API Gateway URL:

```js
const API_URL = "https://ugercq42f6.execute-api.us-east-1.amazonaws.com"
```

### Authentication

The frontend uses AWS Cognito Hosted UI for sign in and sign up.

After login:

- the Cognito ID token is used to access protected API Gateway endpoints
- authenticated API requests include:

```http
Authorization: Bearer <id_token>
```

The top-right user box displays the authenticated user's name, email, and session status.

---

### File size limits

Both upload and query-by-file use presigned URLs, so the media file is uploaded directly to S3 and does not pass through Lambda or API Gateway.

Frontend UI limit:

- maximum file size: 50 MB

Supported formats:

- `.jpg`
- `.jpeg`
- `.png`
- `.mp4`

---

### Upload flow

The upload API does not accept the raw file. This avoids the Lambda/API Gateway payload limit.

Flow:

1. User selects a `.jpg`, `.jpeg`, `.png`, or `.mp4` file.
2. Frontend validates file type and file size.
3. Frontend computes SHA-256 checksum in the browser.
4. Frontend calls `POST /upload` with filename, content type, and checksum.
5. Lambda returns a presigned S3 upload URL and `file_id`.
6. Frontend uploads the file bytes directly to S3 using the presigned URL.
7. Frontend polls `GET /show_process?file_id=<uuid>` until inference is complete.
8. Frontend displays a processed result card with preview, file ID, and detected tags.

Computing SHA-256 in the browser:

```js
async function sha256(file) {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer)

  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}
```

Calling upload and uploading to S3:

```js
const idToken = /* get ID token from Cognito */
const checksum = await sha256(file)

const data = await fetch(`${API_URL}/upload`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${idToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    filename: file.name,
    contentType: file.type,
    checksum
  })
}).then((r) => r.json())

const presignedUrl = data.presigned_url
const fileId = data.file_id

// PUT directly to S3 - do not add Authorization header
await fetch(presignedUrl, {
  method: "PUT",
  headers: {
    "Content-Type": file.type
  },
  body: file
})
```

Important:

- The S3 `PUT` request must not include the Cognito `Authorization` header.
- The presigned URL already contains temporary upload permission.
- If the upload API returns `409`, the frontend displays a duplicate-file message.

---

### Upload inference result polling

After uploading to S3, the frontend polls:

```http
GET /show_process?file_id=<uuid>
```

Expected behaviour:

- `202`: inference is still processing
- `200`: inference result is ready
- `404`: record not found yet, frontend can continue polling briefly
- other errors: frontend displays an error message

When ready, the frontend displays:

- image thumbnail or video preview
- file ID
- detected tags and counts
- full media link
- copyable file URL for delete
- copyable thumbnail URL for thumbnail query

---

### Query-by-file flow

The query-by-file feature searches by uploading a temporary image or video.

The selected query file does not go through Lambda. It is uploaded directly to S3 using a presigned URL.

Flow:

1. Call `POST /query/file/init` with filename, file type, and content type.
2. Receive `upload_url` or `presigned_url`, plus `s3_key`.
3. PUT the query file directly to the presigned URL.
4. Call `POST /query/file` with the `s3_key` and `file_type`.
5. Backend runs inference and returns matching media results.

Example request to initialise query upload:

```json
{
  "filename": "photo.jpg",
  "file_type": "image",
  "content_type": "image/jpeg"
}
```

Example request to run query:

```json
{
  "s3_key": "tmp/query-file.jpg",
  "file_type": "image"
}
```

The `s3_key` identifies the temporary uploaded file so the backend can run inference and matching.

---

### Query features

The Query Files page supports:

- search by tag counts
- search by species/tag name
- search by thumbnail URL
- search by temporary uploaded image/video

Query results can be selected and sent to:

- Manage Tags
- Delete Files

---

### Dynamic tag autocomplete

The frontend uses `GET /tags` to load the current database tag list for autocomplete.

This dynamic tag list is used in:

- Query Files
- Manage Tags
- Notifications

Rules:

- Query Files only allow existing tags from the current database tag list.
- Notifications only allow existing tags from the current database tag list.
- Manage Tags allows users to select an existing tag or manually add a new valid tag.

After a successful `POST /tags/modify`, the frontend refreshes `GET /tags` so newly added tags appear in future autocomplete suggestions.

Frontend tag validation:

- maximum 30 characters
- English letters only
- spaces allowed
- hyphens allowed
- underscores allowed
- numbers and special characters are not allowed

---

### Manage Tags frontend

The Manage Tags page supports independent per-file bulk editing.

Users can:

- select files from Query Results or Browse All
- edit each selected file separately
- add or update tag counts
- remove selected tags from a file
- submit all selected file updates together

Each selected file has its own editor. This means different files can receive different tag changes in one bulk submit action.

---

### Browse All frontend

The Browse All page lists uploaded media from `GET /files`.

Users can:

- view uploaded media
- select one or more files
- send selected files to Manage Tags
- send selected files to Delete Files

---

### Delete frontend

The Delete page accepts one or more file URLs.

It supports:

- actual S3 file URLs
- presigned S3 URLs
- URLs copied from Query Results or Upload Result cards

The frontend sends selected URLs to:

```http
DELETE /files
```

---

### Notification frontend

The Notification page allows users to:

- subscribe an email address to one or more existing tags
- unsubscribe an email address from SNS notifications

Notification tag input uses the dynamic database tag list from `GET /tags`.

Notifications are only created for tags that already exist in the media library.

---

### Build and push frontend image

```bash
gcloud auth login
gcloud config set project <your-project-id>
gcloud auth configure-docker us-central1-docker.pkg.dev

docker build -t us-central1-docker.pkg.dev/<your-project-id>/ecolens/frontend:latest ./cloudrun_function/frontend
docker push us-central1-docker.pkg.dev/<your-project-id>/ecolens/frontend:latest
```

Tell Teddy when done so he can run `terraform apply`.

---

## Area 2 - Lambda functions: `lambda_function/`

Edit the following files:

- `lambda_function/tags_modify/handler.py`
- `lambda_function/notify_subscribe/handler.py`
- `lambda_function/notify_unsubscribe/handler.py`
- `lambda_function/delete/handler.py`

### DynamoDB schema used by Jason functions

```text
file_id       (String, PK)  - unique file identifier
file_url      (String)      - original media S3 URL
thumbnail_url (String)      - generated thumbnail URL for images
file_type     (String)      - image or video
tags          (Map)         - tag counts, e.g. {"domestic dog": 2, "red fox": 1}
owner         (String)      - Cognito sub of the user who uploaded the file
isPersonal    (Boolean)     - true = only owner can edit tags; false = all users can edit tags
```

`tags_modify` reads `isPersonal` to determine edit permission; only updates the `tags` field.  
`delete` removes the original file, thumbnail if applicable, and DynamoDB record.

Commit and push changes. Tell Teddy to run `terraform apply` to deploy updated Lambda functions.

---

### Quan (Query Lambda functions)

No Docker or GCP setup needed. Just write Python code and commit.

Edit the following files (see [Lambda Function Reference](#lambda-function-reference) for details):
- `lambda_function/query_tags/handler.py`
- `lambda_function/query_species/handler.py`
- `lambda_function/query_thumbnail/handler.py`
- `lambda_function/query_file_init/handler.py`
- `lambda_function/query_file/handler.py`
- `lambda_function/list_files/handler.py`

**DynamoDB schema - read-only, these are the fields you will query against:**
```
file_id       (String, PK) - auto-generated UUID
checksum      (String)     - SHA256 checksum of the file
file_url      (String)     - S3 URL of the original file
thumbnail_url (String)     - S3 URL of the thumbnail (images only)
file_type     (String)     - "image" or "video"
tags          (Map)        - species counts e.g. {"koala": 2, "wombat": 1}
uploaded_at   (String)     - ISO 8601 timestamp
owner         (String)     - Cognito sub of the user who uploaded the file
isPersonal    (Boolean)    - true = only owner can edit tags; false = all users can edit tags
```
Your functions only read from DynamoDB. Use `file_type` to decide whether to return `thumbnail_url` (images) or `file_url` (videos).

**Important - all returned URLs must be presigned:**

The S3 bucket is private. The `file_url` and `thumbnail_url` stored in DynamoDB are plain `s3://` or HTTPS S3 URLs - the frontend cannot open them directly. Before including any URL in your response, convert it to a presigned download URL:

```python
import os, boto3

s3 = boto3.client("s3")
BUCKET_NAME = os.environ["BUCKET_NAME"]

def to_presigned_url(s3_url, expires=3600):
    # Extract the key from URLs like:
    # https://ecolens-media-cloud-best-team.s3.amazonaws.com/original/abc.jpg
    key = s3_url.split(f"{BUCKET_NAME}.s3.amazonaws.com/")[1]
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": BUCKET_NAME, "Key": key},
        ExpiresIn=expires
    )
```

Apply `to_presigned_url()` to every URL before putting it in the response. This applies to: `query_tags`, `query_species`, `query_thumbnail`, `query_file`.

**query_file calls inference - use this pattern:**

The inference Cloud Run is private (not public). Lambda uses a GCP service account key (stored in AWS Secrets Manager) to generate a Google ID token before calling `/predict`.

```python
import os, json, boto3, requests
import google.auth.transport.requests
from google.oauth2 import service_account

INFERENCE_URL     = os.environ["INFERENCE_URL"]
GCP_SA_SECRET_ARN = os.environ["GCP_SA_SECRET_ARN"]

def get_inference_token():
    secret = boto3.client("secretsmanager").get_secret_value(SecretId=GCP_SA_SECRET_ARN)
    sa_info = json.loads(secret["SecretString"])
    credentials = service_account.IDTokenCredentials.from_service_account_info(
        sa_info, target_audience=INFERENCE_URL
    )
    credentials.refresh(google.auth.transport.requests.Request())
    return credentials.token

def call_inference(presigned_url, file_type):
    token = get_inference_token()
    response = requests.post(
        INFERENCE_URL + "/predict",
        headers={"Authorization": f"Bearer {token}"},
        json={"file_url": presigned_url, "file_type": file_type}
    )
    return response.json()  # {"koala": 2, "wombat": 1}
```

`google-auth` and `requests` are pre-installed via the shared Lambda Layer - no `requirements.txt` needed.

Commit and push. Tell Teddy to run `terraform apply` to deploy.

---

## How to Contribute Code (Lambda Functions)

You do **not** need to touch Terraform. Just write your Python code and commit.

### Workflow

1. Find your Lambda function directory under `lambda_function/`
2. Edit `handler.py` - implement the `lambda_handler` function
3. If you need extra Python packages (e.g. `opencv-python`), create a `requirements.txt` in the same directory
4. Commit and push to the repo
5. Tell Teddy - he will run `terraform apply` to deploy

### Deployment

```
lambda_function/<name>/handler.py        <- your code goes here
lambda_function/<name>/requirements.txt  <- optional, add if you need extra packages
```

Terraform zips the entire directory and uploads it to AWS Lambda automatically.

### Pre-installed packages (Lambda Layer)

The following packages are pre-installed in a shared Lambda Layer and available to all functions - **do not add these to `requirements.txt`**:

- `google-auth` - GCP service account authentication (for calling inference)
- `requests` - HTTP client

Terraform builds the layer automatically at apply time (`pip install` runs before zipping). The `lambda_layer/python/` directory is gitignored - you will never see or commit these packages.

---

## Environment Variables

Every Lambda function has access to these env vars at runtime. Read them with `os.environ["KEY"]`.

| Variable | Value | Available to |
|----------|-------|-------------|
| `BUCKET_NAME` | `ecolens-media-cloud-best-team` | upload, thumbnail, delete |
| `TABLE_NAME` | `ecolens-files` | all query functions, upload, thumbnail, delete, tags_modify, show_process |
| `INFERENCE_URL` | GCP Cloud Run inference URL | thumbnail, query_file |
| `SNS_TOPIC_ARN` | AWS SNS topic ARN | thumbnail, notify_subscribe, notify_unsubscribe |
| `GCP_SA_SECRET_ARN` | AWS Secrets Manager ARN storing GCP service account key | thumbnail, query_file |

Example usage in your handler:

```python
import os
BUCKET_NAME = os.environ["BUCKET_NAME"]
TABLE_NAME  = os.environ["TABLE_NAME"]
```

---

## Lambda Function Reference

### Alan

#### `lambda_function/upload/handler.py` - POST /upload

1. Receive `{ "checksum": "<sha256>", "filename": "photo.jpg" }` from frontend
2. Scan DynamoDB for a record with matching `checksum` - if found, return 409 (duplicate)
3. Generate `file_id = str(uuid.uuid4())`
4. Generate a presigned **upload** URL for `original/<file_id>.<ext>` (ExpiresIn=300)
5. Return `{ "presigned_url": "...", "file_id": "<file_id>" }` to frontend
6. Frontend uploads file directly to S3 using the presigned URL
7. S3 triggers `fn-thumbnail` automatically

#### `lambda_function/thumbnail/handler.py` - triggered by S3

Handles everything after the file lands in S3:

1. Triggered when a new object is created under `original/`
2. Download the file from S3
3. Generate thumbnail with Pillow (resize to max 200px, save as JPEG), upload to `thumbnails/<file_id>.jpg`
4. Generate presigned download URL for the original file, call `INFERENCE_URL` to get tags
5. Write full record to DynamoDB: `file_id`, `checksum`, `file_url`, `thumbnail_url`, `file_type`, `tags`, `uploaded_at`

#### `lambda_function/show_process/handler.py` - GET /show_process

Frontend polls this after upload to check if inference is complete.

- Query parameter: `file_id=<uuid>`
- Get item from DynamoDB by `file_id`
- If `tags` not present: return 202 `{"status": "processing"}`
- If not found: return 404 `{"error": "file not found"}`
- Otherwise return 200 `{"status": "ready", "file_id": ..., "file_type": ..., "tags": {...}, "display_url": ..., "file_url": ..., "thumbnail_url": ...}`
- For images: `display_url` = `thumbnail_url`; for videos: `display_url` = `file_url`

---

### Quan

#### `lambda_function/query_tags/handler.py` - POST /query/tags
- Request body: `{ "koala": 3, "wombat": 2 }`
- AND logic: return files where **every** tag meets the minimum count
- Returns: `{ "results": [{ "file_id", "file_type", "display_url", "file_url", "tags" }, ...] }` (all URLs presigned)

#### `lambda_function/query_species/handler.py` - POST /query/species
- Request body: `{ "species": "dingo" }`
- Return all files containing at least 1 of the specified species
- Returns: `{ "results": [{ "file_id", "file_type", "display_url", "file_url", "tags" }, ...] }` (all URLs presigned)

#### `lambda_function/query_thumbnail/handler.py` - POST /query/thumbnail
- Request body: `{ "thumbnail_url": "https://..." }` (may be a presigned URL - query params are stripped before matching)
- Look up DynamoDB by matching on `thumbnail_url`, return the matching file record
- Returns: `{ "file_id", "file_type", "display_url", "file_url", "tags" }` (all URLs presigned)

#### `lambda_function/query_file_init/handler.py` - POST /query/file/init

Step 1 of the query-by-file flow. File is uploaded to `tmp/` (not `original/`) so it does **not** trigger `fn-thumbnail`.

- Request body: `{ "file_type": "image", "filename": "photo.jpg" }`
- Generate a presigned **upload** URL for `tmp/<uuid>.<ext>` (ExpiresIn=300)
- Returns: `{ "upload_url": "...", "s3_key": "tmp/abc123.jpg", "file_type": "image" }`
- Frontend then PUTs the file to `upload_url`, then calls `POST /query/file` with the returned `s3_key`

#### `lambda_function/query_file/handler.py` - POST /query/file

Step 2 of the query-by-file flow.

- Request body: `{ "s3_key": "tmp/abc123.jpg", "file_type": "image" }`
- Generate presigned download URL for `s3_key`, POST to `INFERENCE_URL` to get detected tags
- Query DynamoDB for files matching those tags (AND logic, same as `query_tags`)
- Delete `s3_key` from S3 after inference (cleanup)
- Returns: `{ "results": [{ "file_id", "file_type", "display_url", "file_url", "tags" }, ...] }` (all URLs presigned)

#### `lambda_function/list_files/handler.py` - GET /files

- No request body
- Scan all records from DynamoDB
- For images: `display_url` = presigned `thumbnail_url` (fallback to `file_url` if thumbnail missing)
- For videos: `display_url` = presigned `file_url`
- Both image and video also include `file_url` = presigned original file URL
- Returns: `{ "results": [{ "file_id", "file_type", "display_url", "file_url", "tags" }, ...] }`

#### `lambda_function/list_mine/handler.py` - GET /files/mine

- Requires JWT authorisation; extracts the caller's Cognito `sub` from `requestContext.authorizer.jwt.claims.sub`
- Scan all records from DynamoDB, return only records where `owner` matches the caller's `sub`
- Same URL presigning and `display_url` logic as `list_files`
- Returns: `{ "results": [{ "file_id", "file_type", "display_url", "file_url", "tags", "owner", "isPersonal", "is_mine", "can_edit" }, ...] }`

#### `lambda_function/list_tags/handler.py` - GET /tags

- No request body
- Scan all records from DynamoDB, collect all keys from each record's `tags` map
- Return the deduplicated, sorted list of tag names
- Returns: `{ "tags": ["domestic dog", "koala", "wombat", ...] }`
- Used by the frontend for autocomplete in Query Files, Manage Tags, and Notifications

#### `lambda_function/set_visibility/handler.py` - POST /files/visibility

- Requires JWT authorisation; extracts the caller's Cognito `sub`
- Request body: `{ "file_id": "uuid", "isPersonal": true }`
- Get item from DynamoDB by `file_id`; verify the caller is the `owner` (return 403 if not)
- Update `isPersonal` field for the record
- Returns: `{ "message": "Visibility updated.", "file_id": "...", "isPersonal": true }`

---

### Jason

#### `lambda_function/tags_modify/handler.py` - POST `/tags/modify`

Adds, updates, or removes tags for selected files.

Primary request format: independent per-file updates.

```json
{
  "updates": [
    {
      "file_id": "uuid-1",
      "tags": {
        "domestic dog": 2,
        "red fox": 1
      },
      "operation": 1
    },
    {
      "file_id": "uuid-2",
      "tags": {
        "common wombat": 1
      },
      "operation": 0
    }
  ]
}
```

Operation values:

- `operation = 1`: add or update tag counts
- `operation = 0`: remove selected tags from the file

Behaviour:

- Each file can have different tag changes in the same request.
- `file_id` lookup is the preferred workflow.
- Legacy `file_ids` and `urls` bulk formats are still supported for compatibility.
- URL-based lookup is preserved for older workflows.
- Tag names are normalised to lowercase before saving.
- Only the `tags` field is updated.

Tag validation:

- maximum 30 characters
- English letters only
- spaces allowed
- hyphens allowed
- underscores allowed
- count must be a positive whole number

Example response:

```json
{
  "message": "per-file tag modification completed",
  "mode": "independent",
  "results": [
    {
      "identifier": "uuid-1",
      "file_id": "uuid-1",
      "status": "updated",
      "operation": 1,
      "tags": {
        "domestic dog": 2,
        "red fox": 1
      }
    }
  ]
}
```

#### `lambda_function/notify_subscribe/handler.py` - POST `/notify/subscribe`

Subscribes an email address to tag-based SNS notifications.

Request body:

```json
{
  "email": "user@example.com",
  "tags": ["domestic dog", "red fox"]
}
```

Behaviour:

- validates email format
- normalises tags to lowercase
- removes duplicate tags
- validates tag names using English letters, spaces, hyphens, and underscores
- checks if the email already has a confirmed subscription on the SNS topic
  - **if yes**: updates the filter policy with the new tags (replaces old tags)
  - **if no**: creates a new subscription; user must confirm via email before notifications are delivered

SNS filter policy format:

```json
{
  "species": ["domestic dog", "red fox"]
}
```

Example response (new subscription):

```json
{
  "message": "Subscription request created. Please confirm the subscription from your email inbox.",
  "email": "user@example.com",
  "tags": ["domestic dog", "red fox"],
  "subscription_arn": "..."
}
```

Example response (existing subscription updated):

```json
{
  "message": "Subscription updated with new tags.",
  "email": "user@example.com",
  "tags": ["domestic dog", "red fox"],
  "subscription_arn": "..."
}
```

Note: re-subscribing replaces the previous tag list entirely. To cancel all notifications, click the Unsubscribe link in any SNS email or call `POST /notify/unsubscribe`.

#### `lambda_function/notify_unsubscribe/handler.py` - POST `/notify/unsubscribe`

Unsubscribes an email address from SNS notifications.

Request body:

```json
{
  "email": "user@example.com"
}
```

Behaviour:

- validates email format
- finds matching subscriptions using `sns.list_subscriptions_by_topic()`
- calls `sns.unsubscribe()` for confirmed subscriptions
- returns pending confirmation subscriptions separately

Example response:

```json
{
  "message": "Unsubscribe request completed.",
  "email": "user@example.com",
  "removed": [
    {
      "email": "user@example.com",
      "subscription_arn": "...",
      "status": "unsubscribed"
    }
  ],
  "pending": [
    {
      "email": "user@example.com",
      "status": "pending_confirmation",
      "message": "This email has not confirmed the SNS subscription yet, so it cannot be unsubscribed by ARN from this endpoint."
    }
  ]
}
```

If the email has no subscription, the endpoint returns:

```json
{
  "message": "No subscription found for this email.",
  "email": "user@example.com"
}
```

#### `lambda_function/delete/handler.py` - DELETE `/files`

Deletes selected files from S3 and DynamoDB.

Request body:

```json
{
  "urls": ["https://..."]
}
```

Accepted URL formats:

- plain S3 URLs
- presigned S3 URLs
- virtual-hosted style URLs
- path-style URLs
- regional S3 URLs
- non-regional S3 URLs

Behaviour:

- strips query parameters from presigned URLs
- converts accepted S3 URL formats into canonical form
- matches DynamoDB records by `file_url` or `thumbnail_url`
- falls back to S3 object key matching when URL host formats differ
- deletes the original media object from S3
- deletes the thumbnail object from S3 for images
- deletes the DynamoDB record by `file_id`

Example response:

```json
{
  "message": "Delete request completed.",
  "results": [
    {
      "url": "https://...",
      "status": "deleted",
      "file_id": "uuid-1",
      "file_type": "image",
      "deleted_keys": [
        "original/uuid-1.jpg",
        "thumbnails/uuid-1.jpg"
      ],
      "message": "File, thumbnail if applicable, and database record deleted."
    }
  ]
}
```

> **How tag-based notifications work end-to-end:**
> 1. User subscribes with selected tags:
>    ```json
>    {
>      "email": "user@example.com",
>      "tags": ["domestic dog"]
>    }
>    ```
> 2. `fn-notify-subscribe` creates an SNS email subscription with filter policy:
>    ```json
>    {
>      "species": ["domestic dog"]
>    }
>    ```
> 3. When a file is uploaded and inference is complete, the upload/inference pipeline publishes an SNS message with species message attributes.
> 4. SNS automatically delivers the notification only to subscriptions whose filter policy matches the detected species.

---

## GCP

### Infrastructure (managed by Teddy via Terraform)

| Resource | Name | Purpose |
|----------|------|---------|
| Cloud Run | `ecolens-inference` | ML model inference service (called by Lambda) |
| Cloud Run | `ecolens-frontend` | Frontend web hosting |
| GCS Bucket | `<project-id>-ecolens-models` | ML model file storage |
| Artifact Registry | `ecolens` | Docker image registry |
| Service Account | `ecolens-inference-sa` | Cloud Run inference identity (read-only GCS access) |

### GCP Environment Variables (inference Cloud Run)

| Variable | Description |
|----------|-------------|
| `MODEL_BUCKET` | GCS bucket name containing the model files |
| `DETECTOR_VERSION` | Detector model version to load, e.g. `v1` |
| `CLASSIFIER_VERSION` | Classifier model version to load, e.g. `v3` |

Model file path conventions:
- `gs://<MODEL_BUCKET>/models/detector/mdv5a-<DETECTOR_VERSION>.pt`
- `gs://<MODEL_BUCKET>/models/classifier/speciesnet-<CLASSIFIER_VERSION>.pt`

To update a model version without touching code, Teddy changes `detector_version` or `classifier_version` in `terraform/terraform.tfvars` and runs `terraform apply`.

### GCP Infrastructure Reference

| Resource | Name | Managed by |
|----------|------|-----------|
| Cloud Run | `ecolens-inference` | Alan's code in `cloudrun_function/inference/` |
| Cloud Run | `ecolens-frontend` | Jason's code in `cloudrun_function/frontend/` |
| GCS Bucket | `<project-id>-ecolens-models` | Alan uploads model files here |
| Artifact Registry | `ecolens` | Docker images for both services |

Model path conventions in GCS:
- `models/detector/mdv5a-<DETECTOR_VERSION>.pt`
- `models/classifier/speciesnet-<CLASSIFIER_VERSION>.pt`

To switch model version, Teddy updates `detector_version` or `classifier_version` in `terraform.tfvars` and runs `terraform apply`.

---

## AWS IAM Roles

Each Lambda function is assigned a dedicated IAM role with the minimum permissions it actually needs (Principle of Least Privilege). No function has access to services or S3 prefixes it does not use.

| Role | Assigned to | DynamoDB | S3 | Other |
|------|------------|----------|----|-------|
| `ecolens-lambda-read-query` | fn-query-tags, fn-query-species, fn-query-thumbnail, fn-list-files, fn-list-mine, fn-list-tags, fn-show-process | GetItem, Scan, Query | GetObject on `original/*`, `thumbnails/*` | - |
| `ecolens-lambda-upload` | fn-upload | PutItem, Scan | PutObject on `original/*` | - |
| `ecolens-lambda-thumbnail` | fn-thumbnail | UpdateItem | GetObject on `original/*`; PutObject on `thumbnails/*` | SNS: Publish; Secrets Manager: GetSecretValue |
| `ecolens-lambda-query-file` | fn-query-file-init, fn-query-file | Scan | GetObject/PutObject/DeleteObject on `tmp/*`; GetObject on `original/*`, `thumbnails/*` | Secrets Manager: GetSecretValue |
| `ecolens-lambda-tags-modify` | fn-tags-modify, fn-set-visibility | GetItem, UpdateItem | - | - |
| `ecolens-lambda-notify` | fn-notify-subscribe, fn-notify-unsubscribe | - | - | SNS: Subscribe, Unsubscribe, ListSubscriptionsByTopic, SetSubscriptionAttributes, GetSubscriptionAttributes |
| `ecolens-lambda-delete` | fn-delete | GetItem, DeleteItem, Scan | DeleteObject on `original/*`, `thumbnails/*` | - |

**Notes:**
- Secrets Manager access is restricted to `ecolens-gcp-sa-key` only, and only granted to functions that call the GCP inference service (`fn-thumbnail`, `fn-query-file`)
- SNS Publish and SNS Subscribe are deliberately separated - `fn-thumbnail` can only publish notifications; notify functions can only manage subscriptions
- `fn-tags-modify` has no S3 access at all - it only touches the DynamoDB `tags` field
- S3 permissions are scoped to specific key prefixes (`original/`, `thumbnails/`, `tmp/`) rather than the whole bucket

---

## DynamoDB Schema

Table name: `ecolens-files`

| Attribute | Type | Description |
|-----------|------|-------------|
| `file_id` | String (PK) | Auto-generated UUID for the record |
| `checksum` | String | SHA256 checksum of the file (used for duplicate detection) |
| `file_url` | String | S3 URL of the original file |
| `thumbnail_url` | String | S3 URL of the thumbnail (images only) |
| `file_type` | String | `"image"` or `"video"` |
| `tags` | Map | Detected species with counts e.g. `{ "koala": 2 }` |
| `uploaded_at` | String | ISO 8601 timestamp |
| `owner` | String | Cognito `sub` of the user who uploaded the file |
| `isPersonal` | Boolean | `true` = only visible to owner; `false` = visible to all |

---

## S3 Bucket Structure

Bucket name: `ecolens-media-cloud-best-team`

```
ecolens-media/
  original/   <- uploaded files (images + videos)
  thumbnails/ <- generated thumbnails (images only)
  tmp/        <- temporary files for query-by-file (deleted after inference)
```
