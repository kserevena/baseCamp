# BaseCamp — Claude Code Instructions

This is a family organiser Progressive Web App (PWA) built with Vue 3, wrapped in a
thin Android WebView APK for sideloading onto family devices. This file tells you
everything you need to know to build, run, and extend the project.

---

## Build progress

| Phase | Status | Notes |
|---|---|---|
| Phase 0 — UI prototype | **Complete** | Scaffold complete; family skipped advanced UX features, moving to Firebase |
| Phase 1 — Firebase data | **Complete** | Real-time Firestore sync confirmed across devices |
| Phase 2 — Authentication | Not started | |
| Phase 3 — Packaging & deploy | Not started | |

---

> **Working title:** BaseCamp. The name and visual theme are provisional and will
> be revisited once the app is built and in use by the family. Do not apply any
> outdoor or camping visual theme to the UI — keep the design clean and neutral
> until a theme is decided. Use the name BaseCamp in code, file names, and the
> PWA manifest only.

---

## Project overview

BaseCamp is a private family app used by two parents (on Android phones) and children (on Amazon
Fire tablets), plus a Chromebook. The app is delivered as a PWA hosted on Firebase
Hosting. Android devices run a thin WebView APK wrapper that loads the hosted URL.
All devices work fully offline thanks to Firestore's IndexedDB persistence and a
Vite-generated service worker.

Authentication uses Google Sign-In via Firebase Auth. Parents use standard Google
accounts. Children use Google Family Link managed accounts — these work fine via the
browser OAuth flow without Play Store involvement.

---

## Tech stack

| Layer | Technology | Purpose |
|---|---|---|
| UI framework | Vue 3 (Composition API) | App components and views |
| Build tool | Vite | Dev server, bundling, PWA generation |
| UI components | Vuetify 3 | Mobile-friendly component library |
| Routing | Vue Router 4 | Screen navigation |
| State | Pinia | Shared app state |
| Backend | Firebase (Firestore, Auth, Hosting, Functions) | Data, auth, hosting |
| Offline | Vite PWA plugin + Firestore IndexedDB persistence | Full offline support |
| Android wrapper | Android WebView APK (Android Studio) | Sideloaded onto phones and tablets |

Always use the **Vue 3 Composition API** (`<script setup>` syntax). Never use the
Options API. Always use `<script setup lang="ts">` if TypeScript is enabled.

---

## Build phases — do these in order

The project is built in four distinct phases. Do not skip ahead. Each phase ends
with something the whole family can see and react to on real devices.

### Phase 0 — UI prototype (NO backend, NO auth, NO Firebase)

**Goal: get the app looking right on real devices as fast as possible.**

The entire family should be able to open the app on their phones and tablets over
local WiFi and give feedback on the look and feel before any backend work begins.

How it works:
- All data is hardcoded in Pinia stores as plain JavaScript arrays
- The family store contains a mock "current user" so the app behaves as if someone
  is logged in
- Vue Router has no auth guard — every route is freely accessible
- No Firebase, no `.env` file, no emulator — just `npm run dev`

The mock family store (src/stores/family.js) during this phase:

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFamilyStore = defineStore('family', () => {
  const currentUser = ref({
    uid: 'mock_dad',
    name: 'Dad',
    role: 'parent',
    colour: '#378ADD',
  })

  const members = ref([
    { uid: 'mock_dad',  name: 'Dad',  role: 'parent', colour: '#378ADD' },
    { uid: 'mock_mum',  name: 'Mum',  role: 'parent', colour: '#1D9E75' },
    { uid: 'mock_ella', name: 'Ella', role: 'child',  colour: '#D4537E' },
    { uid: 'mock_sam',  name: 'Sam',  role: 'child',  colour: '#EF9F27' },
  ])

  return { currentUser, members }
})
```

The mock shopping store (src/stores/shopping.js) during this phase:

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShoppingStore = defineStore('shopping', () => {
  const items = ref([
    { id: '1', name: 'Milk',            qty: '2 pints', aisle: 'Dairy',      aisleOrder: 1, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { id: '2', name: 'Cheddar cheese',  qty: '400g',    aisle: 'Dairy',      aisleOrder: 1, done: false, addedBy: 'mock_mum',  fromMeal: 'bolognese' },
    { id: '3', name: 'Chicken thighs',  qty: '1kg',     aisle: 'Meat',       aisleOrder: 2, done: false, addedBy: 'mock_mum',  fromMeal: 'roast' },
    { id: '4', name: 'Bacon',           qty: '300g',    aisle: 'Meat',       aisleOrder: 2, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { id: '5', name: 'Pasta',           qty: '500g',    aisle: 'Dry goods',  aisleOrder: 3, done: false, addedBy: 'mock_ella', fromMeal: 'bolognese' },
    { id: '6', name: 'Tinned tomatoes', qty: 'x2',      aisle: 'Dry goods',  aisleOrder: 3, done: false, addedBy: 'mock_mum',  fromMeal: 'bolognese' },
    { id: '7', name: 'Bread',           qty: '1 loaf',  aisle: 'Bakery',     aisleOrder: 4, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { id: '8', name: 'Apples',          qty: '6 pack',  aisle: 'Fruit & veg',aisleOrder: 5, done: false, addedBy: 'mock_sam',  fromMeal: null },
    { id: '9', name: 'Broccoli',        qty: '1 head',  aisle: 'Fruit & veg',aisleOrder: 5, done: false, addedBy: 'mock_mum',  fromMeal: null },
  ])

  function toggleDone(id) {
    const item = items.value.find(i => i.id === id)
    if (item) item.done = !item.done
  }

  function addItem(name, qty = '', aisle = 'Dry goods') {
    items.value.push({
      id: Date.now().toString(),
      name, qty, aisle,
      aisleOrder: 3,
      done: false,
      addedBy: 'mock_dad',
      fromMeal: null,
    })
  }

  return { items, toggleDone, addItem }
})
```

