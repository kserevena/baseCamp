# BaseCamp

A private family organiser Progressive Web App (PWA) built with Vue 3, designed for use on Android phones, tablets, and Chromebooks.

## Project Goals

BaseCamp helps families coordinate:
- **Shopping lists** — share a list, group by aisle, tick off items as you shop
- **Meal voting** — family members vote on what to eat, ingredients auto-add to the shopping list
- **Family coordination** — see who's buying what, stay in sync across all devices

The app works fully offline thanks to Firestore's IndexedDB persistence and a service worker. All family data syncs automatically when devices reconnect to the internet.

## Current Status

| Phase | Status |
|---|---|
| Phase 0 — UI prototype | Complete |
| Phase 1 — Firebase data | Complete |
| Phase 2 — Authentication | Complete |
| Phase 3 — Packaging & deploy | Complete — live at https://basecamp-app-dev.web.app |

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

### Deploying Firestore security rules

The rules in `firestore.rules` must be deployed whenever they change:

```bash
firebase deploy --only firestore:rules
```

This is required after setting up the project for the first time (Phase 2), and any time access rules are updated.

### Production build (Phase 3)

```bash
npm run build
firebase deploy --only hosting
```

---

## Project structure

```
src/
├── main.js              # Entry point
├── App.vue              # Root — app bar, bottom nav, store lifecycle
├── components/          # Reusable UI pieces (FamilyAvatar, ShoppingItem, etc.)
├── views/               # Full-screen pages (Home, Shopping, Meals, Login, Setup)
├── stores/              # Pinia stores (auth, family, shopping, meals)
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
| `shoppingLists/{weekId}` | One document per week per family, with an `items/` subcollection |
| `meals/{mealId}` | Meal name, vote array, and family reference |

See `CLAUDE.md` for the full field-level schema and security rules.

---

## Tech Stack

- **UI:** Vue 3 (Composition API) + Vuetify 3
- **Build:** Vite with PWA plugin
- **Routing:** Vue Router 4
- **State:** Pinia
- **Backend:** Firebase (Firestore, Auth, Hosting)
- **Offline:** Service Worker + Firestore IndexedDB persistence
