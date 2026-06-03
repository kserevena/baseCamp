# BaseCamp

A private family organiser Progressive Web App (PWA) built with Vue 3, designed for use on Android phones, tablets, and Chromebooks.

## Project Goals

BaseCamp helps families coordinate:
- **Shopping lists** — share a list, group by aisle, tick off items as you shop
- **Meal voting** — family members vote on what to eat, ingredients auto-add to the shopping list
- **Family coordination** — see who's buying what, stay in sync across all devices

The app works fully offline thanks to Firestore's IndexedDB persistence and a service worker. All family data syncs automatically when devices reconnect to the internet.

## Current Status

**Phase 0 — UI prototype** (in progress)

The app is a working prototype with mock data. The entire family can open the app on their real devices over local WiFi to provide feedback on look and feel before any backend work begins.

See `CLAUDE.md` for detailed project instructions, tech stack, and build phases.

## Getting Started

### Prerequisites
- Node.js 16+ and npm
- A modern browser (Chrome, Safari, Firefox)

### Start the app locally

```bash
npm install
npm run dev
```

The app will start at `http://localhost:5173`.

#### Access from other devices on WiFi

To test on phones, tablets, or other devices on the same network, use:

```bash
npm run dev -- --host
```

This binds the dev server to your network. Vite will display the local network URL (e.g., `http://192.168.1.100:5173`).

Alternatively, find your local IP manually:
- **Mac:** `ipconfig getifaddr en0`
- **Windows:** `ipconfig` (look for IPv4 Address)

Every file save hot-reloads all connected devices instantly.

### (Phase 1+) Start with Firebase emulator

Once Phase 1 begins, also run:

```bash
firebase emulators:start
```

in a separate terminal, then `npm run dev` in another.

## Tech Stack

- **UI:** Vue 3 (Composition API) + Vuetify 3
- **Build:** Vite with PWA plugin
- **Routing:** Vue Router 4
- **State:** Pinia
- **Backend:** Firebase (Firestore, Auth, Hosting)
- **Offline:** Service Worker + Firestore IndexedDB persistence

## Learn More

See `CLAUDE.md` for the full project spec, data structure, Firebase setup, and coding conventions.
