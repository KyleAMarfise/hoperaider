# Hope Raid Tracker

Static TBC Classic raid signup site for GitHub Pages with Firebase Auth + Firestore.

## What this includes

- Shared live signup list (create, edit, delete)
- Admin-only raid creation page at `admin.html` (Phase 1-5 presets)
- Auto-generated gear/progression link fields shown in signup rows
- Google sign-in authentication for each visitor
- Firestore rules reject anonymous auth users
- Owner-only edits/deletes by default
- Optional admin access by UID
- Firestore rules and index config included

## Cost safety (important)

- Use Firebase **Spark** plan only.
- Do not add a payment method.
- Do not upgrade to Blaze.
- If quotas are exceeded, writes stop instead of billing.

## 1) Create Firebase project

1. Go to Firebase Console and create a project.
2. Enable **Authentication** → Sign-in method → **Google**.
3. In **Authentication** → **Settings** → **Authorized domains**, add every domain you use:
   - `localhost`
   - `127.0.0.1`
   - your GitHub Pages host (for example `yourname.github.io`)
   - any custom production domain
4. Enable **Firestore Database** in production mode.
5. In Project settings → General → Your apps, create a Web app and copy config values.

## 2) Configure this site

This project loads Firebase/app settings from a runtime config object (`window.__HOPE_RAID_CONFIG`).

Project structure notes:
- Local/dev runtime config: `config/local/`
- Production/runtime config: `config/prod/`
- Images/assets: `assets/images/`

### Local setup (.env)

1. Fill [ .env ](.env) values.
2. Generate local runtime config file:

```bash
./scripts/sync-env-to-config.sh
```

It now writes `config/local/app-config.local.js` (gitignored), loaded by all pages.

Security notes:
- Keep local/dev Firebase keys only in `.env`.
- Do not commit `.env` or `config/local/app-config.local.js`.
- If `.env` was ever committed before, untrack it once:

```bash
git rm --cached .env
git commit -m "Stop tracking local env file"
```

### CI / GitHub pipeline setup

Generate `config/prod/app-config.github.js` at deploy time from GitHub secrets/variables with the same keys used in `.env`. It is also loaded automatically by all pages.

The deploy workflow now builds a sanitized `.deploy` bundle and excludes:
- `.env` and `.env.*`
- `config/local/*`
- other local-only files/folders

This ensures local test settings never get published to GitHub Pages.

Workflow file included: [ .github/workflows/deploy-pages.yml ](.github/workflows/deploy-pages.yml)

Set these in GitHub repo **Settings → Secrets and variables → Actions**:

- **Secrets**
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_APP_ID`
- **Variables** (optional)
   - `APP_SITE_TITLE`
   - `APP_ADMIN_UIDS` (comma-separated UIDs)
   - `APP_DISCORD_INVITE_URL`

## 3) Apply Firestore rules/indexes

### Option A: Console (quick)

- Open Firestore → Rules and paste contents of [firestore.rules](firestore.rules).
- Open Firestore → Indexes and add the composite index from [firestore.indexes.json](firestore.indexes.json).

### Option B: Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules,firestore:indexes
```

## 4) Create repo + publish on GitHub Pages

1. Create a new GitHub repo.
2. Push this folder to `main`.
3. In repo **Settings → Pages** set **Source = GitHub Actions**.
4. Add Actions secrets/variables listed above.
5. Push to `main` (or run workflow manually from Actions tab).
6. Open your Pages URL and use `/admin.html` for the admin panel.

## 5) Add first admin UID (optional)

1. Open site once and copy your UID shown under the title.
2. Add that UID to `APP_ADMIN_UIDS` in local `.env` (for local) and GitHub variable `APP_ADMIN_UIDS` (for Pages deploy).
3. In Firestore, create document `admins/<YOUR_UID>` (any content) so rules allow raid admin writes.
4. Regenerate local runtime config with `./scripts/sync-env-to-config.sh`.

## Locked production setup (hoperaider.github.io)

Use this for a hardened production Firebase project that only serves your verified site domain.

1. Create a separate Firebase project for production.
2. In **Authentication → Sign-in method**, enable **Google**.
3. In **Authentication → Settings → Authorized domains**:
   - Keep `hoperaider.github.io`
   - Keep your custom production domain (if any)
   - Remove `localhost` and `127.0.0.1`
4. Deploy Firestore rules from this repo (rules already enforce non-anonymous sign-in and admin/member checks):

```bash
firebase deploy --only firestore:rules --project <YOUR_PROD_PROJECT_ID>
```

5. Add allowlisted users directly in Firestore:
   - Create `admins/<UID>` docs for raid/request admins.
   - Create `members/<UID>` docs for approved non-admin users.
6. Set production runtime config values/secrets for this project and include admin UIDs in `APP_ADMIN_UIDS`.
7. Deploy site and verify sign-in works from `https://hoperaider.github.io`.

Note: if someone copies your repo and runs it locally, they still cannot Google-auth against this production project unless localhost is added back to Authorized domains.

## TBC Phase raid presets

- Phase 1: Karazhan, Gruul's Lair, Magtheridon's Lair
- Phase 2: Serpentshrine Cavern, The Eye
- Phase 3: Hyjal Summit, Black Temple
- Phase 4: Zul'Aman
- Phase 5: Sunwell Plateau

## Data model

Collection: `signups`

Fields:
- `characterId` (string)
- `raidId` (string)
- `raidName` (string)
- `characterName` (string)
- `armoryUrl` (string, auto-generated from character name)
- `progressionUrl` (string, auto-generated placeholder/TBD)
- `raidDate` (string, YYYY-MM-DD)
- `wowClass` (string)
- `role` (string)
- `preferredDay1` (Monday-Sunday)
- `preferredStart1` (number, 0-23)
- `preferredEnd1` (number, 1-24)
- `preferredDay2` (Monday-Sunday)
- `preferredStart2` (number, 0-23)
- `preferredEnd2` (number, 1-24)
- `mainSpecialization` (string)
- `offSpecialization` (string)
- `status` (pending/confirmed/declined)
- `ownerUid` (string)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Collection: `raids`

Fields:
- `phase` (number, 1-5)
- `raidName` (string)
- `raidDate` (string, YYYY-MM-DD)
- `runType` (Progression/Farm/Weekly/Alt Run)
- `raidStart` (number, 0-23)
- `raidEnd` (number, 1-24)
- `raidSize` (string, ex: `25-man`)
- `createdByUid` (string)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

Collection: `characters`

Fields:
- `characterName` (string)
- `wowClass` (string)
- `role` (string)
- `mainSpecialization` (string)
- `offSpecialization` (string)
- `armoryUrl` (string)
- `progressionUrl` (string, optional)
- `preferredDay1` (Monday-Sunday)
- `preferredStart1` (number, 0-23)
- `preferredEnd1` (number, 1-24)
- `preferredDay2` (Monday-Sunday)
- `preferredStart2` (number, 0-23)
- `preferredEnd2` (number, 1-24)
- `ownerUid` (string)
- `createdAt` (timestamp)
- `updatedAt` (timestamp)

## Hardening options

- Turn on Firebase App Check for stronger abuse protection.
- Keep Firestore rules restrictive.
- Periodically remove old signup documents.
