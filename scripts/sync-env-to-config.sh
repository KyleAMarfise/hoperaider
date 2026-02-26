#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"
OUT_FILE="$ROOT_DIR/config/local/app-config.local.js"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing .env at $ENV_FILE"
  exit 1
fi

mkdir -p "$(dirname "$OUT_FILE")"

get_env() {
  local key="$1"
  local value
  value=$(grep -E "^${key}=" "$ENV_FILE" | head -n 1 | cut -d '=' -f2- || true)
  echo "$value"
}

escape_js() {
  local value="$1"
  value=${value//\\/\\\\}
  value=${value//"/\\"}
  echo "$value"
}

FIREBASE_API_KEY="$(get_env FIREBASE_API_KEY)"
FIREBASE_AUTH_DOMAIN="$(get_env FIREBASE_AUTH_DOMAIN)"
FIREBASE_PROJECT_ID="$(get_env FIREBASE_PROJECT_ID)"
FIREBASE_STORAGE_BUCKET="$(get_env FIREBASE_STORAGE_BUCKET)"
FIREBASE_MESSAGING_SENDER_ID="$(get_env FIREBASE_MESSAGING_SENDER_ID)"
FIREBASE_APP_ID="$(get_env FIREBASE_APP_ID)"
APP_SITE_TITLE="$(get_env APP_SITE_TITLE)"
APP_ADMIN_UIDS="$(get_env APP_ADMIN_UIDS)"
APP_DISCORD_INVITE_URL="$(get_env APP_DISCORD_INVITE_URL)"

if [[ -z "$APP_SITE_TITLE" ]]; then
  APP_SITE_TITLE="Hope Raid Tracker"
fi

if [[ -z "$APP_DISCORD_INVITE_URL" ]]; then
  APP_DISCORD_INVITE_URL="https://discord.gg/YOUR_INVITE_CODE"
fi

cat > "$OUT_FILE" <<EOF
window.__HOPE_RAID_CONFIG = {
  FIREBASE_API_KEY: "$(escape_js "$FIREBASE_API_KEY")",
  FIREBASE_AUTH_DOMAIN: "$(escape_js "$FIREBASE_AUTH_DOMAIN")",
  FIREBASE_PROJECT_ID: "$(escape_js "$FIREBASE_PROJECT_ID")",
  FIREBASE_STORAGE_BUCKET: "$(escape_js "$FIREBASE_STORAGE_BUCKET")",
  FIREBASE_MESSAGING_SENDER_ID: "$(escape_js "$FIREBASE_MESSAGING_SENDER_ID")",
  FIREBASE_APP_ID: "$(escape_js "$FIREBASE_APP_ID")",
  APP_SITE_TITLE: "$(escape_js "$APP_SITE_TITLE")",
  APP_ADMIN_UIDS: "$(escape_js "$APP_ADMIN_UIDS")",
  APP_DISCORD_INVITE_URL: "$(escape_js "$APP_DISCORD_INVITE_URL")"
};
EOF

echo "Wrote runtime config to $OUT_FILE"
