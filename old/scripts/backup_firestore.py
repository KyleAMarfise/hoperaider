#!/usr/bin/env python3
"""
Local Firestore backup script.

Exports every document from all known collections to a timestamped JSON file
inside the backups/ directory (git-ignored). Uses the Firestore REST API with
an OAuth access token from the Firebase CLI (must be logged in via
`firebase login`).

Usage:
    python3 scripts/backup_firestore.py

Prerequisites:
    - Firebase CLI installed and logged in (`firebase login`)

Config is read automatically from config/local/app-config.local.js.
Falls back to a .env file at the repo root or environment variables.

Backups are saved to:
    backups/firestore-backup-YYYY-MM-DD_HHMMSS.json
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
import urllib.request

COLLECTIONS = [
    "admins",
    "characters",
    "coreRaiders",
    "hardreserves",
    "members",
    "owners",
    "raids",
    "releases",
    "schedule",
    "signups",
    "softreserves",
]

BACKUPS_DIR = Path(__file__).resolve().parent.parent / "backups"


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key.strip()] = value.strip()
    return env


def load_local_config(repo_root: Path) -> dict[str, str]:
    """Parse config/local/app-config.local.js for FIREBASE_* values."""
    config_path = repo_root / "config" / "local" / "app-config.local.js"
    if not config_path.exists():
        return {}
    import re
    text = config_path.read_text()
    pairs: dict[str, str] = {}
    for match in re.finditer(r'(\w+)\s*:\s*"([^"]*)"', text):
        pairs[match.group(1)] = match.group(2)
    return pairs


def get_firebase_access_token() -> str:
    """Get an OAuth access token from the Firebase CLI's stored credentials."""
    import platform
    if platform.system() == "Windows":
        config_dir = Path(os.environ.get("APPDATA", "")) / "configstore"
    else:
        config_dir = Path.home() / ".config" / "configstore"

    firebase_config = config_dir / "firebase-tools.json"
    if not firebase_config.exists():
        raise SystemExit(
            "Firebase CLI config not found. Run `firebase login` first."
        )

    try:
        config_data = json.loads(firebase_config.read_text())
    except json.JSONDecodeError as exc:
        raise SystemExit(f"Failed to parse Firebase CLI config: {exc}")

    tokens = config_data.get("tokens", {})
    refresh_token = tokens.get("refresh_token", "")

    if not refresh_token:
        raise SystemExit(
            "No refresh token found in Firebase CLI config. Run `firebase login` first."
        )

    # Exchange refresh token for access token using Firebase CLI's OAuth client
    data = urlencode({
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": "563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com",
        "client_secret": "j9iVZfS8kkCEFUPaAeJV0sAi",
    }).encode()

    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token",
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        token_data = json.loads(resp.read().decode())

    access_token = token_data.get("access_token", "")
    if not access_token:
        raise SystemExit(f"Failed to get access token: {token_data}")
    return access_token


def list_docs(base_url: str, collection: str, headers: dict[str, str]) -> list[dict]:
    """Page through all documents in a collection, retrying on 429."""
    docs: list[dict] = []
    page_token = ""
    while True:
        params: dict[str, str | int] = {"pageSize": 300}
        if page_token:
            params["pageToken"] = page_token
        url = f"{base_url}/{collection}?{urlencode(params)}"
        req = urllib.request.Request(url, headers=headers)
        for attempt in range(5):
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = json.loads(resp.read().decode())
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 4:
                    wait = 15 * (attempt + 1)
                    print(f"rate-limited, waiting {wait}s...", end=" ", flush=True)
                    time.sleep(wait)
                else:
                    raise
        docs.extend(body.get("documents", []))
        page_token = body.get("nextPageToken", "")
        if not page_token:
            break
    return docs


def doc_id(doc_name: str) -> str:
    return doc_name.rsplit("/", 1)[-1]


def simplify_value(value: dict):
    """Convert a Firestore REST value object to a plain Python value."""
    if "stringValue" in value:
        return value["stringValue"]
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return value["doubleValue"]
    if "booleanValue" in value:
        return value["booleanValue"]
    if "nullValue" in value:
        return None
    if "timestampValue" in value:
        return value["timestampValue"]
    if "arrayValue" in value:
        return [simplify_value(v) for v in value["arrayValue"].get("values", [])]
    if "mapValue" in value:
        return {k: simplify_value(v) for k, v in value["mapValue"].get("fields", {}).items()}
    # Fallback: return raw
    return value


def simplify_fields(fields: dict) -> dict:
    """Convert all Firestore REST fields to plain key-value pairs."""
    return {key: simplify_value(val) for key, val in fields.items()}


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent

    # Try config/local/app-config.local.js first, then .env, then env vars
    local_cfg = load_local_config(repo_root)
    env = load_env(repo_root / ".env")

    api_key = (
        local_cfg.get("FIREBASE_API_KEY", "")
        or env.get("FIREBASE_API_KEY", "")
        or os.environ.get("FIREBASE_API_KEY", "")
    )
    project_id = (
        local_cfg.get("FIREBASE_PROJECT_ID", "")
        or env.get("FIREBASE_PROJECT_ID", "")
        or os.environ.get("FIREBASE_PROJECT_ID", "")
    )

    if not api_key or not project_id:
        raise SystemExit(
            "Missing FIREBASE_API_KEY or FIREBASE_PROJECT_ID.\n"
            "Set them in config/local/app-config.local.js, .env at the repo root, or as environment variables."
        )

    print(f"Project: {project_id}")
    print("Authenticating via Firebase CLI credentials...")
    token = get_firebase_access_token()
    headers = {"Authorization": f"Bearer {token}"}
    base_url = (
        f"https://firestore.googleapis.com/v1/projects/{project_id}"
        f"/databases/(default)/documents"
    )

    backup: dict[str, dict] = {}
    total_docs = 0

    for coll in COLLECTIONS:
        print(f"  Fetching {coll}...", end=" ", flush=True)
        try:
            raw_docs = list_docs(base_url, coll, headers)
        except Exception as exc:
            print(f"ERROR: {exc}")
            continue
        docs_map: dict[str, dict] = {}
        for raw in raw_docs:
            did = doc_id(raw.get("name", ""))
            docs_map[did] = simplify_fields(raw.get("fields", {}))
        backup[coll] = docs_map
        total_docs += len(docs_map)
        print(f"{len(docs_map)} docs")

    # Write backup
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    filename = f"firestore-backup-{timestamp}.json"
    filepath = BACKUPS_DIR / filename

    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(
            {
                "project": project_id,
                "exportedAt": datetime.now(timezone.utc).isoformat(),
                "collections": backup,
            },
            fh,
            indent=2,
            ensure_ascii=False,
        )

    size_kb = filepath.stat().st_size / 1024
    print(f"\n✅ Backup complete: {total_docs} documents across {len(backup)} collections")
    print(f"   Saved to: {filepath.relative_to(repo_root)}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
