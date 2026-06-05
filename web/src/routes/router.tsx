import { createBrowserRouter } from "react-router-dom";
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

export const router = createBrowserRouter([
  // Standalone anonymous guest route — no nav, no auth gate.
  { path: "softres-pug", element: <SoftReservesPugPage /> },
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
