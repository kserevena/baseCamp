# BaseCamp

A private family organiser Progressive Web App (PWA) built with Vue 3, designed for use on Android phones, tablets, and Chromebooks.

## Project Goals

BaseCamp helps families coordinate:
- **Shopping lists** — share a list, group by aisle, tick off items as you shop
- **Meal voting** — family members vote on what to eat, ingredients auto-add to the shopping list
- **Family coordination** — see who's buying what, stay in sync across all devices

The app works fully offline thanks to Firestore's IndexedDB persistence and a service worker. All family data syncs automatically when devices reconnect to the internet.

## Environments

The project has two Firebase environments:

| Environment | Firebase project | URL | Purpose |
|---|---|---|---|
| Dev | `basecamp-app-dev` | https://basecamp-app-dev.web.app | Development and testing |
| Prod | `basecamp-app-prod` | https://basecamp-app-prod.web.app | Real family use |

Both environments run independent Firestore databases and Auth instances — data never crosses between them.

> **Per-environment console setup.** Each Firebase project is configured separately. The setup steps below under **Dev Environment Setup** — enabling Google Sign-In (step 4) and the Google People API + age-range scope (step 5) — must be repeated for **every** project, including `basecamp-app-prod`. They are not inherited from dev.
>
> **The age-range scope is easy to miss.** Child detection (`isMinor` in `src/stores/auth.js`) **fails open**: if the `profile.agerange.read` scope is not registered and granted on a project, the People API returns no age data, every signer-in is treated as an adult, and there is **no error** — children would see the parent-only "Create family" option. After setting up a project, verify by signing in with a child account and confirming "Create family" is hidden.

### Setting up `.env.prod`

To deploy to prod, create a `.env.prod` file (gitignored) at the repo root:

```bash
cp .env.example .env.prod
```

Fill in the values from the `basecamp-app-prod` Firebase project. The keys are identical to `.env`; only the values differ. Vite picks up `.env.prod` automatically when you run `npm run deploy:prod`.

---

## Current Status

| Phase | Status |
|---|---|
| Phase 0 — UI prototype | Complete |
| Phase 1 — Firebase data | Complete |
| Phase 2 — Authentication | Complete |
| Phase 3 — Packaging & deploy | Complete — dev at https://basecamp-app-dev.web.app |
| Phase 4 — Pocket money | Complete — parent config, auto-payment calc, withdrawal recording, child read-only view |

See `CLAUDE.md` for full project spec, data structure, and coding conventions.

---

## Dev Environment Setup

### Prerequisites

- Node.js 18+
- npm
- A Firebase project (see below)
- Firebase CLI — needed to run the emulator and deploy rules:

```bash
npm install -g firebase-tools
firebase login
```

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd baseCamp
npm install
```

### 2. Create your Firebase project

1. Go to [firebase.google.com](https://firebase.google.com) and sign in
2. Create a new project (e.g. `basecamp-app-dev`)
3. Go to **Build → Firestore Database** and create a database in **test mode**
4. Go to **Project Settings → Your apps**, add a Web app, and copy the config

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your Firebase project values:

```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

`.env` is gitignored and never committed.

Optionally set `VITE_RECAPTCHA_SITE_KEY` to enable Firebase App Check (reCAPTCHA v3). It is skipped when unset or when `VITE_USE_EMULATOR=true`, so it is not needed for local development. Use a per-project key from Firebase Console → Build → App Check.

### 4. Enable Google Sign-In (Phase 2 onwards)

