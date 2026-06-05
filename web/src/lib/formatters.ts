export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// Only allow http(s) links; block javascript:/data: and auto-prefix bare domains.
export function normalizeUrl(url?: string): string {
  const u = String(url ?? "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ""; // reject other schemes
  return "https://" + u;
}

export function parseDateOnly(dateText?: string): Date | null {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) return null;
  const [y, m, d] = dateText.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

export function toDateOnlyString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatMonthDayYear(dateText?: string): string {
  const d = parseDateOnly(dateText);
  if (!d) return dateText || "";
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${d.getFullYear()}`;
}

export function relativeTime(ts: any): string {
  const d = ts?.toDate?.() ?? (ts instanceof Date ? ts : null);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function normalizeSignupStatus(s?: string): string {
  const v = (s || "").toLowerCase();
  if (v === "accepted") return "accept";
  if (v === "benched") return "tentative";
  return v;
}

export function authErrorMessage(error: any): string {
  switch (error?.code) {
    case "auth/popup-blocked": return "Sign-in popup was blocked.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request": return "Sign-in cancelled.";
    case "auth/network-request-failed": return "Network error.";
    case "auth/invalid-email": return "Invalid email address.";
    case "auth/user-disabled": return "Account disabled.";
    case "auth/user-not-found": return "No account found. Click Create Account.";
    case "auth/wrong-password": return "Incorrect password.";
    case "auth/invalid-credential": return "Invalid email or password.";
    case "auth/email-already-in-use": return "Account exists. Try signing in.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/too-many-requests": return "Too many attempts. Try later.";
    default: return error?.message || "Sign-in failed.";
  }
}
