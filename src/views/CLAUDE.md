# Views context — src/views/

## UI design principles

- Mobile-first — design for a phone screen, verify on tablet and Chromebook
- Touch targets — all interactive elements at least 44px tall for comfortable tapping
- Family colours — avatars and vote indicators always use the member's colour
- Aisle grouping — group items by aisle with a clear section header when sorted by store layout
- Keep it friendly and clear — children use this app too

---

## JobsView.vue

Jobs are grouped by status in spec order (Suggested → Planned → In Progress → Done). The Done section is de-emphasised. Each section is collapsible. A category filter chip row appears when any job has a category set.

All family members can suggest jobs via the FAB. Parent-only controls (status, priority, assignee, cost, delete) are gated by `useUserRole().isParent` — hidden for children. The one exception is the suggesting child, who may edit title/description of their own still-suggested job.

The `JobCard` component handles the expand/collapse and all job-level controls. `JobSubtasks` renders the subtask checklist; the done checkbox is available to every role (even children).

## ShoppingView.vue

The Add item bottom sheet fills the screen (`height: 92dvh`) and shrinks when the Android on-screen keyboard opens. That shrinking works only because `index.html` sets `interactive-widget=resizes-content` on the viewport meta — `dvh` on its own is **not** keyboard-aware. The height lives on the unscoped `.add-item-overlay` rule (Vuetify's `.v-overlay__content`), **not** on `.add-item-card`; the wrapper is a flex container with a content-driven height, so a `dvh` height on the card alone is ignored. The card is `height: 100%` and a flex column whose children are all `flex: 0 0 auto` except `.chip-picker-section` (`flex: 1 1 auto; min-height: 0`), so the aisle/supermarket picker is the only part that gives way as the sheet shrinks and the Cancel/Add buttons always stay reachable.

Nothing here measures the DOM or the viewport in JS — earlier attempts that did are documented in the root `CLAUDE.md`. **Changes to this sheet's sizing cannot be validated locally** (simulated keyboards shrink both viewports and mask the bug); verify on a physical Android device.

## PocketMoneyView.vue

461 lines — the largest view in the codebase. It serves two completely different UIs from a single component: a parent overview (child list, per-child detail sheet, settings dialog, withdrawal dialog, transaction history) and a child read-only view (own balance, own history). Key notes:

- All dialog writes are **fire-and-forget** per the offline convention: validate synchronously, fire without awaiting, close immediately. Do not refactor to await the write.
- `flushPendingPayments` runs inside a Firestore `runTransaction` — see `src/stores/CLAUDE.md` for the concurrency safety details before touching that call path.
- The component is organised with delimiter comments (`<!-- ── section ── -->`) — use the same style if adding new sections.
