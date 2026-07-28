# Store context — src/stores/

See root `CLAUDE.md` for the setup/teardown pattern and pocketMoney write semantics. This file adds the store-specific detail you need when working directly in this directory.

---

## pocketMoney store

### flushPendingPayments

`flushPendingPayments(childUid)` runs as a Firestore `runTransaction` — it re-reads the child's document server-side, recomputes pending payments from the authoritative `lastUpdated`, applies the balance as an `increment()` delta, and writes payment transactions with **deterministic IDs** (`payment-YYYY-MM-DD`). This makes concurrent flushes by two parents safe (the second retries, sees the fresh `lastUpdated`, and no-ops) and any residual double-write idempotent. Transactions require connectivity, so the flush is **online-only**; `displayBalance` already shows pending payments computed locally, and the flush happens next time a parent opens the child's sheet online. A missing `lastUpdated` is treated as "now" (zero pending payments, never epoch back-pay). A flush of more than 400 pending payments is refused as a safety cap (transactions allow 500 writes).

### recordWithdrawal

`recordWithdrawal` uses `increment(-amount)` (commutative, offline-safe) and does **not** touch `lastUpdated` — that field means "payments accrued through this date", and only `flushPendingPayments` and first-time `saveConfig` write it. Dialog writes in `PocketMoneyView.vue` are optimistic: validate synchronously, fire without awaiting, close immediately.

### UTC date math — do not change to local time

`pendingPaymentDates` (and the 90-day cutoff in `loadTransactions`) use UTC `Date` methods (`getUTCDay` / `setUTCHours` / `setUTCDate`). Anchoring to UTC makes the accrual count invariant to device timezone changes — a device that travels or has its clock zone changed can never double-count or skip a week. The trade-off is that a payment posts on UTC midnight rather than the family's local midnight (cosmetic for a UK family; the amount is always correct). Non-UTC timezone support is tracked in **GitHub issue #15**. Unit tests pin the clock to UTC (`TZ=UTC` in both vitest configs and `src/test-setup.js`) and use fake timers so calendar boundaries, leap day, and DST transitions are verified with exact assertions.

---

## shopping store

**`shopping` store specifics:** `setup(familyId)` subscribes to two collections under `families/{familyId}` — `shoppingLists` (list metadata) and `supermarkets` (issue #137 Part B). The family scope is in the path (there is no `familyId` field, and no `where()` filter). The **lists listener is registered first** so it stays the first `onSnapshot` call (several tests capture callbacks by call order). All reads/writes go through the path helpers (`listsCol`/`listDoc`/`itemsCol`/`itemDoc`/`supermarketsCol`/`supermarketDoc`) which prepend `families/{currentFamilyId}`. When the lists snapshot fires with results, the store auto-activates the most recently created list; `activateList(listId)` starts a third listener on that list's items subcollection. `createList(name)` creates a list document (with a default `aisles` array) and activates it. `reorderItems(updates)` batch-writes `sortOrder` (and optionally `aisle`/`aisleOrder`) to persist drag order — `sortOrder` is **global**, shared across all supermarket views. `toggleDone(id)` flips `done`; on the check path it also clears `priority` (a done item is no longer priority); on the uncheck path it reassigns `addedBy` to the current user. Because of these side effects `toggleDone` is **not** a clean inverse of itself — the undo affordance in `ShoppingList.vue` captures the pre-toggle `{ done, addedBy, priority }` and calls `restoreToggleState(...)` to write those exact values back. All the write actions above are parent-only, enforced in the UI. `teardown()` cleans up the lists, items, and supermarkets listeners.

**Supermarkets & per-store aisle ordering (Part B).** Each family defines its own supermarkets, each carrying an independent `aisles` array. `selectedSupermarketId` is **local view state** (null = "All items"), persisted per family in `localStorage` (`selectedSupermarket_{familyId}`) and validated against each snapshot (a deleted store falls back to "All items"). It filters and re-orders the view only — it never rewrites item data or affects other members. Key members:
- `visibleItems` — items filtered by the selection: "All items" shows everything; a specific store shows items allocated to it, allocated to all supermarkets (`allSupermarkets`), or unallocated (`supermarketIds` absent/empty). Allocation fields are read defensively so pre-Part-B items behave as unallocated.
- `activeAisles` — the selected store's aisles; or, for "All items", the **deduplicated union** across all stores (default store's order first, then names only in other stores appended alphabetically, dedup case-insensitive); or, when no supermarkets exist yet (old data / pre-provision), the active list's aisles → `DEFAULT_AISLES`.
- `addSupermarket` / `renameSupermarket` / `saveSupermarketAisles` are parent-only writes. `deleteSupermarket(id)` batch-strips the id from every loaded item's `supermarketIds` (an emptied allocation becomes unallocated, never orphaned) and deletes the doc in the same batch. `deleteSupermarketAisle(id, name)` **only** removes the aisle from that store's ordering — unlike the legacy `deleteAisle`, it deliberately does not rewrite `item.aisle` (the name may still be used by another store; items just fall to the bottom of that store's view).
- `ensureDefaultSupermarket()` — auto-provisions the family's first supermarket (named "My supermarket", seeded from the surviving list's aisles), the automatic migration for existing families. It is **triggered from `ShoppingView`** (which knows `isParent`) once a parent has loaded a list and `supermarketsLoaded` is true with none present; a local guard prevents double-creation and is cleared if the write is rejected. `saveAisles`/`deleteAisle` (list-level) are retained for backward compatibility with pre-Part-B data but are no longer wired to the UI.

---

## jobs store

**Two onSnapshot listeners:**
1. `unsubscribeJobs` — subscribes to `families/{familyId}/householdJobs` (all jobs for the family)
2. `unsubscribeSubtasks` — subscribes via `collectionGroup('subtasks')` filtered by `familyId`. A collection-group query is required because subtasks live under individual job docs and there is no way to subscribe to all subtasks for a family via a normal collection query. This requires a top-level wildcard read rule in `firestore.rules` (`/{path=**}/subtasks/{subtaskId}`) because path-nested rules do NOT apply to collection-group queries.

**`toggleSubtask` is the ONLY action available to non-parent members.** It touches only `done` and `updatedAt` — the security rule enforces this constraint (a member update that touches any other field is denied). Keep the `updateDoc` call in `toggleSubtask` minimal. All other write actions (addJob, updateJob, deleteJob, addSubtask, updateSubtask, reorderSubtasks, deleteSubtask) are parent-only — the UI gates them.

**`deleteJob`** deletes subtask documents before the parent job, mirroring `deleteList` in the shopping store. The subtask security rule does not reach back to the parent job, but the pattern is established practice for child-before-parent deletion.

**`activeJobsByPriority`** is a computed getter returning non-`done` jobs ranked by priority (`high` > `medium` > `low` > none), tie-breaking by newest `createdAt`. It backs the home-screen `JobsPreview.vue` card. `createdAt` may be `null` for a not-yet-synced optimistic write, so the tie-break guards with `?.toMillis?.() ?? 0`.

---

See root `CLAUDE.md` → **Firebase data structure** for the full Firestore schema, and **Firestore schema evolution** for migration patterns before any database change.
