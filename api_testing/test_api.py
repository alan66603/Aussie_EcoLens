#!/usr/bin/env python3
"""
EcoLens API Integration Test Suite
Tests all 15 API endpoints end-to-end.

Requirements:
    pip install requests boto3

Usage:
    python test_api.py --email user@example.com --password YourPass1 --image ./test.jpg
    python test_api.py --email user@example.com --password YourPass1 --image ./test.jpg --video ./test.mp4
"""

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path

import boto3
import requests

# ── Config ───────────────────────────────────────────────────────────────────
API_BASE       = "https://ugercq42f6.execute-api.us-east-1.amazonaws.com"
COGNITO_POOL   = "us-east-1_z9tbqMpuu"
COGNITO_CLIENT = "346ic6jl3fiu96igg5p1ri7i03"
AWS_REGION     = "us-east-1"
NOTIFY_EMAIL   = None   # set to args.email at runtime

# ── Colour helpers ────────────────────────────────────────────────────────────
GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
RESET  = "\033[0m"
PASS_ICON = f"{GREEN}✓{RESET}"
FAIL_ICON = f"{RED}✗{RESET}"
SKIP_ICON = f"{YELLOW}-{RESET}"

_results: list[tuple[str, str]] = []


def check(name: str, condition: bool, detail: str = "") -> bool:
    icon   = PASS_ICON if condition else FAIL_ICON
    status = "PASS"    if condition else "FAIL"
    suffix = f"  ({detail})" if detail else ""
    print(f"  {icon} {name}{suffix}")
    _results.append((name, status))
    return condition


def section(title: str) -> None:
    print(f"\n{'─' * 62}")
    print(f"  {title}")
    print(f"{'─' * 62}")


def skip(name: str, reason: str = "") -> None:
    suffix = f"  ({reason})" if reason else ""
    print(f"  {SKIP_ICON} {name}{suffix}")


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def api(method: str, path: str, token: str | None = None, **kwargs):
    headers = kwargs.pop("headers", {})
    if token:
        headers["Authorization"] = f"Bearer {token}"
    headers.setdefault("Content-Type", "application/json")
    return getattr(requests, method)(API_BASE + path, headers=headers, **kwargs)


# ── Cognito auth ──────────────────────────────────────────────────────────────
def get_token(email: str, password: str) -> str:
    cognito = boto3.client("cognito-idp", region_name=AWS_REGION)
    resp = cognito.initiate_auth(
        AuthFlow="USER_PASSWORD_AUTH",
        AuthParameters={"USERNAME": email, "PASSWORD": password},
        ClientId=COGNITO_CLIENT,
    )
    return resp["AuthenticationResult"]["IdToken"]