The mock meals store (src/stores/meals.js) during this phase:

```javascript
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([
    { id: 'm1', name: 'Pasta bolognese', votes: ['mock_dad', 'mock_mum', 'mock_ella', 'mock_sam'] },
    { id: 'm2', name: 'Roast chicken',   votes: ['mock_mum', 'mock_dad'] },
    { id: 'm3', name: 'Bacon sandwiches',votes: ['mock_dad', 'mock_sam'] },
    { id: 'm4', name: 'Veggie stir fry', votes: ['mock_ella'] },
  ])

  function toggleVote(mealId, uid) {
    const meal = meals.value.find(m => m.id === mealId)
    if (!meal) return
    const idx = meal.votes.indexOf(uid)
    if (idx >= 0) meal.votes.splice(idx, 1)
    else meal.votes.push(uid)
  }

  return { meals, toggleVote }
})
```

Vue Router during this phase — no auth guard, no login redirect:

```javascript
// src/router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ShoppingView from '@/views/ShoppingView.vue'
import MealsView from '@/views/MealsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',         component: HomeView },
    { path: '/shopping', component: ShoppingView },
    { path: '/meals',    component: MealsView },
    // LoginView is not included yet — added in Phase 2
  ],
})
```

**Phase 0 ends when:** the family has opened the app on their real devices over local
WiFi, ticked items off the shopping list, voted on meals, and given feedback on how
it looks and feels. Incorporate any UI feedback before moving to Phase 1.

---

### Phase 1 — Firebase data (real sync, still no auth)

**Goal: replace mock store data with live Firestore data. Still no login screen.**

The family store still uses the hardcoded mock current user. But shopping list and
meal data now comes from Firestore via `onSnapshot` listeners, so changes on one
device appear instantly on all others.

Set up Firebase:
1. Create a Firebase project at firebase.google.com
2. Enable Firestore (start in test mode — open rules, tightened in Phase 2)
3. Add Firebase config to `.env` (never commit this file)
4. Run `firebase emulators:start` locally during development

Seed Firestore with the same mock data from Phase 0 so the UI looks identical.
Replace the Pinia store arrays with `onSnapshot` listeners.

