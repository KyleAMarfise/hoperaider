import { createBrowserRouter, Navigate, useLocation } from "react-router-dom";
import { AppShell } from "../components/shell/AppShell";
import { StrategyPage } from "./StrategyPage";
import { SchedulePage } from "./SchedulePage";
import { ReleasesPage } from "./ReleasesPage";
import { RaidCreatorPage } from "./RaidCreatorPage";
import { SoftReservesPage } from "./SoftReservesPage";
import { SoftReservesPugPage } from "./SoftReservesPugPage";
import { AdminPage } from "./AdminPage";
import { SignupPage } from "./SignupPage";
import { RequireAdmin } from "../components/shell/RequireAdmin";
import { ComingSoon } from "./Placeholders";

// Old `*.html` bookmarks/Discord links → clean SPA paths, preserving query + hash.
// Done client-side (not via static stub files) because GitHub Pages serves
// `/softres.html` for a request to `/softres`, which would make a static stub
// redirect to itself forever.
function LegacyRedirect({ to }: { to: string }) {
  const { search, hash } = useLocation();
  return <Navigate to={`${to}${search}${hash}`} replace />;
}

export const router = createBrowserRouter([
  // Standalone anonymous guest route — no nav, no auth gate.
  { path: "softres-pug", element: <SoftReservesPugPage /> },
  // Legacy URL redirects (old static site used .html paths).
  { path: "index.html", element: <LegacyRedirect to="/" /> },
  { path: "schedule.html", element: <LegacyRedirect to="/schedule" /> },
  { path: "releases.html", element: <LegacyRedirect to="/releases" /> },
  { path: "raids.html", element: <LegacyRedirect to="/raids" /> },
  { path: "softres.html", element: <LegacyRedirect to="/softres" /> },
  { path: "strategy.html", element: <LegacyRedirect to="/strategy" /> },
  { path: "admin.html", element: <LegacyRedirect to="/admin" /> },
  { path: "softres-pug.html", element: <LegacyRedirect to="/softres-pug" /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <SignupPage /> },
      { path: "strategy", element: <StrategyPage /> },
      { path: "schedule", element: <SchedulePage /> },
      { path: "releases", element: <ReleasesPage /> },
      { path: "softres", element: <SoftReservesPage /> },
      { path: "raids", element: <RequireAdmin><RaidCreatorPage /></RequireAdmin> },
      { path: "admin", element: <RequireAdmin><AdminPage /></RequireAdmin> },
      { path: "*", element: <ComingSoon /> }
    ]
  }
]);
