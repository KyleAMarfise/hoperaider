import { useState } from "react";
import type { FormEvent } from "react";
import { useAuth } from "../../context/AuthContext";
import { authErrorMessage, cx } from "../../lib/formatters";

export function AuthGate() {
  const { signInGoogle, signInYahoo, signInEmail } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("Sign in to view raid strategy.");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setIsError(true);
      setMessage(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onEmail = (e: FormEvent, create: boolean) => {
    e.preventDefault();
    if (!email || !password) return;
    void run(() => signInEmail(email, password, create));
  };

  return (
    <section className="auth-gate">
      <div className="auth-gate-card">
        <h1>Hope Raid Tracker</h1>
        <p className={cx("auth-gate-message", isError && "error")}>{message}</p>
        <div className="auth-gate-buttons">
          <button type="button" className="auth-btn auth-btn-google" disabled={busy} onClick={() => void run(signInGoogle)}>
            Sign in with Google
          </button>
          <button type="button" className="auth-btn auth-btn-yahoo" disabled={busy} onClick={() => void run(signInYahoo)}>
            Sign in with Yahoo
          </button>
        </div>
        <div className="auth-gate-divider">
          <span>or</span>
        </div>
        <form className="auth-gate-email-form" onSubmit={(e) => onEmail(e, false)}>
          <input
            type="email"
            className="auth-input"
            placeholder="Email address"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            className="auth-input"
            placeholder="Password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <div className="auth-gate-email-buttons">
            <button type="submit" className="auth-btn auth-btn-email" disabled={busy}>
              Sign In with Email
            </button>
            <button type="button" className="auth-btn auth-btn-create" disabled={busy} onClick={(e) => onEmail(e, true)}>
              Create Account
            </button>
          </div>
          <p className="auth-gate-email-hint">
            First time? Click <strong>Create Account</strong>. Already registered? Click <strong>Sign In</strong>.
          </p>
        </form>
      </div>
    </section>
  );
}
