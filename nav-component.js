(function renderSharedNav() {
  const mount = document.getElementById("sharedNavRoot");
  if (!mount) {
    return;
  }

  const page = document.body?.dataset?.navPage || "signup";

  const discordIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M19.54 4.53A16.86 16.86 0 0 0 15.49 3c-.18.32-.4.75-.55 1.09a15.58 15.58 0 0 0-5.88 0c-.16-.34-.37-.77-.56-1.09a16.79 16.79 0 0 0-4.06 1.54C1.92 8.38 1.24 12.14 1.58 15.85A17 17 0 0 0 6.56 18.4c.4-.55.76-1.14 1.06-1.76a10.95 10.95 0 0 1-1.67-.8c.14-.1.28-.22.42-.33a12.03 12.03 0 0 0 11.25 0c.14.12.28.23.42.33-.53.31-1.09.58-1.68.8.31.62.66 1.21 1.06 1.76a16.94 16.94 0 0 0 4.99-2.55c.4-4.3-.68-8.02-2.87-11.32ZM8.96 13.58c-.9 0-1.63-.82-1.63-1.84 0-1.01.72-1.84 1.63-1.84.91 0 1.64.83 1.63 1.84 0 1.02-.72 1.84-1.63 1.84Zm6.08 0c-.9 0-1.63-.82-1.63-1.84 0-1.01.72-1.84 1.63-1.84.91 0 1.64.83 1.63 1.84 0 1.02-.72 1.84-1.63 1.84Z"/>
    </svg>
  `;

  const profileIcon = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 2l6.6 2.4v6.1c0 4.5-2.8 8.6-6.6 10.2-3.8-1.6-6.6-5.7-6.6-10.2V4.4L12 2Zm0 4.2a2.6 2.6 0 1 0 0 5.2 2.6 2.6 0 0 0 0-5.2Zm-3.8 8.9h7.6c-.6-1.5-2-2.4-3.8-2.4-1.8 0-3.2.9-3.8 2.4Z"/>
    </svg>
  `;

  const clockBlock = `
    <div class="nav-raid-clock" aria-live="polite">
      <p id="nextRaidLabel" class="nav-raid-label">Next raid pending…</p>
      <div class="nav-raid-time">
        <span class="nav-raid-days"><strong id="clockDays">00</strong>d</span>
        <span class="nav-raid-hms"><strong id="clockHours">00</strong>:<strong id="clockMinutes">00</strong>:<strong id="clockSeconds">00</strong></span>
      </div>
      <p id="nextRaidSubLabel" class="nav-raid-sub">Awaiting raid schedule…</p>
    </div>
  `;

  const signupActions = `
    <details class="nav-menu character-menu">
      <summary class="nav-button">Profile Manager</summary>
      <div class="nav-menu-panel character-menu-panel">
        <h2 id="formHeading" class="header-setup-heading">Profile Manager</h2>
        <div class="profile-workflow profile-workflow-compact">
          <label>
            Profile
            <select id="characterProfileSelect" name="characterProfileSelect">
              <option value="">Select profile</option>
            </select>
          </label>
          <div class="profile-workflow-actions">
            <button type="button" id="addCharacterButton" class="secondary">Create Profile</button>
            <button type="button" id="editProfileButton" class="secondary">Edit Profile</button>
            <button type="submit" id="saveButton" form="signupForm">Save Signup</button>
            <button type="button" id="cancelEditButton" class="secondary" hidden>Cancel Edit</button>
          </div>
          <small class="help-text">Create or edit a profile in the modal. Then use the Signup dropdown on a raid row.</small>
        </div>
        <p id="formMessage" class="message header-form-message"></p>
      </div>
    </details>

    <div id="adminMenu" class="nav-admin-links" hidden>
      <a id="adminRaidsLink" class="nav-button" href="admin.html" hidden>Raid Creator</a>
      <a id="adminOpsLink" class="nav-button" href="admin-operations.html" hidden>
        Requests &amp; Audit
        <span id="adminOpsBadge" class="nav-mini-badge" hidden>0</span>
      </a>
      <a id="adminSoftresLink" class="nav-button" href="admin-softres.html" hidden>Soft Reserves</a>
    </div>
  `;

  const adminActions = `
    <a class="nav-button" href="index.html">Signup Page</a>
    <a class="nav-button ${page === "admin-raids" ? "is-active" : ""}" href="admin.html">Raid Creator</a>
    <a id="adminOpsLink" class="nav-button ${page === "admin-operations" ? "is-active" : ""}" href="admin-operations.html">
      Requests &amp; Audit
      <span id="adminOpsBadge" class="nav-mini-badge" hidden>0</span>
    </a>
    <a class="nav-button ${page === "admin-softres" ? "is-active" : ""}" href="admin-softres.html">Soft Reserves</a>
  `;

  const authStatusId = page === "signup" ? "authStatus" : "adminAuthStatus";

  mount.innerHTML = `
    <div class="header-nav-bar">
      <div class="brand">
        <img class="brand-icon" src="assets/images/World%20of%20Warcraft%20Alliance.PNG" alt="Alliance crest" />
        <h1 id="siteTitle">Hope Raid Tracker</h1>
      </div>

      ${page === "signup" ? clockBlock : ""}

      <nav class="top-nav" aria-label="Primary navigation">
        <div class="nav-actions">
          ${page === "signup" ? signupActions : adminActions}

          <a
            id="guildDiscordLink"
            class="nav-button discord-button"
            href="https://discord.gg/xYtxu6Yj"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Guild Discord"
            title="Guild Discord"
          >
            ${discordIcon}
            Discord
          </a>

          <details class="nav-menu profile-menu">
            <summary class="profile-icon-button" aria-label="Profile menu" title="Profile menu">
              ${profileIcon}
            </summary>
            <div class="profile-menu-panel">
              <p class="profile-menu-muted">Account / Profile Menu</p>
              <p id="${authStatusId}" class="auth-status">Connecting...</p>
              <div class="auth-meta">
                <span id="currentUid" class="uid-chip" hidden></span>
                <button type="button" id="copyUidButton" class="secondary" hidden>Copy UID</button>
              </div>
              <div class="auth-actions">
                <button type="button" id="signOutButton" class="secondary" hidden>Sign Out</button>
              </div>
            </div>
          </details>
        </div>
      </nav>
    </div>
  `;
})();
