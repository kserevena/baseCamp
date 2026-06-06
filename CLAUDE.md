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
| Phase 2 — Authentication | **Complete** | Code complete on `phase-2-authentication` branch; enable Google Sign-In in Firebase Console to finish |
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
| Backend | Firebase (Firestore, Auth, Hosting) | Data, auth, hosting |
| Offline | Vite PWA plugin + Firestore IndexedDB persistence | Full offline support |
| Android wrapper | Android WebView APK (Android Studio) | Sideloaded onto phones and tablets |

Always use the **Vue 3 Composition API** (`<script setup>` syntax). Never use the
Options API. Always use `<script setup lang="ts">` if TypeScript is enabled.

---

## Project structure

```
baseCamp/
├── src/
│   ├── main.js                      # Entry point — registers plugins, starts auth listener
│   ├── App.vue                      # Root component — app bar, bottom nav, store lifecycle
│   ├── test-setup.js                # Vitest global setup (Vuetify polyfills)
│   ├── components/
│   │   ├── FamilyAvatar.vue         # Coloured avatar circle with member initials
│   │   ├── ShoppingItem.vue         # Single shopping list item (checkbox, name, qty, avatar)
│   │   ├── ShoppingList.vue         # Items grouped by aisle with section headers
│   │   └── MealVoting.vue           # Meal cards with vote button and voter avatars
│   ├── views/
│   │   ├── HomeView.vue             # Dashboard — shopping summary, top meal, family avatars
│   │   ├── LoginView.vue            # Google Sign-In page
│   │   ├── SetupView.vue            # Create or join a family (shown after first sign-in)
│   │   ├── ShoppingView.vue         # Shopping list — progress bar, list, add-item FAB
│   │   ├── MealsView.vue            # Meal voting wrapper
│   │   └── __tests__/
│   │       ├── LoginView.test.js
│   │       └── SetupView.test.js
│   ├── stores/
│   │   ├── auth.js                  # Firebase Auth — Google Sign-In, isMinor detection
│   │   ├── family.js                # Family membership, create/join, member colours
│   │   ├── shopping.js              # Shopping list items (weekly list, CRUD, aisle sort)
│   │   ├── meals.js                 # Meal suggestions and votes
│   │   └── __tests__/
│   │       ├── auth.test.js
│   │       ├── family.test.js
│   │       └── family.integration.test.js
│   ├── router/
│   │   ├── index.js                 # Vue Router — routes and auth guard
│   │   └── __tests__/
│   │       └── guard.test.js
│   └── firebase/
│       ├── config.js                # Firebase init, emulator wiring, IndexedDB persistence
│       └── seed.js                  # seedIfEmpty() — populates emulator with mock data
├── public/
│   ├── manifest.json                # PWA manifest
│   ├── icon-192.png
│   └── icon-512.png
├── android-wrapper/                 # Added in Phase 3 (Android Studio project)
├── firestore.rules                  # Firestore security rules — deploy with firebase deploy
├── firestore.indexes.json
├── vite.config.js
├── vitest.config.js                 # Unit test config (jsdom)
├── vitest.integration.config.js     # Integration test config (node, 15s timeout)
├── firebase.json                    # Emulator ports, hosting config
├── .firebaserc
├── .env                             # Firebase credentials — never commit
└── package.json
```

---

## Authentication flow

Understanding this flow is essential for any work on auth, routing, or store setup.

1. `src/main.js` calls `authStore.startAuthListener()` before mounting the app.
2. `startAuthListener` sets up Firebase `onAuthStateChanged`. It resolves an `authReady` promise when the initial auth state is known — this prevents routing decisions before Firebase has loaded the persisted session.
3. The router guard in `src/router/index.js` `await`s `authReady` on every navigation, then:
   - If not authenticated → redirect to `/login`
   - If authenticated → call `familyStore.resolveFamily(uid)` to look up `users/{uid}` in Firestore
   - If no family found → redirect to `/setup`
   - If family found → proceed to the requested route
