# buffer.py — Buffer → Pinterest (local image upload + schedule)
# pip install requests pillow

import json
import mimetypes
import os
import pathlib
import re
import requests
from typing import Dict, List, Optional
from urllib.parse import urlparse
from PIL import Image

# ====== CONFIG ==============================================================
COOKIES_TXT_PATH = r"C:\Users\benar\OneDrive\Bureau\canva\cookies.txt"
PROFILE_ID = "688526fb96f2ca7f1c0fc98d"
BOARD_ID   = "688cbbf56cac34c8300f0378"
ORG_ID     = "688526e03accaa916f9dcc6d"
UPLOAD_TYPE = "postAsset"         # from your DevTools/cURL
IMAGES_DIRECTORY = "images"       # folder next to this script
SLOTS_START = "2025-08-01"        # optional
SLOTS_END   = "2025-08-31"        # optional
# ===========================================================================

BASE = "https://publish.buffer.com"
RPC  = f"{BASE}/rpc/composerApiProxy"
GRAPH = "https://graph.buffer.com/?_o=s3PreSignedURL"

COOKIE_WHITELIST: List[str] = [
    "buffer_session", "bufferapp_ci_session", "AWSALB", "AWSALBCORS",
    "AWSALBTG", "AWSALBTGCORS", "__stripe_mid", "__stripe_sid",
]
SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}

# ---------- cookies ----------
def parse_cookies_txt(path: str) -> Dict[str, str]:
    text = pathlib.Path(path).read_text(encoding="utf-8", errors="ignore")
    jar: Dict[str, str] = {}
    if "\t" in text or "\n" in text:  # Netscape TSV
        for line in text.splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "\t" not in line:
                continue
            parts = line.split("\t")
            if len(parts) >= 7:
                name = parts[5].strip()
                value = parts[6].strip()
                if name:
                    jar[name] = value
    else:  # "name=value; name2=value2"
        for m in re.finditer(r"([^=;]+)=([^;]+)", text):
            jar[m.group(1).strip()] = m.group(2).strip()
    return jar

def build_cookie_header(allcookies: Dict[str, str], whitelist: List[str]) -> str:
    pairs = [f"{k}={allcookies[k]}" for k in whitelist if k in allcookies]
    header = "; ".join(pairs)
    print("Using cookies:", ", ".join([k for k in whitelist if k in allcookies]))
    print("Cookie header length:", len(header))
    if not header:
        raise RuntimeError("No cookies from whitelist found in cookies.txt")
    return header

# ---------- proxy ----------
def composer_proxy(cookie_header: str, inner_obj: dict) -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": BASE,
        "Referer": f"{BASE}/all-channels?tab=queue",
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": cookie_header,
    }
    payload = {"args": json.dumps(inner_obj)}  # exact browser shape
    r = requests.post(RPC, headers=headers, data=json.dumps(payload))
    if r.status_code >= 400:
        raise requests.HTTPError(f"{r.status_code} {r.reason} – {r.text[:400]}")
    return r.json().get("result", r.json())

def get_slots(cookie_header: str, profile_id: str, start_day: str, end_day: str):
    inner = {
        "url": f"/1/profiles/{profile_id}/schedules/slots.json",
        "args": {"start_day": start_day, "end_day": end_day},
        "HTTPMethod": "GET",
    }
    return composer_proxy(cookie_header, inner)

