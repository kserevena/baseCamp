# BaseCamp — Claude Code Instructions

This is a family organiser Progressive Web App (PWA) built with Vue 3 and hosted on
Firebase Hosting. Family devices install it via the browser's "Add to Home Screen" flow.

---

## Quick reference

- **Stack:** Vue 3 (`<script setup>` only), Vite, Vuetify 3, Pinia, Firebase (Firestore + Auth + Hosting)
- **Users:** Parents (Android), children (Fire tablets via Google Family Link), Chromebook
- **Run:** `npm test` then `npm run test:integration` before every commit
- **Deploy:** Dev is manual — always ask first, then `npm run deploy:dev`. Prod auto-deploys on every merge to `main` via `.github/workflows/deploy-prod.yml` (also runnable manually with `npm run deploy:prod` from `main`)
- **Key complexity:** `src/stores/pocketMoney.js` uses UTC-based date math — read `src/stores/CLAUDE.md` before touching
- **Schema changes:** Follow expand–migrate–cut in "Firestore schema evolution" below
- **Offline:** Update Pinia state immediately, fire Firestore write in background, never await write in UI
- **Theme:** "BaseCamp" is a provisional name — do not apply outdoor/camping visual theme

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
│   │   ├── AisleManager.vue         # Parent-only drag-and-drop aisle CRUD; shown in a bottom sheet in ShoppingView
│   │   ├── ShoppingItem.vue         # Single shopping list item (checkbox, name, qty, avatar)
│   │   ├── ShoppingList.vue         # Items grouped by aisle with section headers
│   │   ├── MealVoting.vue           # Meal cards with vote button and voter avatars
│   │   └── __tests__/
│   ├── views/
│   │   ├── HomeView.vue             # Dashboard — shopping summary, top meal, family avatars
│   │   ├── LoginView.vue            # Google Sign-In page
│   │   ├── SetupView.vue            # Create or join a family (shown after first sign-in)
│   │   ├── ShoppingView.vue         # Shopping list — list, add-item FAB, manage aisles
│   │   ├── MealsView.vue            # Meal voting wrapper
│   │   ├── PocketMoneyView.vue      # Pocket money — parent overview & config, child balance view
│   │   ├── CLAUDE.md                # UI design principles; PocketMoneyView complexity notes
│   │   └── __tests__/
│   ├── composables/
│   │   ├── useFirestoreListener.js    # subscribe(ref, handler) / unsubscribeAll() — used by every data store
│   │   ├── useServiceWorkerUpdate.js  # SW update polling: controllerchange reload, visibilitychange + hourly check
│   │   ├── useUserRole.js             # isParent/isChild computed derived from family.currentUser
│   │   └── __tests__/
│   ├── constants/
│   │   └── roles.js                  # ROLE_PARENT / ROLE_CHILD — the Firestore role string contract
│   ├── utils/
│   │   ├── currency.js               # formatGBP() — formats a number as "£x.xx"
│   │   ├── date.js                   # formatDate() — formats a Timestamp/Date as "9 Jun 2026"
│   │   ├── env.js                    # isDev — true when VITE_USE_EMULATOR=true or project ID contains "dev"
│   │   ├── paymentSchedule.js        # pendingPaymentDates() — pure UTC date math for pocket money accrual
│   │   └── __tests__/
│   ├── styles/
│   │   └── utilities.css             # Shared CSS utilities (flex gap classes), imported in main.js
│   ├── stores/
│   │   ├── auth.js                  # Firebase Auth — Google Sign-In, isMinor detection
│   │   ├── family.js                # Family membership, create/join, member colours
│   │   ├── shopping.js              # Shopping list items (weekly list, CRUD, aisle sort, aisle management)
│   │   ├── meals.js                 # Meal suggestions and votes
│   │   ├── pocketMoney.js           # Pocket money snapshots, auto-payment calc, withdrawal recording
│   │   ├── CLAUDE.md                # pocketMoney UTC math + transaction safety; shopping store internals
│   │   └── __tests__/
│   ├── router/
│   │   ├── index.js                 # Vue Router — routes and auth guard
│   │   └── __tests__/
│   └── firebase/
│       ├── config.js                # Firebase init, App Check, emulator wiring, IndexedDB persistence
│       ├── seed.js                  # seedIfEmpty() — populates emulator with mock data
│       └── CLAUDE.md                # App Check rollout; emulator ports and connection
├── docs/
│   └── cloud-screenshots.md         # Playwright setup guide for cloud/remote sessions
├── scripts/
│   ├── check-dev-env.mjs            # Preflight guard run by deploy:dev (validates .env)
│   ├── check-prod-env.mjs           # Preflight guard run by deploy:prod (validates .env.prod)
│   └── __tests__/
│       └── check-dev-env.test.mjs   # Unit tests for check-dev-env validation logic
├── public/
│   └── icon-192.png, icon-512.png
├── firestore.rules                  # Firestore security rules
├── firestore.indexes.json
├── vite.config.js
├── vitest.config.js                 # Unit test config (jsdom)
├── vitest.integration.config.js     # Integration test config (node, 15s timeout)
├── firebase.json                    # Emulator ports, hosting config
├── .github/
│   ├── workflows/
│   │   ├── ci.yml                   # Runs unit + integration tests on every PR
│   │   ├── deploy-dev.yml           # Manual workflow_dispatch deploy to basecamp-app-dev
│   │   └── deploy-prod.yml          # Auto-deploys to basecamp-app-prod on push to main; also workflow_dispatch
│   └── dependabot.yml
├── .env                             # Dev Firebase credentials — never commit
├── .env.prod                        # Prod Firebase credentials — never commit
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
   - **`isMinor` fails open by design.** If the People API call fails or returns no age data, `isMinor` defaults to `false` (treated as adult) with no error. This means the `profile.agerange.read` scope must be registered and granted on **each** Firebase project (a per-environment console step — see README); if it is missing on a project, children are silently treated as adults there. Note this is a UX guard only — the parent-only "Create family" restriction is enforced client-side, not in `firestore.rules`.
   - Children use Google Family Link managed accounts — these work fine via the browser OAuth flow without Play Store involvement.
