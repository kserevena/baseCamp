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

**`shopping` store specifics:** `setup(familyId)` subscribes to the `shoppingLists` collection (filtered by `familyId`) to get list metadata — it does **not** auto-create any document. When the snapshot fires with results, the store auto-activates the most recently created list. `activateList(listId)` starts a second listener on that list's items subcollection. `createList(name)` is a parent-only action that creates a new list document (with a default `aisles` array) and activates it. `reorderItems(updates)` is a parent-only action (enforced in the UI) that batch-writes `sortOrder` (and optionally `aisle`/`aisleOrder` for cross-section moves) to persist drag-and-drop order. `saveAisles(aisles)` is a parent-only action that writes the current aisle list to the list document. `deleteAisle(name)` is a parent-only action that batch-moves items in the deleted aisle to `aisle: 'Unknown'` and removes the aisle from the list document. `toggleDone(id)` flips an item's `done` flag and, on the uncheck path only, reassigns `addedBy` to the current user (unchecking means "I want this again"). Because of that side effect, `toggleDone` is **not** a clean inverse of itself — so the undo affordance in `ShoppingList.vue` does not re-toggle. Instead the component captures the pre-toggle `{ done, addedBy }` and, on Undo, calls `restoreToggleState(id, { done, addedBy })`, which writes those exact values back so an accidental tick is reverted without re-attributing the item. `activeAisles` is a computed that returns the active list's `aisles` array, falling back to `DEFAULT_AISLES` if the field is absent (old documents). `teardown()` cleans up both the lists and items listeners.

---

See root `CLAUDE.md` → **Firebase data structure** for the full Firestore schema, and **Firestore schema evolution** for migration patterns before any database change.
