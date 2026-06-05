// Runtime config from Vite env (import.meta.env.VITE_*). Mirrors the shapes the
// old config/prod/firebase-config.js exported, so ported code reads the same fields.
const env = import.meta.env as unknown as Record<string, string | undefined>;

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: env.VITE_FIREBASE_APP_ID ?? ""
};

function parseAdminUids(raw?: string): string[] {
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export const appSettings = {
  siteTitle: env.VITE_APP_SITE_TITLE || "Hope Raider",
  adminUids: parseAdminUids(env.VITE_APP_ADMIN_UIDS),
  discordInviteUrl: env.VITE_APP_DISCORD_INVITE_URL || "https://discord.gg/H2MtWtBGGC",
  discordWebhookUrl: env.VITE_DISCORD_WEBHOOK_URL || "",
  wclClientId: env.VITE_WCL_CLIENT_ID || "",
  wclClientSecret: env.VITE_WCL_CLIENT_SECRET || ""
};

export function hasFirebaseConfig(): boolean {
  return (
    !!firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.includes("REPLACE_ME") &&
    !!firebaseConfig.projectId
  );
}
