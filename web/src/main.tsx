import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import { router } from "./routes/router";

// The tuned WoW parchment theme (vendored from the original site into web/ so this
// app is self-contained), then our responsive fixes + nav styling on top.
import "./styles/styles.css";
import "./styles/themes.css";
import "./styles/globals.responsive.css";
import "./styles/wow-nav.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <AuthProvider>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </AuthProvider>
  </React.StrictMode>
);