4. `LoginView.vue` calls `authStore.signInWithGoogle()`, which opens a Google popup requesting the `profile.agerange.read` scope, then calls the Google People API to check whether the user is a minor. The `isMinor` flag is persisted to `localStorage` and restored by `startAuthListener` on subsequent visits.
5. `SetupView.vue` handles first-time setup:
   - **Create a family** (parents only — hidden when `isMinor` is true): writes a new `families/{id}` document and an `inviteCodes/{code}` document, then redirects home.
   - **Join a family** (all users): looks up the invite code in `inviteCodes`, adds the user to `families/{id}/members`, then redirects home.

---

## Store lifecycle

The three data stores (`family`, `shopping`, `meals`) all follow the same pattern:

- `setup(id)` — subscribes to Firestore via `onSnapshot`, populates reactive state
- `teardown()` — unsubscribes the listener, clears state

`App.vue` watches the `familyId` and calls `setup`/`teardown` when it changes. This keeps listeners clean and prevents stale data if a user somehow ends up in a different family context. Always call `teardown()` in `onUnmounted` when adding new listeners to a store.

---

## Firebase data structure

This schema is the contract between the app and the database. All devices — including ones that are offline and haven't updated yet — may hold documents in any previously deployed shape. Treat every field as potentially absent when reading, and follow the **schema evolution rules** below before changing anything.

```
users/{uid}
  familyId: string            ← maps each user to their family; written on create/join

inviteCodes/{code}            ← 8-character code (crypto-random, unambiguous alphabet)
  familyId: string

families/{familyId}
  name: string
  createdAt: timestamp
  inviteCode: string
  createdBy: uid              ← the creator; lets exactly this user seat themselves as parent
  members/{uid}
    name: string
    role: "parent" | "child"
    colour: string            ← hex, used for avatars throughout the app
    inviteCode: string        ← only on child members who joined; the code they used,
                                so the security rule can verify it maps to this family

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

## Firestore schema evolution

Firestore has no server-side schema enforcement. The app code and the `firestore.rules` file together are the contract. Because this is a PWA with IndexedDB persistence, devices can hold locally-cached documents in an old shape for an extended period — a family member's tablet might be offline for days. **Every schema change must be backward-compatible with all previously deployed document shapes**, or the migration must be complete before old-shaped documents can cause a failure.

### Safe changes — no migration needed

These can be deployed in a single release:

| Change | What to do in code |
|---|---|
| Add a new optional field | Read with a fallback: `data.newField ?? defaultValue`. Old documents return `undefined`, which the fallback handles. |
| Add a new collection | Old code ignores it. New code creates documents in it. |
| Relax a security rule (grant more access) | Deploy the new rules, then deploy the code. |
| Add a new index | Add to `firestore.indexes.json`, deploy with `firebase deploy --only firestore:indexes`. |

**Always read with a fallback.** Even when a field is "required" in the schema above, an old document might not have it. Every store that reads a Firestore document must use `data.field ?? defaultValue` rather than assuming the field exists. This is the single rule that makes the whole forward-compatibility story work.

### Breaking changes — use the expand–migrate–cut pattern

Never rename, remove, re-type, or restructure a field in a single deploy. Use three stages:

**Stage 1 — Expand:** Deploy code that writes *both* the old and new field (or collection) simultaneously. Read the new field with a fallback to the old one. Update security rules to allow both paths. At this point all clients — whether on the old or new code — continue to work.

**Stage 2 — Migrate:** Once the expanded code is live on all devices, backfill existing documents so they carry the new field. Run the migration script in the Firebase console or browser console (see below). Verify every document has been updated before proceeding.

**Stage 3 — Cut:** Deploy code that only writes and reads the new field. Remove writes to the old field. Tighten security rules if needed. Delete the old field from documents if it is sensitive or costly to store.

### Writing a migration script

There is no Cloud Functions layer yet. Run migrations as a one-off script from the browser console while connected to production (use `VITE_USE_EMULATOR=false` and ensure you are signed in as a parent):

```js
// Example: backfill a new `displayOrder` field on all meal documents for a family
import { collection, getDocs, updateDoc, doc } from 'firebase/firestore'
import { db } from './src/firebase/config.js'