# ── Main ──────────────────────────────────────────────────────────────────────
def main() -> None:
    parser = argparse.ArgumentParser(description="EcoLens end-to-end API tests")
    parser.add_argument("--email",    required=True, help="Cognito test-user email")
    parser.add_argument("--password", required=True, help="Cognito test-user password")
    parser.add_argument("--image",    required=True, help="Path to a test image (.jpg / .png)")
    parser.add_argument("--video",    default=None,  help="Path to a test video (.mp4) [optional]")
    args = parser.parse_args()

    image_path = Path(args.image)
    video_path = Path(args.video) if args.video else None

    if not image_path.exists():
        print(f"ERROR: image file not found: {image_path}")
        sys.exit(1)
    if video_path and not video_path.exists():
        print(f"ERROR: video file not found: {video_path}")
        sys.exit(1)

    # State shared across test steps
    token: str             = ""
    img_file_id: str       = ""
    img_file_url: str      = ""
    img_thumbnail_url: str = ""
    img_tags: dict         = {}
    vid_file_id: str       = ""
    first_tag: str         = ""

    # ──────────────────────────────────────────────────────────────────────────
    # 1. Authentication
    # ──────────────────────────────────────────────────────────────────────────
    section("1. Authentication (Cognito)")
    try:
        token = get_token(args.email, args.password)
        check("Login success", bool(token), "ID token received")
    except Exception as exc:
        check("Login success", False, str(exc))
        print("\n  Cannot continue without a valid token. Exiting.")
        _print_summary()
        sys.exit(1)

    # ──────────────────────────────────────────────────────────────────────────
    # 2. POST /upload — image
    # ──────────────────────────────────────────────────────────────────────────
    section("2. POST /upload — image upload + S3 PUT")
    img_checksum = sha256(image_path)
    r = api("post", "/upload", token=token, json={
        "filename":    image_path.name,
        "contentType": "image/jpeg",
        "checksum":    img_checksum,
    })
    if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
        data = r.json()
        check("presigned_url present", "presigned_url" in data)
        check("file_id present",       "file_id"       in data)
        presigned = data.get("presigned_url", "")
        img_file_id = data.get("file_id", "")
        put = requests.put(presigned, data=image_path.read_bytes(),
                           headers={"Content-Type": "image/jpeg"})
        check("S3 PUT 200", put.status_code == 200, f"got {put.status_code}")

    # ──────────────────────────────────────────────────────────────────────────
    # 3. POST /upload — duplicate → 409
    # ──────────────────────────────────────────────────────────────────────────
    section("3. POST /upload — duplicate detection (409)")
    r = api("post", "/upload", token=token, json={
        "filename":    image_path.name,
        "contentType": "image/jpeg",
        "checksum":    img_checksum,
    })
    check("HTTP 409", r.status_code == 409, f"got {r.status_code}")

    # ──────────────────────────────────────────────────────────────────────────
    # 4. POST /upload — video (optional)
    # ──────────────────────────────────────────────────────────────────────────
    section("4. POST /upload — video upload (optional)")
    if video_path:
        vid_checksum = sha256(video_path)
        r = api("post", "/upload", token=token, json={
            "filename":    video_path.name,
            "contentType": "video/mp4",
            "checksum":    vid_checksum,
        })
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            data = r.json()
            vid_file_id = data.get("file_id", "")
            put = requests.put(data.get("presigned_url", ""),
                               data=video_path.read_bytes(),
                               headers={"Content-Type": "video/mp4"})
            check("S3 PUT 200", put.status_code == 200, f"got {put.status_code}")
    else:
        skip("Video upload", "no --video provided")

    # ──────────────────────────────────────────────────────────────────────────
    # 5. GET /show_process — poll until inference ready
    # ──────────────────────────────────────────────────────────────────────────
    section("5. GET /show_process — poll until inference ready (max 120 s)")
    if img_file_id:
        print("  Polling", end="", flush=True)
        deadline = time.time() + 120
        done = False
        while time.time() < deadline:
            r = api("get", f"/show_process?file_id={img_file_id}", token=token)
            if r.status_code == 200 and r.json().get("status") == "ready":
                done = True
                data = r.json()
                img_tags          = data.get("tags", {})
                img_thumbnail_url = data.get("thumbnail_url", "")
                img_file_url_raw  = data.get("file_url", "")
                break
            print(".", end="", flush=True)
            time.sleep(5)
        print()
        check("Inference completed",  done, "timeout" if not done else "")
        check("tags dict returned",   isinstance(img_tags, dict), str(img_tags))
        check("thumbnail_url present", bool(img_thumbnail_url))
        print(f"  Detected tags: {img_tags}")
    else:
        skip("show_process poll", "upload step failed")

    # ──────────────────────────────────────────────────────────────────────────
    # 6. GET /files
    # ──────────────────────────────────────────────────────────────────────────
    section("6. GET /files")
    r = api("get", "/files", token=token)
    if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
        items = r.json().get("results", [])
        check("results is list", isinstance(items, list))
        check("≥ 1 file",        len(items) > 0, f"count={len(items)}")
        if items:
            sample = items[0]
            for field in ("file_id", "file_type", "display_url", "file_url", "tags"):
                check(f"field '{field}' present", field in sample)
        # Retrieve presigned file_url for the uploaded image (used in delete step)
        for item in items:
            if item.get("file_id") == img_file_id:
                img_file_url = item.get("file_url", "")
                break

    # ──────────────────────────────────────────────────────────────────────────
    # 7. GET /files/mine
    # ──────────────────────────────────────────────────────────────────────────
    section("7. GET /files/mine")
    r = api("get", "/files/mine", token=token)
    if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
        items = r.json().get("results", [])
        check("results is list", isinstance(items, list))
        if items:
            sample = items[0]
            check("is_mine = true",  sample.get("is_mine") is True)
            check("owner present",   "owner" in sample)
            check("can_edit present","can_edit" in sample)

    # ──────────────────────────────────────────────────────────────────────────
    # 8. GET /tags
    # ──────────────────────────────────────────────────────────────────────────
    section("8. GET /tags")
    r = api("get", "/tags", token=token)
    if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
        tag_list = r.json().get("tags", [])
        check("tags is list", isinstance(tag_list, list))
        check("≥ 1 tag",      len(tag_list) > 0, f"count={len(tag_list)}")
        if tag_list:
            first_tag = tag_list[0]
            print(f"  Available tags (sample): {tag_list[:5]}")

    # ──────────────────────────────────────────────────────────────────────────
    # 9. POST /query/tags
    # ──────────────────────────────────────────────────────────────────────────
    section("9. POST /query/tags — AND query with min count")
    if img_tags:
        species, _ = next(iter(img_tags.items()))
        r = api("post", "/query/tags", token=token, json={species: 1})
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            items = r.json().get("results", [])
            check("results is list",  isinstance(items, list))
            check("≥ 1 result",       len(items) > 0,
                  f"queried: {species}>=1, got {len(items)}")
    else:
        skip("query/tags", "no tags from inference")

    # ──────────────────────────────────────────────────────────────────────────
    # 10. POST /query/species
    # ──────────────────────────────────────────────────────────────────────────
    section("10. POST /query/species")
    if img_tags:
        species = next(iter(img_tags.keys()))
        r = api("post", "/query/species", token=token, json={"species": species})
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            items = r.json().get("results", [])
            check("results is list", isinstance(items, list))
            check("≥ 1 result",      len(items) > 0, f"species: {species}")
    else:
        skip("query/species", "no tags from inference")

    # ──────────────────────────────────────────────────────────────────────────
    # 11. POST /query/thumbnail
    # ──────────────────────────────────────────────────────────────────────────
    section("11. POST /query/thumbnail")
    if img_thumbnail_url:
        r = api("post", "/query/thumbnail", token=token,
                json={"thumbnail_url": img_thumbnail_url})
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            data = r.json()
            check("file_id returned",  "file_id" in data)
            check("Correct file_id",
                  data.get("file_id") == img_file_id,
                  f"expected {img_file_id}, got {data.get('file_id')}")
    else:
        skip("query/thumbnail", "no thumbnail_url from inference")

    # ──────────────────────────────────────────────────────────────────────────
    # 12. POST /query/file/init  +  POST /query/file
    # ──────────────────────────────────────────────────────────────────────────
    section("12. POST /query/file/init + /query/file — query by uploaded file")
    r = api("post", "/query/file/init", token=token, json={
        "filename":     image_path.name,
        "file_type":    "image",
        "content_type": "image/jpeg",
    })
    if check("query/file/init HTTP 200", r.status_code == 200, f"got {r.status_code}"):
        data = r.json()
        check("upload_url present", "upload_url" in data)
        check("s3_key present",     "s3_key"     in data)
        upload_url = data.get("upload_url", "")
        s3_key     = data.get("s3_key", "")

        put = requests.put(upload_url, data=image_path.read_bytes(),
                           headers={"Content-Type": "image/jpeg"})
        check("S3 PUT 200 (query file)", put.status_code == 200,
              f"got {put.status_code}")

        # Cloud Run may cold-start (4vCPU/8GB model can take 30-60s).
        # API Gateway has a hard 30s timeout so the first attempt may return 503.
        # Retry up to 3 times with a 15s gap to allow Cloud Run to warm up.
        r2 = None
        for attempt in range(1, 4):
            r2 = api("post", "/query/file", token=token,
                     json={"s3_key": s3_key, "file_type": "image"})
            if r2.status_code != 503:
                break
            print(f"  Cloud Run cold start (503), retrying in 15 s... (attempt {attempt}/3)")
            time.sleep(15)
        if check("query/file HTTP 200", r2.status_code == 200, f"got {r2.status_code}"):
            data2 = r2.json()
            check("results is list", isinstance(data2.get("results"), list))
            print(f"  query/file matched {len(data2.get('results', []))} file(s)")

    # ──────────────────────────────────────────────────────────────────────────
    # 13. POST /tags/modify — add tag
    # ──────────────────────────────────────────────────────────────────────────
    section("13. POST /tags/modify — add tag (operation=1)")
    if img_file_id:
        r = api("post", "/tags/modify", token=token, json={
            "updates": [{
                "file_id":   img_file_id,
                "tags":      {"test-automate": 1},
                "operation": 1,
            }]
        })
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            res_list = r.json().get("results", [])
            check("status = updated", any(x.get("status") == "updated" for x in res_list))
            updated_tags = res_list[0].get("tags", {}) if res_list else {}
            check("tag added", "test-automate" in updated_tags,
                  f"tags: {updated_tags}")
    else:
        skip("tags/modify add", "no file_id")

    # ──────────────────────────────────────────────────────────────────────────
    # 14. POST /tags/modify — remove tag
    # ──────────────────────────────────────────────────────────────────────────
    section("14. POST /tags/modify — remove tag (operation=0)")
    if img_file_id:
        r = api("post", "/tags/modify", token=token, json={
            "updates": [{
                "file_id":   img_file_id,
                "tags":      {"test-automate": 1},
                "operation": 0,
            }]
        })
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            res_list = r.json().get("results", [])
            updated_tags = res_list[0].get("tags", {}) if res_list else {}
            check("tag removed", "test-automate" not in updated_tags,
                  f"tags: {updated_tags}")
    else:
        skip("tags/modify remove", "no file_id")

    # ──────────────────────────────────────────────────────────────────────────
    # 15. POST /files/visibility
    # ──────────────────────────────────────────────────────────────────────────
    section("15. POST /files/visibility")
    if img_file_id:
        r = api("post", "/files/visibility", token=token,
                json={"file_id": img_file_id, "isPersonal": False})
        if check("HTTP 200 (set public)", r.status_code == 200,
                 f"got {r.status_code}"):
            data = r.json()
            check("isPersonal = false", data.get("isPersonal") is False)
        # Restore to personal
        r2 = api("post", "/files/visibility", token=token,
                 json={"file_id": img_file_id, "isPersonal": True})
        check("HTTP 200 (restore personal)", r2.status_code == 200,
              f"got {r2.status_code}")
    else:
        skip("set_visibility", "no file_id")

    # ──────────────────────────────────────────────────────────────────────────
    # 16. POST /notify/subscribe
    # ──────────────────────────────────────────────────────────────────────────
    section("16. POST /notify/subscribe")
    notify_tag = first_tag or "koala"
    r = api("post", "/notify/subscribe", token=token, json={
        "email": args.email,
        "tags":  [notify_tag],
    })
    # 200 = subscribed or updated
    # 409 = pending confirmation exists (previous unconfirmed run) — still valid behaviour
    if check("HTTP 200 or 409", r.status_code in (200, 409), f"got {r.status_code}"):
        data = r.json()
        if r.status_code == 200:
            check("email in response",        data.get("email") == args.email.lower())
            check("tag in response",          notify_tag in data.get("tags", []))
            check("subscription_arn present", bool(data.get("subscription_arn")))
        else:
            check("pending message present",
                  "pending" in data.get("message", "").lower(), data.get("message", ""))

    # ──────────────────────────────────────────────────────────────────────────
    # 17. POST /notify/unsubscribe
    # ──────────────────────────────────────────────────────────────────────────
    section("17. POST /notify/unsubscribe")
    r = api("post", "/notify/unsubscribe", token=token, json={"email": args.email})
    # 200 = found (removed or pending); 404 = not found (edge case if SNS is slow)
    if check("HTTP 200 or 404", r.status_code in (200, 404),
             f"got {r.status_code}"):
        data = r.json()
        if r.status_code == 200:
            has_content = bool(data.get("removed") or data.get("pending"))
            check("removed or pending list present", has_content, str(data)[:80])
        else:
            check("No subscription found message",
                  "No subscription found" in data.get("message", ""))

    # ──────────────────────────────────────────────────────────────────────────
    # 18. DELETE /files — delete uploaded image
    # ──────────────────────────────────────────────────────────────────────────
    section("18. DELETE /files — delete uploaded image")
    if img_file_url:
        r = api("delete", "/files", token=token, json={"urls": [img_file_url]})
        if check("HTTP 200", r.status_code == 200, f"got {r.status_code}"):
            results_list = r.json().get("results", [{}])
            res = results_list[0]
            check("status = deleted",       res.get("status") == "deleted",
                  f"status: {res.get('status')}")
            check("deleted_keys present",   bool(res.get("deleted_keys")))
    else:
        skip("DELETE image", "no file_url available")

    # Delete video if uploaded
    if vid_file_id:
        section("18b. DELETE /files — delete uploaded video")
        r = api("get", "/files", token=token)
        vid_file_url = ""
        if r.status_code == 200:
            for item in r.json().get("results", []):
                if item.get("file_id") == vid_file_id:
                    vid_file_url = item.get("file_url", "")
                    break
        if vid_file_url:
            r2 = api("delete", "/files", token=token, json={"urls": [vid_file_url]})
            check("HTTP 200", r2.status_code == 200, f"got {r2.status_code}")
            if r2.status_code == 200:
                res = r2.json().get("results", [{}])[0]
                check("status = deleted", res.get("status") == "deleted",
                      f"status: {res.get('status')}")
        else:
            skip("DELETE video", "could not retrieve video file_url")

    _print_summary()


def _print_summary() -> None:
    total  = len(_results)
    passed = sum(1 for _, s in _results if s == "PASS")
    failed = total - passed
    print(f"\n{'═' * 62}")
    colour = GREEN if failed == 0 else RED
    print(f"  {colour}Result: {passed}/{total} passed"
          + (f"  ({failed} failed)" if failed else "  — all passed")
          + RESET)
    if failed:
        print(f"\n  {RED}Failed checks:{RESET}")
        for name, status in _results:
            if status == "FAIL":
                print(f"    {FAIL_ICON} {name}")
    print(f"{'═' * 62}\n")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
