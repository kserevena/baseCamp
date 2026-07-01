# BaseCamp — Claude Code Instructions

This is a family organiser Progressive Web App (PWA) built with Vue 3 and hosted on
Firebase Hosting. Family devices install it via the browser's "Add to Home Screen" flow.

---

## Quick reference

- **Stack:** Vue 3 (`<script setup>` only), Vite, Vuetify 3, Pinia, Firebase (Firestore + Auth + Hosting)
- **Users:** Parents (Android), children (Fire tablets via Google Family Link), Chromebook
- **Run:** `npm test` then `npm run test:integration` before every commit
- **Deploy:** Dev deploys via PR label — add `deploy-to-dev` to a PR to deploy that branch to dev (`deploy-to-dev` is removed on success; `on-dev` is added to show what is live, and removed automatically if a new commit is pushed to that PR). Dev can also be triggered manually via the Actions UI. Always ask before deploying. Prod auto-deploys on every merge to `main` via `.github/workflows/deploy-prod.yml` (also runnable manually with `npm run deploy:prod` from `main`)
- **Key complexity:** `src/stores/pocketMoney.js` uses UTC-based date math — read `src/stores/CLAUDE.md` before touching
- **Schema changes:** Follow expand–migrate–cut in `docs/schema.md` before any rename, removal, or restructure
- **Offline:** Update Pinia state immediately, fire Firestore write in background, never await write in UI
- **Theme:** "BaseCamp" is a provisional name — do not apply outdoor/camping visual theme

---

## Project structure

See `docs/project-structure.md` for the annotated file tree.

Key subdirectory docs: `src/stores/CLAUDE.md` (store internals), `src/views/CLAUDE.md` (UI principles), `src/firebase/CLAUDE.md` (emulator/App Check).

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

The data stores (`family`, `shopping`, `pocketMoney`) all follow the same pattern:

- `setup(...)` — subscribes to Firestore via `onSnapshot`, populates reactive state
- `teardown()` — unsubscribes the listener, clears state

`App.vue` watches `familyId` and calls `setup`/`teardown` on `shopping` and `jobs` when it changes. Always call `teardown()` in `onUnmounted` when adding new listeners to a store.

**`pocketMoney` store exception:** `pocketMoney.setup(familyId, currentUser)` requires the user's `role` to decide whether to subscribe to the whole collection (parent) or a single document (child). `role` is only available after the `families/{familyId}/members` snapshot fires — which happens asynchronously after `familyId` becomes non-null. `App.vue` therefore watches `family.currentUser` (not `familyId`) to set up the pocketMoney store.

