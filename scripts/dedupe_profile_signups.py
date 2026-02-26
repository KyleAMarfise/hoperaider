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


def value_of(field: dict):
    if not isinstance(field, dict):
        return None
    if "stringValue" in field:
        return field["stringValue"]
    if "integerValue" in field:
        try:
            return int(field["integerValue"])
        except Exception:
            return None
    if "timestampValue" in field:
        return field["timestampValue"]
    return None


def doc_id(name: str) -> str:
    return name.rsplit("/", 1)[-1]


def sort_key(doc: dict):
    fields = doc.get("fields", {})
    status = str(value_of(fields.get("status")) or "").lower()
    status_rank = 0 if status == "accept" else 1 if status == "requested" else 2
    updated = str(value_of(fields.get("updatedAt")) or "")
    created = str(value_of(fields.get("createdAt")) or "")
    return (status_rank, updated, created, doc_id(doc.get("name", "")))


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

    signups = list_docs(base, "signups", headers)

    grouped: dict[tuple[str, str], list[dict]] = {}
    for signup in signups:
        fields = signup.get("fields", {})
        raid_id = str(value_of(fields.get("raidId")) or "").strip()
        profile_id = str(value_of(fields.get("characterId")) or "").strip()
        if not raid_id or not profile_id:
            continue
        grouped.setdefault((raid_id, profile_id), []).append(signup)

    delete_list: list[dict] = []
    duplicate_groups = 0
    for docs in grouped.values():
        if len(docs) <= 1:
            continue
        duplicate_groups += 1
        docs_sorted = sorted(docs, key=sort_key)
        keep = docs_sorted[-1]
        for entry in docs:
            if entry.get("name") != keep.get("name"):
                delete_list.append(entry)

    print("Total signups:", len(signups))
    print("Duplicate profile-per-raid groups:", duplicate_groups)
    print("To delete:", len(delete_list))

    deleted = 0
    for signup in delete_list:
        delete_req = urllib.request.Request(to_doc_url(base, signup["name"]), headers=headers, method="DELETE")
        with urllib.request.urlopen(delete_req, timeout=30):
            deleted += 1

    print("Deleted:", deleted)


if __name__ == "__main__":
    main()
