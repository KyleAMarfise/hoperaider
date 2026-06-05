import { useState } from "react";
import { useAuth } from "../../context/AuthContext";

const profileIcon = (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2l6.6 2.4v6.1c0 4.5-2.8 8.6-6.6 10.2-3.8-1.6-6.6-5.7-6.6-10.2V4.4L12 2Zm0 4.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Zm-3.8 8.9h7.6c-.6-1.5-2-2.4-3.8-2.4-1.8 0-3.2.9-3.8 2.4Z" />
  </svg>
);

export function ProfileMenu() {
  const { user, uid, signOutUser } = useAuth();
  const [status, setStatus] = useState("");

  const label = user
    ? `Signed in (${user.email || (uid ? uid.slice(0, 8) + "…" : "")})`
    : "Connecting…";

  const copyUid = async () => {
    if (!uid) return;
    try {
      await navigator.clipboard.writeText(uid);
      setStatus("UID copied.");
    } catch {
      /* ignore */
    }
  };

  return (
    <details className="nav-menu profile-menu">
      <summary className="profile-icon-button" aria-label="Profile menu" title="Profile menu">
        {profileIcon}
      </summary>
      <div className="profile-menu-panel">
        <p className="profile-menu-muted">Account / Profile Menu</p>
        <p className="auth-status">{status || label}</p>
        <div className="auth-meta">
          {uid && <span className="uid-chip">UID: {uid}</span>}
          {uid && (
            <button type="button" className="secondary" onClick={copyUid}>
              Copy UID
            </button>
          )}
        </div>
        <div className="auth-actions">
          <button type="button" className="secondary" onClick={() => void signOutUser()}>
            Sign Out
          </button>
        </div>
      </div>
    </details>
  );
}