const snap = await getDocs(collection(db, 'meals'))
let i = 0
for (const d of snap.docs) {
  if (d.data().displayOrder == null) {
    await updateDoc(doc(db, 'meals', d.id), { displayOrder: i++ })
  }
}
console.log('Migration complete')
```

Always test the script against the emulator first (`VITE_USE_EMULATOR=true`). Use `if (field == null)` guards so re-running the script is safe. After the migration, run `npm run test:integration` to confirm the rules still pass against the migrated shape.

### Security rules and schema changes

If a rule reads a field on an existing document (e.g. `resource.data.createdBy`), old documents that predate that field will have the field as `null`, causing the rule to deny. Before tightening a rule that checks a new field, either:
- Ensure the migration has already backfilled that field onto all existing documents, or
- Write the rule to handle the `null` case explicitly: `resource.data.createdBy == null || resource.data.createdBy == request.auth.uid`.

Test rule changes against both old-shaped and new-shaped documents in the integration tests.

---

## Firestore security rules

The live rules are in `firestore.rules`. Deploy them after any change:

```bash
firebase deploy --only firestore:rules
```

Access summary:

| Collection | Who can read | Who can write |
|---|---|---|
| `users/{uid}` | Owner only | Owner only |
| `inviteCodes/{code}` | Any signed-in user (single `get` only — no listing/enumeration) | Existing family member |
| `families/{familyId}` | Family members | Anyone signed-in who stamps `createdBy` as themselves (create); parents (update) |
| `families/{familyId}/members/{uid}` | Family members | Parents (any member); the family `createdBy` user seating themselves as parent; a user seating themselves as `child` with a valid invite code; self-updates that don't change `role` |
| `shoppingLists/{listId}` | Family members | Family members (create/update); parents (delete) |
| `shoppingLists/{listId}/items/{itemId}` | Family members | Family members (create/update); parents (delete) |
| `meals/{mealId}` | Family members | Family members (create/update); parents (delete) |

Two helper functions drive most rules:
- `isFamilyMember(familyId)` — checks `families/{familyId}/members/{uid}` exists
- `isParent(familyId)` — checks the member's `role` field equals `"parent"`

**Member self-writes are tightly constrained — this is the core of the access model.** A user
who is not yet a member can only seat *themselves* (`uid == request.auth.uid`), and only via
one of two paths: as `parent` if they are the family's `createdBy` (first-run setup), or as
`child` if they present an `inviteCode` that maps to this family. They cannot self-promote to
parent and cannot change their own `role` on update. Without these constraints, any signed-in
Google user could insert themselves into any family as a parent — invite codes are therefore
also `get`-only (never listable) so the codes and their familyIds cannot be enumerated.

---

## Testing

Run tests before every commit. Do not commit if tests are failing.

```bash
npm test                  # unit tests (no external dependencies)
npm run test:integration  # integration tests (auto-starts/stops emulator)
npm run test:watch        # unit tests in watch mode during development
```

| File | Type | Covers |
|---|---|---|
| `src/stores/__tests__/auth.test.js` | Unit | Auth listener, Google Sign-In popup, People API isMinor detection, localStorage persistence, sign-out |
| `src/stores/__tests__/family.test.js` | Unit | `resolveFamily`, `currentUser` computed, `createFamily`, `joinFamily` |
| `src/stores/__tests__/family.integration.test.js` | Integration | All Firestore security rules verified against the emulator |
| `src/views/__tests__/LoginView.test.js` | Unit | Sign-in button, post-login navigation, loading state, error snackbar |
| `src/views/__tests__/SetupView.test.js` | Unit | Create/join family forms, child account (hide create), error handling |
| `src/router/__tests__/guard.test.js` | Unit | Unauthenticated redirect, family/no-family redirect, `resolveFamily` call timing |

Integration tests load the real `firestore.rules` file into the emulator. They verify that the rules you will deploy are actually enforced — if you change `firestore.rules`, the integration tests will catch any unintended access regressions.

---

## Firebase emulator

Emulator ports (defined in `firebase.json`):

| Service | Port |
|---|---|
| Auth | 9099 |
| Firestore | 8080 |
| Hosting | 5000 |
| Emulator UI | 4000 |

To connect the app to the local emulator instead of the cloud project, set `VITE_USE_EMULATOR=true` in your environment (`.env` or `.env.local`). The connection is wired in `src/firebase/config.js` using `connectFirestoreEmulator` and `connectAuthEmulator`.

`src/firebase/seed.js` exports a `seedIfEmpty()` function that checks whether the emulator already has data and, if not, writes mock family members, shopping items, and meals. It is called from the browser console or from test setup as needed.

---

## Offline behaviour

Two mechanisms work together to provide full offline support:

1. **Service worker** caches all app shell files on first visit. Configured via the Vite PWA plugin. `registerType: 'autoUpdate'` delivers updates silently.

2. **Firestore IndexedDB persistence** (`persistentLocalCache()` in `src/firebase/config.js`) caches all family data locally. Offline writes are queued and synced automatically when connectivity returns.

When writing Firestore operations, never block the UI waiting for a write to complete. Write optimistically (update Pinia state immediately) and let Firestore sync in the background. Do not show error states for normal offline writes.

Conflict resolution is last-write-wins. For a shopping list this is acceptable — if two people tick the same item while offline, the last sync wins and the item ends up ticked, which is the correct outcome.

---

## Vite config

`vite.config.js` uses three plugins: `@vitejs/plugin-vue`, `vite-plugin-vuetify` (with `autoImport: true`), and `vite-plugin-pwa`. The PWA plugin uses `registerType: 'autoUpdate'` and caches all JS, CSS, HTML, images, and fonts via Workbox. The `@` alias resolves to `src/`.

---

## Android WebView wrapper (Phase 3)

The `android-wrapper/` folder is a minimal Android Studio project. Its sole job is to open the Firebase Hosting URL in a full-screen WebView.

Key requirements for MainActivity.java:
- Enable JavaScript
- Enable DOM storage (required for Firebase Auth session persistence)
- Use WebViewClient to keep all navigation inside the WebView
- Use Chrome Custom Tabs for the Google Sign-In OAuth step (not the WebView itself — Google blocks OAuth inside a plain WebView; the Firebase Auth SDK handles this automatically when used in browser context)
- Handle the back button to navigate within the WebView rather than exit the app

The APK is sideloaded — never published to the Play Store. Google Family Link's app-approval process does not apply to sideloaded APKs.

---

## Keeping documentation current

Documentation is part of the code. Update it in the same commit as the change that makes it stale.

**When a build phase completes** — update the status table in both `CLAUDE.md` and `README.md`.

**When files are added, removed, or moved** — update the **Project structure** section in `CLAUDE.md`. Include new test files, stores, views, components, and config files.

**When the Firestore data model changes** (new collection, new field, renamed field, removed field) — update the **Firebase data structure** section in `CLAUDE.md` and the **Data model** table in `README.md`. If the change is not purely additive, document the migration plan in the PR description and follow the expand–migrate–cut pattern in the **Firestore schema evolution** section.

**When security rules change** — update the access summary table in the **Firestore security rules** section of `CLAUDE.md`. Always deploy rules after changing them: `firebase deploy --only firestore:rules`.

**When new tests are added** — add a row to the testing table in the **Testing** section of `CLAUDE.md`.

**When environment variables change** — update the `.env` block in `README.md` step 3 and the `VITE_USE_EMULATOR` explanation in step 6.

**When npm scripts change** — update the **Development workflow** section in `CLAUDE.md` and the **Running tests** / **Production build** sections in `README.md`.

**When the authentication or store lifecycle changes** — update the **Authentication flow** and **Store lifecycle** sections in `CLAUDE.md`.

**What goes where:**
- `README.md` — developer setup guide: prerequisites, env vars, how to run locally, how to test, how to deploy. No implementation detail.
- `CLAUDE.md` — everything a coding agent or maintainer needs to work on the project: architecture, data model, conventions, security rules, test coverage. No step-by-step history of how past phases were built.

---

## Development workflow

```bash
# Install dependencies
npm install

