/**
 * Theme loader — applies the production UI theme (Hybrid) to every page.
 *
 * The interactive theme-switcher UI that was used during evaluation has been
 * removed; the site now ships exclusively with the Hybrid look. To restore
 * the original Classic Tavern style, change PRODUCTION_THEME to "default".
 */
(function () {
  const PRODUCTION_THEME = "hybrid";

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", PRODUCTION_THEME);
  }

  function ensureGoogleFonts() {
    if (document.getElementById("theme-fonts-link")) return;
    const link = document.createElement("link");
    link.id = "theme-fonts-link";
    link.rel = "stylesheet";
    // Cinzel kept available for any heading rule that opts into it; the
    // Hybrid theme itself inherits the site's default Trebuchet MS.
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&display=swap";
    document.head.appendChild(link);
  }

  ensureGoogleFonts();
  applyTheme();
})();
