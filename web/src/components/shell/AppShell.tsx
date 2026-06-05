import { Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Nav } from "./Nav";
import { AuthGate } from "./AuthGate";

export function AppShell() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="auth-gate">
        <div className="auth-gate-card">
          <p className="auth-gate-message">Connecting…</p>
        </div>
      </div>
    );
  }

  if (!user) return <AuthGate />;

  return (
    <main className="container">
      <header className="header">
        <Nav />
      </header>
      <Outlet />
    </main>
  );
}