Firestore test-mode rules (Phase 1 only — replaced in Phase 2):
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;  // TEMPORARY — Phase 1 only
    }
  }
}
```

**Phase 1 ends when:** changes on one device appear on another in real time, with
no login required.

---

### Phase 2 — authentication

**Goal: add Google Sign-In, family groups, and proper Firestore security rules.**

Steps:
1. Enable Google Sign-In in Firebase Authentication console
2. Build `LoginView.vue` with a Google Sign-In button
3. Add Vue Router auth guard — redirect to `/login` if no active session
4. On sign-in success, check Firestore for a `families` document containing the uid
5. If found: load family into Pinia store, redirect to home
6. If not found: show "Create or join a family" screen
   - Create: write new `families` document, generate 6-digit invite code
   - Join: look up family by invite code, add uid to `members`
7. Replace Firestore open rules with proper security rules (see Security rules section)
8. Remove mock current user from family store — replace with real Firebase Auth user

Auth state is persisted by Firebase automatically across sessions and app restarts.

Use Chrome Custom Tabs for the Google OAuth flow on Android (not a plain WebView —
Google blocks OAuth inside WebView). The Firebase Auth SDK handles this automatically
when used in a browser context.

**Phase 2 ends when:** every family member can sign in with their Google account,
the family group is created, and Firestore rules prevent unauthorised access.

---

### Phase 3 — packaging and deployment

**Goal: deploy to Firebase Hosting and sideload the Android APK.**

Steps:
1. Run `npm run build` — Vite builds the production bundle with service worker
2. Run `firebase deploy --only hosting` — live at `yourapp.web.app`
3. Whitelist the Firebase Hosting URL in Google Family Link if web restrictions
   are enabled on children's accounts
4. Build the thin Android WebView APK in Android Studio (see Android wrapper section)
5. Enable "Install from unknown sources" on each Android device
6. Sideload the APK onto phones and tablets
7. Test offline: turn on aeroplane mode, use the app, reconnect, verify sync

**Phase 3 ends when:** every family device has the app installed, offline mode works,
and the whole family can use it for the actual weekly shop.

---

## Project structure

```
basecamp/
├── src/
│   ├── components/          # Reusable building blocks
│   │   ├── ShoppingItem.vue
│   │   ├── ShoppingList.vue
│   │   ├── MealVoting.vue
│   │   └── FamilyAvatar.vue
│   ├── views/               # Full screens / pages
│   │   ├── HomeView.vue
│   │   ├── ShoppingView.vue
│   │   ├── MealsView.vue
│   │   └── LoginView.vue    ← added in Phase 2
│   ├── stores/              # Pinia stores
│   │   ├── family.js        # Current user, family members, roles
│   │   ├── shopping.js      # Shopping list items
│   │   └── meals.js         # Meal suggestions and votes
│   ├── router/
│   │   └── index.js         # Vue Router — auth guard added in Phase 2
│   ├── firebase/            # Created in Phase 1
│   │   ├── config.js        # Firebase init + offline persistence
│   │   ├── auth.js          # Google Sign-In helpers
│   │   └── firestore.js     # Firestore read/write helpers
│   ├── App.vue              # Root component, bottom navigation bar
│   └── main.js              # Entry point, plugin registration
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── icon-192.png
│   └── icon-512.png
├── android-wrapper/         # Added in Phase 3
│   ├── MainActivity.java
│   └── AndroidManifest.xml
├── vite.config.js
├── firebase.json            # Added in Phase 1
├── .firebaserc
├── .env                     # Firebase credentials — never commit
└── package.json
```

---

## Firebase data structure

All family data lives in Firestore. This shape is fixed — do not deviate from it.

```
families/{familyId}
  name: string
  createdAt: timestamp
  inviteCode: string          ← 6-digit code for joining
  members/{uid}
    name: string
    role: "parent" | "child"
    colour: string            ← hex, used for avatars throughout the app

shoppingLists/{weekId}        ← weekId format: "YYYY-week-WW"
  familyId: string
  weekOf: string              ← ISO date of Monday
  items/{itemId}
    name: string
    qty: string
    aisle: string
    aisleOrder: number        ← for sorting by store layout
    priority: number
    done: boolean
    addedBy: uid
    fromMeal: string | null   ← meal document ID if auto-added
    createdAt: timestamp

meals/{mealId}
  familyId: string
  name: string
  votes: string[]             ← array of uids who voted
  ingredients: string[]       ← auto-added to list when enough votes
```

---

## Firebase setup (Phase 1 onwards)

### Initialisation (src/firebase/config.js)

```javascript
import { initializeApp } from 'firebase/app'
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
export const auth = getAuth(app)

enableIndexedDbPersistence(db).catch((err) => {
  if (err.code === 'failed-precondition') {
    console.warn('Offline persistence failed: multiple tabs open')
  } else if (err.code === 'unimplemented') {
    console.warn('Offline persistence not supported in this browser')
  }
})
```

`.env` file (never commit):
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Firestore security rules (Phase 2 onwards)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isFamilyMember(familyId) {
      return request.auth != null &&
        exists(/databases/$(database)/documents/families/$(familyId)/members/$(request.auth.uid));
    }
    function isParent(familyId) {
      return isFamilyMember(familyId) &&
        get(/databases/$(database)/documents/families/$(familyId)/members/$(request.auth.uid)).data.role == 'parent';
    }
    match /families/{familyId} {
      allow read: if isFamilyMember(familyId);
      allow create: if request.auth != null;
      allow update: if isParent(familyId);
      match /members/{uid} {
        allow read: if isFamilyMember(familyId);
        allow write: if isParent(familyId);
      }
    }
    match /shoppingLists/{listId} {
      allow read, create, update: if isFamilyMember(resource.data.familyId);
      allow delete: if isParent(resource.data.familyId);
      match /items/{itemId} {
        allow read, create, update: if isFamilyMember(get(/databases/$(database)/documents/shoppingLists/$(listId)).data.familyId);
        allow delete: if isParent(get(/databases/$(database)/documents/shoppingLists/$(listId)).data.familyId);
      }
    }
    match /meals/{mealId} {
      allow read, create, update: if isFamilyMember(resource.data.familyId);
      allow delete: if isParent(resource.data.familyId);
    }
  }
}
```

---