5. `SetupView.vue` handles first-time setup:
   - **Create a family** (parents only — hidden when `isMinor` is true): writes a new `families/{id}` document and an `inviteCodes/{code}` document, then redirects home.
   - **Join a family** (all users): looks up the invite code in `inviteCodes`, adds the user to `families/{id}/members`, then redirects home.

---

## Store lifecycle

The data stores (`family`, `shopping`, `meals`, `pocketMoney`) all follow the same pattern:

- `setup(...)` — subscribes to Firestore via `onSnapshot`, populates reactive state
- `teardown()` — unsubscribes the listener, clears state

Listener lifecycle is managed by `useFirestoreListener()` (`src/composables/useFirestoreListener.js`), which each store creates once at the module level. `subscribe(ref, handler)` starts a listener and returns an individual unsubscribe function; `unsubscribeAll()` stops all active listeners at once. Every `setup()` calls `unsubscribeAll()` first (safe re-entry), and every `teardown()` calls `unsubscribeAll()`. When adding a new store, use the same composable rather than hand-rolling `let unsubscribe = null`.

`App.vue` watches `familyId` and calls `setup`/`teardown` on `shopping` and `meals` when it changes. Always call `teardown()` in `onUnmounted` when adding new listeners to a store.

**`pocketMoney` store exception:** `pocketMoney.setup(familyId, currentUser)` requires the user's `role` to decide whether to subscribe to the whole collection (parent) or a single document (child). `role` is only available after the `families/{familyId}/members` snapshot fires — which happens asynchronously after `familyId` becomes non-null. `App.vue` therefore watches `family.currentUser` (not `familyId`) to set up the pocketMoney store.