In the [Firebase Console](https://firebase.google.com):
1. Go to **Build → Authentication → Sign-in method**
2. Enable **Google** as a sign-in provider
3. Add `localhost` to the authorised domains if it isn't already there

### 5. Enable the Google People API (Phase 2 onwards)

Child detection at sign-in uses the Google People API to read age range data. This requires two steps in [Google Cloud Console](https://console.cloud.google.com) — make sure your Firebase project is selected in the project picker at the top.

**Enable the API:**
1. Go to **https://console.cloud.google.com/apis/library/people.googleapis.com**
2. Click **Enable**

**Register the scope on the OAuth consent screen:**
1. In Google Cloud Console, go to **APIs & Services → Google Auth Platform**
2. Click the **Data Access** tab
3. Add the scope `https://www.googleapis.com/auth/profile.agerange.read`
4. Save

> **Testing mode:** If your OAuth consent screen is set to Testing (the default for new projects), add any Google accounts that need to sign in as **test users** under **Google Auth Platform → Audience → Test users**. This includes child Family Link accounts.

### 6. Start the Firebase emulator and dev server

```bash
firebase emulators:start
npm run dev
```

Open `http://localhost:5173`. You will be redirected to the sign-in page. Sign in with your Google account, then create your family group.

To connect the app to the local emulator instead of the live Firebase project, set `VITE_USE_EMULATOR=true` in your `.env` file before starting the dev server. Without this variable, the app connects to the real Firebase project.

### 7. Access from other devices on the same WiFi

```bash
npm run dev -- --host
```

Vite will print a network URL (e.g. `http://192.168.1.100:5173`). Open that on any phone or tablet on the same network. Every file save hot-reloads all connected devices instantly.

Find your local IP manually if needed:
- **Windows:** `ipconfig` → IPv4 Address
- **Mac:** `ipconfig getifaddr en0`

### Running tests

**Unit tests** (no external dependencies required):

```bash
npm test
```

**Integration tests** (tests Firestore operations and security rules against a local emulator):

```bash
npm run test:integration
```

The emulator starts automatically, the tests run, and the emulator shuts down — no manual setup needed.

**Running the emulator for local development** (keeps the emulator UI available at `http://localhost:4000`):

```bash
firebase emulators:start
```

Then in a second terminal, set `VITE_USE_EMULATOR=true` in your `.env` file and run `npm run dev` to connect the app to the local emulator instead of the cloud project.

Integration tests load the real `firestore.rules` file into the emulator, so they verify that the rules you deploy are actually enforced correctly.

### Deploying the app

`deploy:dev` and `deploy:prod` are guarded: each one runs `npm install`, the unit tests, and the integration tests before building, and deploys the app **and** the Firestore rules + indexes together. This makes it impossible to ship with stale `node_modules`, with failing tests, or with the app and rules out of sync.

Always deploy to dev first and verify, then promote to prod.

```bash
# Deploy to dev (uses .env credentials) — app + rules + indexes
npm run deploy:dev

# Deploy to prod (uses .env.prod credentials) — app + rules + indexes
npm run deploy:prod
```

Because every deploy includes `firestore.rules` and `firestore.indexes.json`, rules can no longer drift out of sync with the deployed code. To deploy to prod you must first create a `.env.prod` file — see the **Environments** section below.

#### Deploying rules only

The unified deploy commands above are the normal path. If you only changed `firestore.rules` or `firestore.indexes.json` and want to push them without rebuilding the app, the rules-only scripts are still available:

```bash
npm run deploy:rules:dev
npm run deploy:rules:prod
```

---

## Contributing

All changes must go through a pull request — direct pushes to `main` are blocked by branch protection.

1. Create a feature branch from `main`.
2. Make your changes and run `npm test && npm run test:integration` locally.
3. Open a PR — CI runs both test suites automatically.
4. Merge only once CI passes. Merging is always a manual step.

---

## Project structure

```
src/
├── main.js              # Entry point
├── App.vue              # Root — app bar, bottom nav, store lifecycle
├── components/          # Reusable UI pieces (FamilyAvatar, ShoppingItem, etc.)
├── views/               # Full-screen pages (Home, Shopping, Meals, PocketMoney, Login, Setup)
├── stores/              # Pinia stores (auth, family, shopping, meals, pocketMoney)
├── router/              # Vue Router config and navigation guard
└── firebase/            # Firebase init (config.js) and emulator seed data (seed.js)
```

Tests live alongside the code they test in `__tests__/` subdirectories. See `CLAUDE.md` for the full file map.

---

## Data model

Data lives in five top-level Firestore collections:

| Collection | Purpose |
|---|---|
| `users/{uid}` | Maps each authenticated user to their `familyId` |
| `inviteCodes/{code}` | Maps an 8-character invite code to a `familyId` |
| `families/{familyId}` | Family name, invite code, and `members/` subcollection |
| `shoppingLists/{listId}` | One document per named list per family, with an `items/` subcollection |
| `meals/{mealId}` | Meal name, vote array, and family reference |

Pocket money config, balances, and transactions live under `families/{familyId}/pocketMoney/{childUid}` (and its `transactions/` subcollection).

See `CLAUDE.md` for the full field-level schema and security rules.

> **Pocket money runs in UTC.** Payment-day accrual is computed using UTC day boundaries so the amount can never double-count or skip a week when a device changes timezone. A payment therefore posts on UTC midnight rather than local midnight (cosmetic for a UK family; the amount is always correct). Supporting a family's own non-UTC timezone is tracked in [issue #15](https://github.com/kserevena/baseCamp/issues/15).