**`pocketMoney` write semantics and UTC date math** — payment accrual is UTC-anchored (do not change to local time; tracked in GitHub issue #15). Full detail in `src/stores/CLAUDE.md`.

**`shopping` store internals** — see `src/stores/CLAUDE.md`.

---

## Firebase data structure

Full schema and collection conventions: `docs/schema.md`.

Key rules that apply everywhere:
- Always read fields with a fallback: `data.field ?? defaultValue` — offline-cached documents may be in an older shape.
- New family-scoped collections must be subcollections of `families/{familyId}/`, not root-level.
- Before any rename, removal, re-type, or restructure: follow the expand–migrate–cut pattern in `docs/schema.md`.

---

## Firestore security rules

Full access table and self-write security model: `docs/security-rules.md`.

Two helper functions drive most rules:
- `isFamilyMember(familyId)` — checks `families/{familyId}/members/{uid}` exists
- `isParent(familyId)` — checks the member's `role` field equals `"parent"`

Whenever application logic changes who can read or write data, update `firestore.rules` in the same change. Deploy to both environments after updating rules.

---

## Testing

Run **both** test suites before every commit. Do not commit if any tests are failing. Always run unit tests first; only proceed to integration tests once they pass.

```bash
npm test                  # unit tests (no external dependencies) — run first
npm run test:coverage     # unit tests + coverage report + threshold enforcement (used by CI)
npm run test:integration  # integration tests (auto-starts/stops emulator) — run after unit tests pass
npm run test:watch        # unit tests in watch mode during development
```

Integration tests load the real `firestore.rules` file into the emulator. They verify that the rules you will deploy are actually enforced — if you change `firestore.rules`, the integration tests will catch any unintended access regressions.

**Coverage thresholds** are configured in `vitest.config.js` and enforced by CI via `npm run test:coverage`. Thresholds are set to the measured baseline and must only ever be raised, never lowered — if CI goes red after a legitimate refactor, add tests in the same PR rather than dropping the floor. When raising thresholds, do it in the same PR as the tests that justify the increase.

---

## Offline behaviour

Two mechanisms work together to provide full offline support:

1. **Service worker** caches all app shell files on first visit. Configured via the Vite PWA plugin with `registerType: 'prompt'` and `clientsClaim: true`. `useServiceWorkerUpdate()` (called at `App.vue` setup scope) detects a waiting SW via `updatefound`/`statechange` and exposes `bannerVisible`, `applyUpdate()`, and `snooze()`. `App.vue` shows a `v-snackbar` when `bannerVisible` is true; **Update** posts `SKIP_WAITING` and reloads, **Later** hides the banner for 30 minutes. A `visibilitychange` check and hourly `setInterval` keep calling `registration.update()` to poll for new versions.

2. **Firestore IndexedDB persistence** (`persistentLocalCache()` in `src/firebase/config.js`) caches all family data locally. Offline writes are queued and synced automatically when connectivity returns.

When writing Firestore operations, never block the UI waiting for a write to complete. Write optimistically (update Pinia state immediately) and let Firestore sync in the background. Do not show error states for normal offline writes.

Conflict resolution is last-write-wins. For a shopping list this is acceptable — if two people tick the same item while offline, the last sync wins and the item ends up ticked, which is the correct outcome.

---

## Keeping documentation current

Update documentation in the same commit as the change that makes it stale.

| Trigger | What to update |
|---|---|
| File added/removed/moved | `docs/project-structure.md` |
| Firestore data model changed | `docs/schema.md` + **Data model** in `README.md`; follow expand–migrate–cut for breaking changes |
| Security rules changed | `docs/security-rules.md`; deploy to both environments |
| Auth or store lifecycle changed | Relevant section here + subdirectory `CLAUDE.md` |
| Env vars changed | `.env` block in `README.md` steps 3 & 6 |
| npm scripts changed | **Development workflow** here + `README.md` |

**What goes where:** `README.md` — setup guide only · `CLAUDE.md` (root) — architecture, conventions · `docs/project-structure.md` — annotated file tree · `docs/schema.md` — data model + migration pattern · `docs/security-rules.md` — access table · `src/stores/CLAUDE.md` — store internals · `src/views/CLAUDE.md` — UI principles · `src/firebase/CLAUDE.md` — App Check, emulator · `docs/cloud-screenshots.md` — cloud session screenshot guide

---

## Development workflow

**Git workflow.** All changes to the app must go through pull requests — never commit or push directly to `main`. The `main` branch has GitHub branch protection enabled: direct pushes are blocked and CI must pass before a PR can be merged. Work on a feature branch, open a PR, wait for CI to go green, then merge manually. Never merge a PR without explicit decision to do so. **Merging to `main` automatically deploys to prod** — there is no separate manual deploy step afterward, so merging is itself a production deploy decision.

**Branch naming.** Name branches after the work being done, not after the session. Use kebab-case prefixed with a short type: `feature/`, `fix/`, or `chore/`. Examples: `feature/parent-only-shopping-items`, `fix/pocket-money-utc-rounding`, `chore/update-firestore-indexes`. Never use auto-generated session names like `claude/dreamy-davinci-*`. **Before pushing to GitHub or opening a PR**, always confirm the working branch has an appropriate name — if it doesn't, create a correctly-named branch from the current HEAD and push that instead.

**CI.** GitHub Actions runs `npm test` then `npm run test:integration` automatically on every pull request. CI must pass before merging.

**Issue linking.** If a PR fully resolves a GitHub issue, include `Closes #NNN` in the PR body — this auto-closes the issue on merge. Only use `Closes` when the PR completely addresses the issue; if unsure, confirm with the user before adding it. For PRs that relate to but don't fully fix an issue, reference it with `Related to #NNN` instead.

**Deploy workflows.** Dev: add `deploy-to-dev` label to any open PR (removed on success; `on-dev` added, and automatically removed if a new commit is pushed to that PR, since dev would then be running stale code). Prod: auto-deploys on every push to `main` (i.e. every merged PR). Both workflows run: env preflight check → `npm run deploy:checks` (ci + unit + integration tests) → `firebase deploy --only hosting,firestore:rules,firestore:indexes`. See `.github/workflows/` for full implementation detail.

**Always ask the user before deploying to any environment.** Never run `npm run deploy:*` or `firebase deploy` without explicit confirmation first. **Merging a PR to `main` triggers an automatic prod deploy** — treat "merge this PR" as equivalent to "deploy to prod" and get explicit confirmation before merging.

**Production deployments must only be run from the `main` branch.** Always verify with `git branch --show-current` before deploying to production.

**Working in a git worktree?** The `.env` file is gitignored, so a freshly created worktree will not have it. Copy it from the main checkout:

```bash
cp /path/to/main-checkout/.env .env
```

**Running integration tests in a cloud/remote session (e.g. Claude Code on the web)?** The `firebase` CLI is not pre-installed in cloud containers. Install it globally first:

```bash
npm install -g firebase-tools
npm run test:integration
```

**Taking screenshots in a cloud/remote session.** There is no display server; use Playwright (Puppeteer is **not** installed). Key environment facts:
- Playwright module: `/opt/node22/lib/node_modules/playwright`
- Chromium binary: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
- Use `domcontentloaded` (not `networkidle0`) — the Firestore WebSocket keeps the connection open
- Sign in via the emulator REST API to get a real `idToken`, inject via `addInitScript` into `localStorage` before navigating
- Full boilerplate: `docs/cloud-screenshots.md`
- **Do not commit screenshots or Playwright scripts to the repo.** Write screenshots to a local path (e.g. `/tmp/` or an ignored `screenshots/` dir), display them in the chat via the Read tool, then discard. Screenshots are for in-chat review only.

**Deploy guardrails.** Both `deploy:dev` and `deploy:prod` run an env preflight check, then `npm run deploy:checks` (`npm ci && npm test && npm run test:integration`), then deploy `hosting,firestore:rules,firestore:indexes` in one command. Do not bypass these by calling `vite build` + `firebase deploy` directly.

**Before every deploy or merge to `main` — run this backward-compatibility checklist.** If any answer is "yes", follow the expand–migrate–cut pattern in `docs/schema.md` before proceeding.

1. Does this change remove, rename, or re-type any field in an existing Firestore document?
2. Does this change add a field that existing code reads without a `?? defaultValue` fallback?
3. Does this change add a security rule condition that reads a field not present on all existing documents?
4. Does this change restructure a subcollection (move, rename, or merge)?

If all four answers are "no", the change is safe to deploy as-is. Document the check outcome in the PR description.

**Rules changes must reach both environments.** Only use `deploy:rules:dev` / `deploy:rules:prod` when rules changed but no app code did — and run both so the two environments don't diverge.

---

## Coding conventions

- **Vue 3 Composition API only** — always `<script setup>` syntax, never Options API
- **Component names** — PascalCase files and usage (`ShoppingItem.vue`, `<ShoppingItem />`)
- **Pinia stores** — Composition API style (`defineStore` with `ref` and `computed`)
- **Firestore listeners** — use `onSnapshot` for real-time data; always unsubscribe in `onUnmounted` to prevent memory leaks
- **Family colour system** — every member has a `colour` hex; use it consistently for avatars, badges, and vote indicators everywhere in the UI
- **Aisle ordering** — items sort by `aisleOrder` ascending, then `sortOrder`, then name. Deleted-aisle items go to `{ aisle: 'Unknown', aisleOrder: 99 }`. Store falls back to `DEFAULT_AISLES` when `aisles` field absent on old documents.
- **Bottom sheets with text inputs** — on Android, dismissing the virtual keyboard leaves `v-bottom-sheet` content (bottom-anchored) below the visible screen edge. Apply `useKeyboardAwareSheet(sheetRef, '--css-var-name')` from `src/composables/useKeyboardAwareSheet.js` to every `v-bottom-sheet` that contains a text input. Add `content-class="your-overlay-class"` to the `v-bottom-sheet` and an **unscoped** CSS rule `.your-overlay-class { margin-bottom: var(--css-var-name, 0px); transition: margin-bottom 0.15s ease; }`. Also add `max-height: 90dvh; overflow-y: auto` to the card inside the sheet. `v-dialog` is **not** affected — it uses centred positioning. See `ShoppingView.vue` for three worked examples and issues #49 / #109.
- **Offline writes** — update Pinia state immediately, fire Firestore write in background, do not await in a way that blocks the UI
- **Defensive Firestore reads** — always read document fields with a fallback (`data.field ?? defaultValue`). Devices with offline-cached documents may have an older schema shape; never assume a field is present even if it is "required" in the data model.
- **Tests** — unit tests live alongside the code in `__tests__/` directories. Run `npm test` then `npm run test:integration` before every commit. Do not commit if any tests are failing.
- **npm install vs npm ci** — Use `npm ci` to install dependencies before running tests, building, or any task where installing is a prerequisite rather than the goal. Only use `npm install` (or `npm install <pkg>`) when the explicit task is to add or update a dependency; commit the resulting `package-lock.json` change in that same PR.
- **`package.json` `overrides`** — `protobufjs` is pinned to `7.6.3` via an `overrides` entry (with an adjacent `_overridesNote` explaining why) to fix GHSA-f38q-mgvj-vph7 / CVE-2026-54269, a transitive dependency introduced by `firebase` → `@firebase/firestore` → `@grpc/proto-loader`. Dependabot couldn't auto-fix this because the latest stable `firebase` release (12.14.0 as of 2026-06-16) still resolves the vulnerable `protobufjs@7.6.2`. Remove the override once a stable `firebase` release transitively pulls in `protobufjs>=7.6.3` — verify with `npm ls protobufjs` after bumping `firebase`.

