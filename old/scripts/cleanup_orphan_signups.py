import json
import urllib.request
from pathlib import Path
from urllib.parse import urlencode


def load_env(path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        env[key] = value
    return env


def list_docs(base: str, coll: str, headers: dict[str, str]) -> list[dict]:
    docs: list[dict] = []
    page_token = ""
    while True:
        query = {"pageSize": 300}
        if page_token:
            query["pageToken"] = page_token
        req = urllib.request.Request(f"{base}/{coll}?{urlencode(query)}", headers=headers)
        with urllib.request.urlopen(req, timeout=30) as response:
            body = json.loads(response.read().decode())
        docs.extend(body.get("documents", []))
        page_token = body.get("nextPageToken", "")
        if not page_token:
            break
    return docs


def doc_id(doc_name: str) -> str:
    return doc_name.rsplit("/", 1)[-1]


def to_doc_url(base: str, doc_name: str) -> str:
    if doc_name.startswith("http://") or doc_name.startswith("https://"):
        return doc_name
    if doc_name.startswith("projects/"):
        return f"https://firestore.googleapis.com/v1/{doc_name}"
    if doc_name.startswith("/"):
        return f"https://firestore.googleapis.com/v1{doc_name}"
    return f"{base}/{doc_name.lstrip('/')}"


def main() -> None:
    env = load_env(Path(".env"))
    api = env.get("FIREBASE_API_KEY", "")
    project_id = env.get("FIREBASE_PROJECT_ID", "")
    if not api or not project_id:
        raise SystemExit("Missing FIREBASE_API_KEY or FIREBASE_PROJECT_ID in .env")

    auth_req = urllib.request.Request(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={api}",
        data=json.dumps({"returnSecureToken": True}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    with urllib.request.urlopen(auth_req, timeout=30) as response:
        auth_data = json.loads(response.read().decode())

    token = auth_data.get("idToken", "")
    if not token:
        raise SystemExit(f"Anonymous auth failed: {auth_data}")

    headers = {"Authorization": f"Bearer {token}"}
    base = f"https://firestore.googleapis.com/v1/projects/{project_id}/databases/(default)/documents"

    characters = list_docs(base, "characters", headers)
    character_ids = {doc_id(doc["name"]) for doc in characters}

    raids = list_docs(base, "raids", headers)
    raid_ids = {doc_id(doc["name"]) for doc in raids}

    signups = list_docs(base, "signups", headers)
    orphan_signups = []
    stale_raid_signups = []
    for signup in signups:
        fields = signup.get("fields", {})
        character_id = fields.get("characterId", {}).get("stringValue", "")
        raid_id = fields.get("raidId", {}).get("stringValue", "")
        if not character_id or character_id not in character_ids:
            orphan_signups.append(signup)
            continue
        if not raid_id or raid_id not in raid_ids:
            stale_raid_signups.append(signup)

    print(f"Characters: {len(characters)}")
    print(f"Raids: {len(raids)}")
    print(f"Signups: {len(signups)}")
    print(f"Orphan signups: {len(orphan_signups)}")
    print(f"Stale-raid signups: {len(stale_raid_signups)}")

    to_delete = {signup["name"]: signup for signup in orphan_signups + stale_raid_signups}
    deleted = 0
    for signup in to_delete.values():
        delete_url = to_doc_url(base, signup["name"])
        delete_req = urllib.request.Request(delete_url, headers=headers, method="DELETE")
        with urllib.request.urlopen(delete_req, timeout=30):
            deleted += 1

    print(f"Deleted: {deleted}")


if __name__ == "__main__":
    main()
