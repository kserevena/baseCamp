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
| Phase 2 — Authentication | Not started |
| Phase 3 — Packaging & deploy | Not started |

See `CLAUDE.md` for full project spec, data structure, and coding conventions.

---

## Dev Environment Setup

### Prerequisites

- Node.js 18+
- npm
- A Firebase project (see below)

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

### 4. Start the dev server

```bash
npm run dev
```

On first run the app seeds Firestore with mock family data automatically. Open the URL printed by Vite (usually `http://localhost:5173`).

### 5. Access from other devices on the same WiFi

```bash
npm run dev -- --host
```

Vite will print a network URL (e.g. `http://192.168.1.100:5173`). Open that on any phone or tablet on the same network. Every file save hot-reloads all connected devices instantly.

Find your local IP manually if needed:
- **Windows:** `ipconfig` → IPv4 Address
- **Mac:** `ipconfig getifaddr en0`

### Production build

```bash
npm run build
firebase deploy --only hosting
```

---

## Tech Stack

- **UI:** Vue 3 (Composition API) + Vuetify 3
- **Build:** Vite with PWA plugin
- **Routing:** Vue Router 4
- **State:** Pinia
- **Backend:** Firebase (Firestore, Auth, Hosting)
- **Offline:** Service Worker + Firestore IndexedDB persistence
