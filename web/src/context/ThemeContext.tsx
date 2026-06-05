import { useEffect } from "react";
import type { ReactNode } from "react";

// Ships exclusively with the Hybrid look (matches the old theme-switcher.js).
const PRODUCTION_THEME = "hybrid";

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", PRODUCTION_THEME);
    if (!document.getElementById("theme-fonts-link")) {
      const link = document.createElement("link");
      link.id = "theme-fonts-link";
      link.rel = "stylesheet";
      link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, []);
  return <>{children}</>;
}
