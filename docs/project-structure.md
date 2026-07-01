# Project structure

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
│   │   ├── JobCard.vue              # Single job card — collapsed summary + expanded controls; parent-gated actions
│   │   ├── JobsPreview.vue          # Compact home-screen card — top 3 active jobs by priority, +N overflow, links to /jobs
│   │   ├── JobSubtasks.vue          # Subtask checklist per job; checkbox available to all; drag/add/delete parent-only
│   │   └── __tests__/
│   ├── views/
│   │   ├── HomeView.vue             # Dashboard — shopping summary, top jobs preview, family avatars
│   │   ├── LoginView.vue            # Google Sign-In page
│   │   ├── SetupView.vue            # Create or join a family (shown after first sign-in)
│   │   ├── ShoppingView.vue         # Shopping list — list, add-item FAB, manage aisles
│   │   ├── PocketMoneyView.vue      # Pocket money — parent overview & config, child balance view
│   │   ├── JobsView.vue             # Household jobs — status sections, category filter, FAB add dialog
│   │   ├── CLAUDE.md                # UI design principles; PocketMoneyView complexity notes
│   │   └── __tests__/
│   ├── composables/
│   │   ├── useServiceWorkerUpdate.js  # SW update: detects waiting worker, exposes bannerVisible + applyUpdate + snooze (30 min); hourly + visibilitychange polling
│   │   ├── useUserRole.js             # isParent/isChild computed derived from family.currentUser
│   │   ├── useKeyboardAwareSheet.js   # Lifts v-bottom-sheet content above the Android virtual keyboard (#49, #109)
│   │   └── __tests__/
│   ├── constants/
│   │   ├── roles.js                  # ROLE_PARENT / ROLE_CHILD — the Firestore role string contract
│   │   └── jobs.js                   # JOB_STATUSES / JOB_STATUS_LABELS / JOB_PRIORITIES — Firestore string contract
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
│   │   ├── pocketMoney.js           # Pocket money snapshots, auto-payment calc, withdrawal recording
│   │   ├── jobs.js                  # Household jobs + subtasks; two onSnapshot listeners (jobs + collectionGroup subtasks)
│   │   ├── CLAUDE.md                # pocketMoney UTC math + transaction safety; shopping store internals; jobs store internals
│   │   └── __tests__/
│   ├── router/
│   │   ├── index.js                 # Vue Router — routes and auth guard
│   │   └── __tests__/
│   ├── firebase/
│   │   ├── config.js                # Firebase init, App Check, emulator wiring, IndexedDB persistence
│   │   └── CLAUDE.md                # App Check rollout; emulator ports and connection
│   └── devtools/
│       └── seed.js                  # seedIfEmpty() — manual emulator demo seeding (browser console only; not runtime/test)
├── docs/
│   ├── cloud-screenshots.md         # Playwright setup guide for cloud/remote sessions
│   ├── project-structure.md         # This file
│   ├── schema.md                    # Firestore data model + schema evolution (expand-migrate-cut)
│   └── security-rules.md            # Firestore security rules access summary
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
│   │   ├── deploy-dev.yml           # Label-triggered (deploy-to-dev) + workflow_dispatch deploy to dev
│   │   └── deploy-prod.yml          # Auto-deploys to basecamp-app-prod on push to main; also workflow_dispatch
│   └── dependabot.yml
├── .env                             # Dev Firebase credentials — never commit
├── .env.prod                        # Prod Firebase credentials — never commit
└── package.json
```
