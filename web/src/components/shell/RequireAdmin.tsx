import type { ReactNode } from "react";
import { useAuth } from "../../context/AuthContext";

// Route guard — renders children only for admins. Non-admins (even via direct URL)
// get an access-denied card instead of the page.
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="scroll-parchment">
        <div className="scroll-parchment-inner">
          <p className="schedule-empty">Checking access…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="scroll-parchment">
        <div className="scroll-parchment-inner">
          <div className="scroll-title-row">
            <h2 className="scroll-title">⛔ Admins Only</h2>
          </div>
          <hr className="scroll-divider" />
          <p className="schedule-empty">You don't have access to this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
