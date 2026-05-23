/**
 * Theme switcher — floating button in the bottom-right that lets you cycle
 * through alternative UI themes for evaluation. Persists choice in localStorage.
 * Themes are defined in styles/themes.css; "default" leaves the html with no
 * data-theme attribute and uses the existing Classic Tavern styles.
 */
(function () {
  const STORAGE_KEY = "hope-ui-theme";

  const THEMES = [
    { id: "default",      label: "Classic Tavern",       hint: "Original (current production)" },
    { id: "polished",     label: "Polished",             hint: "Glassmorphism + micro-interactions" },
    { id: "dragonflight", label: "Dragonflight HUD",     hint: "Modern WoW retail look" },
    { id: "hybrid",       label: "Hybrid (Polished × DF)", hint: "Glass cards + bronze gold treatment" },
  ];

  function applyTheme(themeId) {
    const root = document.documentElement;
    if (themeId === "default") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", themeId);
    }
  }

  function getSavedTheme() {
    try { return localStorage.getItem(STORAGE_KEY) || "default"; } catch { return "default"; }
  }

  function saveTheme(themeId) {
    try { localStorage.setItem(STORAGE_KEY, themeId); } catch {}
  }

  function ensureGoogleFonts() {
    if (document.getElementById("theme-fonts-link")) return;
    const link = document.createElement("link");
    link.id = "theme-fonts-link";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:wght@400;600&family=IM+Fell+English&family=JetBrains+Mono:wght@400;700&family=Orbitron:wght@600;700&display=swap";
    document.head.appendChild(link);
  }

  function renderSwitcher(currentTheme) {
    const wrap = document.createElement("div");
    wrap.className = "theme-switcher";
    wrap.innerHTML = `
      <button type="button" class="theme-switcher-btn" id="themeSwitcherBtn">
        <span aria-hidden="true">&#127912;</span> Theme
      </button>
      <div class="theme-switcher-panel" id="themeSwitcherPanel" role="menu"></div>
    `;
    document.body.appendChild(wrap);

    const panel = wrap.querySelector("#themeSwitcherPanel");
    const btn = wrap.querySelector("#themeSwitcherBtn");

    function rebuildOptions(active) {
      panel.innerHTML = THEMES.map(t => `
        <button type="button" class="theme-switcher-option ${t.id === active ? "active" : ""}" data-theme-id="${t.id}">
          ${t.label}
          <small>${t.hint}</small>
        </button>
      `).join("");
      panel.querySelectorAll(".theme-switcher-option").forEach(opt => {
        opt.addEventListener("click", () => {
          const id = opt.dataset.themeId;
          applyTheme(id);
          saveTheme(id);
          rebuildOptions(id);
          panel.classList.remove("open");
        });
      });
    }

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      panel.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) panel.classList.remove("open");
    });

    rebuildOptions(currentTheme);
  }

  function init() {
    ensureGoogleFonts();
    const current = getSavedTheme();
    applyTheme(current);
    if (document.body) {
      renderSwitcher(current);
    } else {
      document.addEventListener("DOMContentLoaded", () => renderSwitcher(current));
    }
  }

  // Apply saved theme as early as possible to avoid flash
  ensureGoogleFonts();
  applyTheme(getSavedTheme());

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