# Start Firebase emulator (Auth + Firestore) — needed for sign-in and data
firebase emulators:start

# Start Vite dev server (in a separate terminal)
npm run dev
# → http://localhost:5173

# Expose dev server on the local network (for testing on phones/tablets)
npm run dev -- --host
# → Vite will print a network URL, e.g. http://192.168.1.100:5173

# Run unit tests
npm test

# Run integration tests (auto-starts and stops emulator)
npm run test:integration

# Deploy security rules after changing firestore.rules
firebase deploy --only firestore:rules

# Production build and deploy (Phase 3)
npm run build
firebase deploy --only hosting
```

Finding your local IP:
- Windows: `ipconfig` → IPv4 Address
- Mac: `ipconfig getifaddr en0`
- Linux/WSL: `ip addr show` → inet address

Every file save hot-reloads all connected devices instantly.

---

## Phase 3 — packaging and deployment

**Goal: deploy to Firebase Hosting and sideload the Android APK.**

Steps:
1. Run `npm run build` — Vite builds the production bundle with service worker
2. Run `firebase deploy --only hosting` — live at `yourapp.web.app`
3. Whitelist the Firebase Hosting URL in Google Family Link if web restrictions are enabled on children's accounts
4. Build the thin Android WebView APK in Android Studio (see Android wrapper section)
5. Enable "Install from unknown sources" on each Android device
6. Sideload the APK onto phones and tablets
7. Test offline: turn on aeroplane mode, use the app, reconnect, verify sync

**Phase 3 ends when:** every family device has the app installed, offline mode works, and the whole family can use it for the actual weekly shop.

---

## Coding conventions

- **Vue 3 Composition API only** — always `<script setup>` syntax, never Options API
- **Component names** — PascalCase files and usage (`ShoppingItem.vue`, `<ShoppingItem />`)
- **Pinia stores** — Composition API style (`defineStore` with `ref` and `computed`)
- **Firestore listeners** — use `onSnapshot` for real-time data; always unsubscribe in `onUnmounted` to prevent memory leaks
- **Family colour system** — every member has a `colour` hex; use it consistently for avatars, badges, and vote indicators everywhere in the UI
- **Aisle ordering** — default sort is `aisleOrder` ascending, then `priority`. Parents can customise aisle order; persist changes to Firestore.
- **Offline writes** — update Pinia state immediately, fire Firestore write in background, do not await in a way that blocks the UI
- **Firestore security rules** — whenever application logic changes who can read or write data (new collections, new roles, new access patterns), update `firestore.rules` in the same change. Rules and code must stay in sync. After updating rules, remind the user to deploy them with `firebase deploy --only firestore:rules`
- **Defensive Firestore reads** — always read document fields with a fallback (`data.field ?? defaultValue`). Devices with offline-cached documents may have an older schema shape; never assume a field is present even if it is "required" in the data model.
- **Tests** — any new functionality or modification to existing functionality must be accompanied by tests. Unit tests live alongside the code in `__tests__/` directories. Run `npm test` before every commit and do not commit if tests are failing.

---

## UI design principles

- Mobile-first — design for a phone screen, verify on tablet and Chromebook
- Touch targets — all interactive elements at least 44px tall for comfortable tapping
- Family colours — avatars and vote indicators always use the member's colour
- "From meal" badge — items auto-added from meal voting show a purple badge
- Progress indicator — show items ticked vs total at the top of the shopping view
- Aisle grouping — group items by aisle with a clear section header when sorted by store layout
- Keep it friendly and clear — children use this app too

---

## Future milestones (do not build yet)

- Meal voting screen and auto-add ingredients to shopping list
- Family chat
- Family event organiser and calendar
- Individual birthday and Christmas wish lists shareable with grandparents
- Chores list
- Pocket money management