# ---------- GraphQL pre-sign ----------
def graphql_presign(cookie_header: str, file_name: str, mime_type: str) -> dict:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": BASE,
        "Referer": "https://publish.buffer.com/",
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": cookie_header,
        "x-buffer-client-id": "webapp-publishing",
    }
    gql_query = (
        "query s3PreSignedURL($input: S3PreSignedURLInput!) {"
        "  s3PreSignedURL(input: $input) { url key bucket __typename }"
        "}"
    )
    payload = {
        "operationName": "s3PreSignedURL",
        "query": gql_query,
        "variables": {
            "input": {
                "organizationId": ORG_ID,
                "fileName": file_name,
                "mimeType": mime_type,
                "uploadType": UPLOAD_TYPE,
            }
        },
    }
    r = requests.post(GRAPH, headers=headers, json=payload)
    if r.status_code >= 400:
        raise requests.HTTPError(f"{r.status_code} {r.reason} – {r.text[:400]}")
    data = r.json()
    if "errors" in data:
        raise RuntimeError(json.dumps(data["errors"][0], ensure_ascii=False))
    out = data.get("data", {}).get("s3PreSignedURL")
    if not out or "url" not in out or "key" not in out:
        raise RuntimeError(f"Unexpected GraphQL result: {data}")
    return out

# ---------- S3 PUT ----------
def s3_put(upload_url: str, filepath: str, mime_type: str):
    with open(filepath, "rb") as f:
        r = requests.put(upload_url, data=f, headers={"Content-Type": mime_type})
    if r.status_code // 100 != 2:
        raise requests.HTTPError(f"S3 PUT failed: {r.status_code} {r.text[:300]}")

# ---------- finalize ----------
def finalize_upload(cookie_header: str, key: str) -> str:
    inner = {
        "url": "/i/uploads/upload_media.json",
        "args": {"key": key, "serviceForceTranscodeVideo": False},
        "HTTPMethod": "POST",
    }
    res = composer_proxy(cookie_header, inner)
    location = res.get("location") or res.get("details", {}).get("location")
    if not location:
        raise RuntimeError(f"Finalize missing 'location': {res}")
    return location

def upload_image_to_buffer(cookie_header: str, image_path: str) -> str:
    filename = os.path.basename(image_path)
    mime_type = mimetypes.guess_type(image_path)[0] or "image/webp"
    print("Getting pre-signed URL from Buffer…")
    presign = graphql_presign(cookie_header, filename, mime_type)
    print("Uploading bytes to S3…")
    s3_put(presign["url"], image_path, mime_type)
    print("Finalizing upload with Buffer…")
    media_url = finalize_upload(cookie_header, presign["key"])
    print(f"✓ Upload successful → {media_url}")
    return media_url

# ---------- UI helpers ----------
def get_available_images(directory: str) -> List[str]:
    if not os.path.isabs(directory):
        script_dir = os.path.dirname(os.path.abspath(__file__))
        directory = os.path.join(script_dir, directory)
    if not os.path.exists(directory):
        return []
    return sorted([f for f in os.listdir(directory)
                   if any(f.lower().endswith(ext) for ext in SUPPORTED_FORMATS)])

def display_images_menu(images_dir: str, images: List[str]) -> Optional[str]:
    if not images:
        print("No supported images found.")
        return None
    print("\n" + "="*50)
    print("AVAILABLE IMAGES")
    print("="*50)
    for i, image in enumerate(images, 1):
        try:
            with Image.open(os.path.join(images_dir, image)) as img:
                w, h = img.size
            size_kb = os.path.getsize(os.path.join(images_dir, image)) / 1024
            print(f"{i:2d}. {image:<30} ({w}x{h}, {size_kb:.1f}KB)")
        except Exception:
            print(f"{i:2d}. {image:<30}")
    print("="*50)
    while True:
        choice = input(f"Choose an image (1-{len(images)}) or 'q' to quit: ").strip()
        if choice.lower() == 'q':
            return None
        if choice.isdigit() and 1 <= int(choice) <= len(images):
            return images[int(choice) - 1]
        print("Please enter a valid number.")

def ask(prompt: str, default: Optional[str] = None, allow_empty=False) -> str:
    suffix = f" [{default}]" if default is not None else ""
    while True:
        val = input(f"{prompt}{suffix}: ").strip()
        if not val and default is not None:
            return default
        if val or allow_empty:
            return val
        print("  Please enter a value.")

def normalize_source_url(raw: str) -> Optional[str]:
    """Return a valid absolute URL or None (omit). Auto-add https:// when missing."""
    raw = (raw or "").strip()
    if not raw:
        return None
    if not re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://", raw):
        raw = "https://" + raw
    p = urlparse(raw)
    if not p.scheme or not p.netloc:
        return None
    return raw

