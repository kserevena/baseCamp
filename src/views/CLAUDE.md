# Views context — src/views/

## UI design principles

- Mobile-first — design for a phone screen, verify on tablet and Chromebook
- Touch targets — all interactive elements at least 44px tall for comfortable tapping
- Family colours — avatars and vote indicators always use the member's colour
- "From meal" badge — items auto-added from meal voting show a purple badge
- Aisle grouping — group items by aisle with a clear section header when sorted by store layout
- Keep it friendly and clear — children use this app too

---

## PocketMoneyView.vue

461 lines — the largest view in the codebase. It serves two completely different UIs from a single component: a parent overview (child list, per-child detail sheet, settings dialog, withdrawal dialog, transaction history) and a child read-only view (own balance, own history). Key notes:

- All dialog writes are **fire-and-forget** per the offline convention: validate synchronously, fire without awaiting, close immediately. Do not refactor to await the write.
- `flushPendingPayments` runs inside a Firestore `runTransaction` — see `src/stores/CLAUDE.md` for the concurrency safety details before touching that call path.
- The component is organised with delimiter comments (`<!-- ── section ── -->`) — use the same style if adding new sections.