**`pocketMoney` write semantics and UTC date math** — payment accrual is UTC-anchored (do not change to local time; tracked in GitHub issue #15). Full detail in `src/stores/CLAUDE.md`.

**`shopping` store internals** — see `src/stores/CLAUDE.md`.

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

shoppingLists/{listId}        ← auto-generated ID
  familyId: string
  name: string                ← user-provided name; set by a parent when creating the list
  createdAt: timestamp
  createdBy: uid
  aisles: Array<{ name: string, order: number }> | absent
                              ← per-list aisle config; absent on old docs → store falls back
                                to DEFAULT_AISLES. Written on list creation and by saveAisles().
  items/{itemId}
    name: string
    qty: string
    aisle: string
    aisleOrder: number        ← for sorting by store layout; 99 = Unknown (items from deleted aisles)
    done: boolean
    addedBy: uid
    fromMeal: string | null   ← meal document ID if auto-added
    sortOrder: number | null  ← custom drag-drop position within aisle; absent = sort by name
    createdAt: timestamp

meals/{mealId}
  familyId: string
  name: string
  votes: string[]             ← array of uids who voted
  ingredients: string[]       ← auto-added to list when enough votes

families/{familyId}/pocketMoney/{uid}   ← config + running balance snapshot per child
  weeklyAmount: number                  ← amount added each payment day
  paymentDay: number                    ← 0 = Sunday … 6 = Saturday
  balance: number                       ← last persisted total (does not include pending payments);
                                          written as increment() deltas, never absolute values
  lastUpdated: timestamp                ← payments accrued through this date; written only by
                                          flushPendingPayments and first-time saveConfig —
                                          withdrawals do NOT touch it

families/{familyId}/pocketMoney/{uid}/transactions/{txnId}
                                        ← txnId is payment-YYYY-MM-DD for payments (deterministic,
                                          idempotent re-flush); auto-generated for withdrawals
  type: "payment" | "withdrawal"
  amount: number                        ← always positive; type gives direction
  date: timestamp                       ← payment: the actual weekday date; withdrawal: when recorded
  recordedBy: uid | null                ← null for auto-payments; parent uid for withdrawals
  note: string | null                   ← optional; used for withdrawals
```

---

## Firestore schema evolution

Firestore has no server-side schema enforcement. The app code and the `firestore.rules` file together are the contract. Because this is a PWA with IndexedDB persistence, devices can hold locally-cached documents in an old shape for an extended period — a family member's tablet might be offline for days. **Every schema change must be backward-compatible with all previously deployed document shapes**, or the migration must be complete before old-shaped documents can cause a failure.

### Safe changes — no migration needed

| Change | What to do in code |
|---|---|
| Add a new optional field | Read with a fallback: `data.newField ?? defaultValue`. Old documents return `undefined`, which the fallback handles. |
| Add a new collection | Old code ignores it. New code creates documents in it. |
| Relax a security rule (grant more access) | Deploy the new rules, then deploy the code. |
| Add a new index | Add to `firestore.indexes.json`, deploy with `firebase deploy --only firestore:indexes`. |

**Always read with a fallback.** Even when a field is "required" in the schema above, an old document might not have it. Every store that reads a Firestore document must use `data.field ?? defaultValue` rather than assuming the field exists.

### Breaking changes — use the expand–migrate–cut pattern

Never rename, remove, re-type, or restructure a field in a single deploy. Use three stages:

**Stage 1 — Expand:** Write both old and new field simultaneously. Read the new field with a fallback to the old one. Update security rules to allow both paths.

**Stage 2 — Migrate:** Once expanded code is live on all devices, backfill existing documents. Run the migration as a one-off script from the browser console while connected to production (import `{ db }` from `./src/firebase/config.js`; test against the emulator first; use `if (field == null)` guards for idempotency).

**Stage 3 — Cut:** Deploy code that only writes and reads the new field. Remove writes to the old field. Tighten security rules if needed.

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
| `shoppingLists/{listId}` | Family members | Parents (create/update/delete) |
| `shoppingLists/{listId}/items/{itemId}` | Family members | Parents only (create/update/delete); `name` capped at 80 chars (enforced in rules — keep in sync with `ITEM_NAME_MAX_LENGTH` in `src/constants/shopping.js`) |
| `meals/{mealId}` | Family members | Family members (create/update); parents (delete) |
| `families/{familyId}/pocketMoney/{uid}` | Parents (any child); child (own only) | Parents only |
| `families/{familyId}/pocketMoney/{uid}/transactions/{txnId}` | Parents (any child); child (own only) | Parents only |

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

Run **both** test suites before every commit. Do not commit if any tests are failing. Always run unit tests first; only proceed to integration tests once they pass.

```bash
npm test                  # unit tests (no external dependencies) — run first
npm run test:integration  # integration tests (auto-starts/stops emulator) — run after unit tests pass
npm run test:watch        # unit tests in watch mode during development
```

Integration tests load the real `firestore.rules` file into the emulator. They verify that the rules you will deploy are actually enforced — if you change `firestore.rules`, the integration tests will catch any unintended access regressions.

---

## Offline behaviour

Two mechanisms work together to provide full offline support:

1. **Service worker** caches all app shell files on first visit. Configured via the Vite PWA plugin with `registerType: 'autoUpdate'` and `clientsClaim: true`. `App.vue` calls `useServiceWorkerUpdate()` on mount, which adds a `controllerchange` → `reload` listener, a `visibilitychange` check, and an hourly `setInterval` — ensuring devices pick up new deploys without a manual refresh.

2. **Firestore IndexedDB persistence** (`persistentLocalCache()` in `src/firebase/config.js`) caches all family data locally. Offline writes are queued and synced automatically when connectivity returns.

When writing Firestore operations, never block the UI waiting for a write to complete. Write optimistically (update Pinia state immediately) and let Firestore sync in the background. Do not show error states for normal offline writes.

Conflict resolution is last-write-wins. For a shopping list this is acceptable — if two people tick the same item while offline, the last sync wins and the item ends up ticked, which is the correct outcome.

---

## Device installation

All devices install BaseCamp as a PWA via the browser's "Add to Home Screen" flow:

| Device | Browser | How to install |
|---|---|---|
| Android phones | Chrome | Accept the install banner, or Menu → Add to Home Screen |
| Fire tablets | Silk | Menu → Add to Home Screen (no automatic prompt) |
| Chromebook | Chrome | Click the install icon in the address bar |

Once installed, the app launches in standalone mode (no browser chrome) and works fully offline.

An Android WebView APK was considered for Fire tablets but skipped in favour of the simpler PWA install path. If Silk proves unreliable for sign-in or offline behaviour, revisit the APK approach.

---

## Keeping documentation current

Update documentation in the same commit as the change that makes it stale.

| Trigger | What to update |
|---|---|
| File added/removed/moved | **Project structure** in this file |
| Firestore data model changed | **Firebase data structure** here + **Data model** in `README.md`; follow expand–migrate–cut for breaking changes |
| Security rules changed | **Firestore security rules** access table here; deploy to both environments |
| Auth or store lifecycle changed | Relevant section here + subdirectory `CLAUDE.md` |
| Env vars changed | `.env` block in `README.md` steps 3 & 6 |
| npm scripts changed | **Development workflow** here + `README.md` |

**What goes where:** `README.md` — setup guide only · `CLAUDE.md` (root) — architecture, data model, conventions · `src/stores/CLAUDE.md` — store internals · `src/views/CLAUDE.md` — UI principles · `src/firebase/CLAUDE.md` — App Check, emulator · `docs/cloud-screenshots.md` — cloud session screenshot guide

---

## Development workflow

**Git workflow.** All changes to the app must go through pull requests — never commit or push directly to `main`. The `main` branch has GitHub branch protection enabled: direct pushes are blocked and CI must pass before a PR can be merged. Work on a feature branch, open a PR, wait for CI to go green, then merge manually. Never merge a PR without explicit decision to do so. **Merging to `main` automatically deploys to prod** (see `deploy-prod.yml` below) — there is no separate manual deploy step afterward, so merging is itself a production deploy decision.

**Branch naming.** Name branches after the work being done, not after the session. Use kebab-case prefixed with a short type: `feature/`, `fix/`, or `chore/`. Examples: `feature/parent-only-shopping-items`, `fix/pocket-money-utc-rounding`, `chore/update-firestore-indexes`. Never use auto-generated session names like `claude/dreamy-davinci-*`. **Before pushing to GitHub or opening a PR**, always confirm the working branch has an appropriate name — if it doesn't, create a correctly-named branch from the current HEAD and push that instead.

**CI.** GitHub Actions runs `npm test` then `npm run test:integration` automatically on every pull request. CI must pass before merging.

**Deploy workflows.** `.github/workflows/deploy-dev.yml` is manual-only: a `workflow_dispatch` trigger for deploying from the GitHub Actions UI (Actions tab → select workflow → Run workflow). `.github/workflows/deploy-prod.yml` runs automatically on every push to `main` (i.e. every merged PR) and can also be triggered manually via `workflow_dispatch`. **Merging a PR to `main` deploys to production — there is no separate approval step.** Both workflows mirror their local `deploy:dev` / `deploy:prod` script counterparts: env preflight check, `npm test`, `npm run test:integration`, build, then `firebase deploy --only hosting,firestore:rules,firestore:indexes`. The prod workflow refuses to run on any branch other than `main`. Both require three repository secrets: `DEV_ENV_FILE` / `PROD_ENV_FILE` (full contents of `.env` / `.env.prod`) and `FIREBASE_TOKEN` (from `firebase login:ci`).

Because prod deploys are no longer a separate manual step, the safety net for production is entirely upstream of the merge: CI (`npm test` + `npm run test:integration`) must pass on the PR, branch protection requires that check, and the **backward-compatibility checklist** below must be satisfied before merging. Treat "merge to `main`" with the same care you'd give a manual prod deploy — there is no second chance to back out before it goes live.

**Working in a git worktree?** The `.env` file is gitignored (never committed), so a freshly created worktree will not have it — the dev server will fail without the Firebase credentials. After creating a worktree, copy `.env` over from the main checkout so the dev environment can run (note the `.env` file may not exist in the main checkout — if it's missing, the credentials must be obtained separately):

```bash
cp /path/to/main-checkout/.env .env
```

**Running integration tests in a cloud/remote session (e.g. Claude Code on the web)?** The `firebase` CLI is not pre-installed in cloud containers. Install it globally before running `npm run test:integration`:

```bash
npm install -g firebase-tools
npm run test:integration
```

**Taking screenshots in a cloud/remote session.** There is no display server; use Playwright (Puppeteer is **not** installed). Key environment facts:
- Playwright module: `/opt/node22/lib/node_modules/playwright`
- Chromium binary: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
- Use `domcontentloaded` (not `networkidle0`) — the Firestore WebSocket keeps the connection open
- Sign in via the emulator REST API to get a real `idToken`, inject via `addInitScript` into `localStorage` before navigating
- Full boilerplate (env setup, seeding, script template, PR upload steps): `docs/cloud-screenshots.md`

```bash
# Install dependencies
npm ci

# Start Firebase emulator (Auth + Firestore) — needed for sign-in and data
firebase emulators:start

# Start Vite dev server (in a separate terminal)
npm run dev
# → http://localhost:5173

# Expose dev server on the local network (for testing on phones/tablets)
npm run dev -- --host

# Run unit tests
npm test

# Run integration tests (auto-starts and stops emulator)
npm run test:integration

# Deploy to dev environment (build uses .env)
# Runs npm ci + unit tests + integration tests, then deploys
# hosting + firestore:rules + firestore:indexes together.
npm run deploy:dev

# Deploy to prod environment (build uses .env.prod)
# Same guardrails as deploy:dev, preceded by the .env.prod preflight check.
npm run deploy:prod

# Rules-only escape hatch (app NOT rebuilt) — use only when no app code changed
npm run deploy:rules:dev
npm run deploy:rules:prod
```

**Deploy guardrails.** Both `deploy:dev` and `deploy:prod` run an env preflight check before anything else (`scripts/check-dev-env.mjs` and `scripts/check-prod-env.mjs` respectively), then run `npm run deploy:checks` (`npm ci && npm test && npm run test:integration`) before building, and deploy `hosting,firestore:rules,firestore:indexes` in a single command. This guarantees the env file is present and points at the correct Firebase project, dependencies match the lockfile, all tests pass, and rules can never drift out of sync with the deployed app. Do not bypass these by calling `vite build` + `firebase deploy` directly.

**Always ask the user before deploying to any environment.** Never run `npm run deploy:*` or `firebase deploy` without explicit confirmation first. This includes `deploy:dev`, `deploy:prod`, `deploy:rules:dev`, `deploy:rules:prod`, and any `firebase deploy` invocation — deployments affect live devices and shared infrastructure. **Merging a PR to `main` now triggers an automatic prod deploy** (see `deploy-prod.yml` above) — treat "merge this PR" as equivalent to "deploy to prod" and get explicit confirmation before merging, the same as you would before running `npm run deploy:prod` directly.

**Production deployments (`deploy:prod` and `deploy:rules:prod`) must only be run from the `main` branch.** Always verify with `git branch --show-current` before deploying to production.

**Before every deploy — including merging a PR to `main`, since that now deploys to prod automatically — run this backward-compatibility checklist.** If the answer to any question is "yes", follow the **Firestore schema evolution** section before proceeding — do not deploy (or merge) until the check passes.

1. Does this change remove, rename, or re-type any field in an existing Firestore document?
2. Does this change add a field that existing code reads without a `?? defaultValue` fallback?
3. Does this change add a security rule condition that reads a field not present on all existing documents?
4. Does this change restructure a subcollection (move, rename, or merge)?

If all four answers are "no", the change is safe to deploy as-is. Document the check outcome in the PR description.

**Rules changes must reach both environments.** `deploy:dev` and `deploy:prod` already deploy `firestore.rules` and `firestore.indexes.json` alongside the app, so a normal deploy to each environment keeps rules in sync with code. Only use the rules-only scripts (`deploy:rules:dev` / `deploy:rules:prod`) when rules changed but no app code did — and run both so the two environments don't diverge.

---

## Coding conventions

- **Vue 3 Composition API only** — always `<script setup>` syntax, never Options API
- **Component names** — PascalCase files and usage (`ShoppingItem.vue`, `<ShoppingItem />`)
- **Pinia stores** — Composition API style (`defineStore` with `ref` and `computed`)
- **Firestore listeners** — use `onSnapshot` for real-time data; always unsubscribe in `onUnmounted` to prevent memory leaks
- **Family colour system** — every member has a `colour` hex; use it consistently for avatars, badges, and vote indicators everywhere in the UI
- **Aisle ordering** — items sort by `aisleOrder` ascending, then `sortOrder`, then name. Deleted-aisle items go to `{ aisle: 'Unknown', aisleOrder: 99 }`. Store falls back to `DEFAULT_AISLES` when `aisles` field absent on old documents.
- **Offline writes** — update Pinia state immediately, fire Firestore write in background, do not await in a way that blocks the UI
- **Firestore security rules** — whenever application logic changes who can read or write data, update `firestore.rules` in the same change. Deploy to both environments after updating rules.
- **Defensive Firestore reads** — always read document fields with a fallback (`data.field ?? defaultValue`). Devices with offline-cached documents may have an older schema shape; never assume a field is present even if it is "required" in the data model.
- **Tests** — unit tests live alongside the code in `__tests__/` directories. Run `npm test` then `npm run test:integration` before every commit. Do not commit if any tests are failing.
- **npm install vs npm ci** — Use `npm ci` to install dependencies before running tests, building, or any task where installing is a prerequisite rather than the goal. Only use `npm install` (or `npm install <pkg>`) when the explicit task is to add or update a dependency; commit the resulting `package-lock.json` change in that same PR.
- **`package.json` `overrides`** — `protobufjs` is pinned to `7.6.3` via an `overrides` entry (with an adjacent `_overridesNote` explaining why) to fix GHSA-f38q-mgvj-vph7 / CVE-2026-54269, a transitive dependency introduced by `firebase` → `@firebase/firestore` → `@grpc/proto-loader`. Dependabot couldn't auto-fix this because the latest stable `firebase` release (12.14.0 as of 2026-06-16) still resolves the vulnerable `protobufjs@7.6.2`. Remove the override once a stable `firebase` release transitively pulls in `protobufjs>=7.6.3` — verify with `npm ls protobufjs` after bumping `firebase`.