# ---------- schedule ----------
def schedule_pin(cookie_header: str,
                 profile_id: str, board_id: str,
                 text: str, title: str, media_url: str, source_url: Optional[str],
                 share_now: bool = False, due_at: Optional[int] = None):
    media = {
        "progress": 100,
        "uploaded": True,
        "photo": media_url,
        "picture": media_url,
        "thumbnail": media_url,
        "alt_text": None,
        "source": {"name": "localFile", "trigger": "filePicker"},
        "height": 2048,
        "width": 2048,
    }
    args = {
        "now": bool(share_now),
        "top": False,
        "is_draft": False,
        "shorten": True,
        "text": text,
        "scheduling_type": "direct",
        "fb_text": "",
        "entities": None,
        "annotations": [],
        "profile_ids": [profile_id],
        "attachment": False,
        "via": None,
        "source": None,
        "version": None,
        "duplicated_from": None,
        "created_source": "allChannels",
        "channel_data": None,
        "subprofile_ids": [board_id],
        "tags": [],
        "title": title,
        "media": media,
        "ai_assisted": False,
        "channelGroupIds": [],
    }
    if source_url:
        args["source_url"] = source_url
    if due_at is not None:
        args["due_at"] = int(due_at)

    inner = {"url": "/1/updates/create.json", "args": args, "HTTPMethod": "POST"}
    return composer_proxy(cookie_header, inner)

# ---------- main ----------
def main():
    print("🔥 Pinterest Buffer Scheduler")
    print("="*50)

    # cookies
    try:
        allcookies = parse_cookies_txt(COOKIES_TXT_PATH)
        cookie_header = build_cookie_header(allcookies, COOKIE_WHITELIST)
    except Exception as e:
        print(f"❌ Error with cookies: {e}")
        return

    # optional slots
    try:
        slots = get_slots(cookie_header, PROFILE_ID, SLOTS_START, SLOTS_END)
        if isinstance(slots, dict) and slots:
            first_day = sorted(slots.keys())[0]
            print("Slots sample:", first_day, slots[first_day][:2])
    except Exception as e:
        print("Slots fetch skipped (non-fatal):", e)

    # list images
    images_dir = IMAGES_DIRECTORY if os.path.isabs(IMAGES_DIRECTORY) else os.path.join(os.path.dirname(os.path.abspath(__file__)), IMAGES_DIRECTORY)
    images = get_available_images(IMAGES_DIRECTORY)
    if not images:
        print(f"❌ No images found in {images_dir}")
        print("Please add .jpg/.png/.webp/.gif/.bmp files to that folder.")
        return

    chosen = display_images_menu(images_dir, images)
    if not chosen:
        print("Cancelled.")
        return

    image_path = os.path.join(images_dir, chosen)
    print(f"\n✓ Selected: {chosen}")

    # details
    default_title = os.path.splitext(chosen)[0].replace("_", " ").replace("-", " ").title()
    title = ask("Enter pin title", default=default_title)
    description = ask("Enter pin description (optional)", default="", allow_empty=True)
    src_raw = ask("Enter source URL (optional)", default="", allow_empty=True)
    source_url = normalize_source_url(src_raw)
    if src_raw and not source_url:
        print("⚠️  The source URL looked invalid; it will be omitted.")

    print("\nProceed with upload & scheduling? (y/n)")
    if input("> ").strip().lower() != "y":
        print("Cancelled.")
        return

    try:
        media_url = upload_image_to_buffer(cookie_header, image_path)
        print("\nScheduling pin…")
        result = schedule_pin(cookie_header, PROFILE_ID, BOARD_ID,
                              description, title, media_url, source_url)
        print("\n✅ SUCCESS!")
        print(json.dumps(result, indent=2))
    except Exception as e:
        print(f"\n❌ Error: {e}")

if __name__ == "__main__":
    main()
