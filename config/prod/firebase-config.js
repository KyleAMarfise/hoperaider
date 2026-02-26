const runtimeConfig = (typeof globalThis !== "undefined" && globalThis.__HOPE_RAID_CONFIG)
  ? globalThis.__HOPE_RAID_CONFIG
  : {};

function readConfigValue(key, fallback = "") {
  const value = runtimeConfig[key];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readAdminUids() {
  const raw = runtimeConfig.APP_ADMIN_UIDS;
  if (Array.isArray(raw)) {
    return raw
      .map((uid) => String(uid).trim())
      .filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(",")
      .map((uid) => uid.trim())
      .filter(Boolean);
  }

  return [];
}

export const firebaseConfig = {
  apiKey: readConfigValue("FIREBASE_API_KEY", "REPLACE_ME"),
  authDomain: readConfigValue("FIREBASE_AUTH_DOMAIN", "REPLACE_ME.firebaseapp.com"),
  projectId: readConfigValue("FIREBASE_PROJECT_ID", "REPLACE_ME"),
  storageBucket: readConfigValue("FIREBASE_STORAGE_BUCKET", "REPLACE_ME.firebasestorage.app"),
  messagingSenderId: readConfigValue("FIREBASE_MESSAGING_SENDER_ID", "REPLACE_ME"),
  appId: readConfigValue("FIREBASE_APP_ID", "REPLACE_ME")
};

export const appSettings = {
  siteTitle: readConfigValue("APP_SITE_TITLE", "Hope Raid Tracker"),
  adminUids: readAdminUids(),
  discordInviteUrl: readConfigValue("APP_DISCORD_INVITE_URL", "https://discord.gg/xYtxu6Yj")
};