## Offline behaviour

Two mechanisms work together to provide full offline support:

1. **Service worker** caches all app shell files on first visit. Configured via the
   Vite PWA plugin. `registerType: 'autoUpdate'` delivers updates silently.

2. **Firestore IndexedDB persistence** caches all family data locally. Offline
   writes are queued and synced automatically when connectivity returns.

When writing Firestore operations, never block the UI waiting for a write to
complete. Write optimistically (update Pinia state immediately) and let Firestore
sync in the background. Do not show error states for normal offline writes.

Conflict resolution is last-write-wins. For a shopping list this is acceptable —
if two people tick the same item while offline, the last sync wins and the item
ends up ticked, which is the correct outcome anyway.

---

## Vite config (with PWA plugin)

```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    vuetify({ autoImport: true }),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'BaseCamp',
        short_name: 'BaseCamp',
        theme_color: '#1D9E75',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
})
```

---

## Android WebView wrapper (Phase 3)

The `android-wrapper/` folder is a minimal Android Studio project. Its sole job is
to open the Firebase Hosting URL in a full-screen WebView.

Key requirements for MainActivity.java:
- Enable JavaScript
- Enable DOM storage (required for Firebase Auth session persistence)
- Use WebViewClient to keep all navigation inside the WebView
- Use Chrome Custom Tabs for the Google Sign-In OAuth step (not the WebView itself —
  Google blocks OAuth inside a plain WebView; the Firebase Auth SDK handles this
  automatically when used in browser context)
- Handle the back button to navigate within the WebView rather than exit the app

The APK is sideloaded — never published to the Play Store. Google Family Link's
app-approval process does not apply to sideloaded APKs.

---

## README

`README.md` is the developer-facing setup guide. Keep it accurate as the project evolves:
- Update the **Current Status** table whenever a phase changes
- Update the **Dev Environment Setup** section whenever the local setup steps change (new env vars, new prerequisites, new startup commands, new services)
- Do not add implementation detail to README — that belongs in CLAUDE.md

---

## Development workflow

```bash
# Phase 0 — no Firebase needed
npm install
npm run dev
# → http://localhost:5173 on laptop
# → http://YOUR_LOCAL_IP:5173 on any device on the same WiFi

# Phase 1 onwards — start Firebase emulator alongside Vite
firebase emulators:start
npm run dev

# Production build and deploy (Phase 3)
npm run build
firebase deploy --only hosting
```

Finding your local IP:
- Windows: `ipconfig` → IPv4 Address
- Mac: `ipconfig getifaddr en0`

Every file save hot-reloads all connected devices instantly.

---

## Coding conventions

- **Vue 3 Composition API only** — always `<script setup>` syntax, never Options API
- **Component names** — PascalCase files and usage (`ShoppingItem.vue`, `<ShoppingItem />`)
- **Pinia stores** — Composition API style (`defineStore` with `ref` and `computed`)
- **Firestore listeners** — use `onSnapshot` for real-time data; always unsubscribe
  in `onUnmounted` to prevent memory leaks
- **Family colour system** — every member has a `colour` hex; use it consistently
  for avatars, badges, and vote indicators everywhere in the UI
- **Aisle ordering** — default sort is `aisleOrder` ascending, then `priority`.
  Parents can customise aisle order; persist changes to Firestore.
- **Offline writes** — update Pinia state immediately, fire Firestore write in
  background, do not await in a way that blocks the UI

---

## UI design principles

- Mobile-first — design for a phone screen, verify on tablet and Chromebook
- Touch targets — all interactive elements at least 44px tall for comfortable tapping
- Family colours — avatars and vote indicators always use the member's colour
- "From meal" badge — items auto-added from meal voting show a purple badge
- Progress indicator — show items ticked vs total at the top of the shopping view
- Aisle grouping — group items by aisle with a clear section header when sorted
  by store layout
- Keep it friendly and clear — children use this app too

---

## Notes for working with a child co-developer

ShoppingItem.vue is the ideal first coding task — self-contained, immediately
visual, and produces a satisfying result on screen quickly.

Good early tasks for the child:
- Phase 0: styling ShoppingItem.vue — colour, layout, the tick animation
- Phase 0: the FamilyAvatar.vue component — coloured circle with initials
- Phase 0: the progress bar at the top of ShoppingView.vue

Keep explanations concrete: "when we replace the mock data with Firebase, tapping
that checkbox will update a database on the internet and everyone's phone will
change at the same time."

The real-time sync moment in Phase 1 — two devices side by side, one change
appearing on both — is a key motivating milestone. Make it a deliberate event.

---

## Future milestones (do not build yet)

- Meal voting screen and auto-add ingredients to shopping list
- Family chat
- Family event organiser and calendar
- Individual birthday and Christmas wish lists shareable with grandparents
- Chores list
- Pocket money management
