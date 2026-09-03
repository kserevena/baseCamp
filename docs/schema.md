# Firebase data structure

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

families/{familyId}/shoppingLists/{listId}   ← auto-generated ID; family scope is in the path
  name: string                ← user-provided name; set by a parent when creating the list
  createdAt: timestamp
  createdBy: uid
  aisles: Array<{ name: string, order: number }> | absent
                              ← legacy per-list aisle config (kept for backward compat and to
                                seed the default supermarket). Since #137 Part B, aisle ORDERING
                                lives on supermarket documents; the store resolves aisle order
                                from the selected supermarket, falling back to this / DEFAULT_AISLES.
  items/{itemId}
    name: string
    qty: string
    aisle: string             ← a single aisle NAME per item; each supermarket positions it
    aisleOrder: number        ← denormalised default-store order; 99 = Unknown. No longer drives
                                sorting (resolved per-supermarket at render); kept for old clients.
    done: boolean
    addedBy: uid
    supermarketIds: string[]  ← Part B allocation: specific stores. Absent/[] = unallocated
                                (shown in every view). Read defensively.
    allSupermarkets: boolean  ← Part B allocation: explicit "all stores" (distinct from
                                unallocated). Absent = false. Read defensively.
    sortOrder: number | null  ← custom drag-drop position within aisle (global); absent = sort by name
    priority: boolean         ← starred/priority marking, set from the star toggle in the item list
                                or the Priority chip in the Add/Edit item sheet. Absent = false, read
                                defensively. Cleared automatically when an item is ticked done
                                (toggleDone); a plain edit (updateItem) never changes it unless
                                explicitly supplied.
    createdAt: timestamp

families/{familyId}/supermarkets/{supermarketId}   ← per-family stores (#137 Part B)
  name: string                ← e.g. "Tesco"; parent-editable
  aisles: Array<{ name: string, order: number }>
                              ← this store's independent aisle ordering
  order: number               ← chip display order; the migration/auto-provisioned default = 0.
                                The first store (lowest order) seeds the "All items" aisle axis.
  createdBy: uid
  createdAt: timestamp

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

families/{familyId}/wishListItems/{itemId}   ← one flat collection per family; ownerUid
                                               names whose list the item belongs to
  ownerUid: uid               ← immutable after create (enforced in the rules), so an item
                                can never be moved onto another member's list
  name: string                ← capped at 80 chars in the rules
  note: string | null         ← optional detail ("the blue one"); capped at 300 chars
  link: string | null         ← optional http(s) URL; capped at 500 chars. Validated and
                                normalised client-side before write (src/utils/url.js)
  done: boolean               ← ticked = bought, or no longer wanted
  doneBy: uid | null          ← who ticked it; cleared when un-ticked
  addedBy: uid                ← usually the owner; differs when a parent adds for a child
  createdAt: timestamp
  updatedAt: timestamp

families/{familyId}/householdJobs/{jobId}
  title: string
  description: string | null
  category: string
  status: "suggested" | "planned" | "in_progress" | "done"
  priority: "high" | "medium" | "low" | null
  costEstimate: number | null           ← GBP cost estimate; null when unset
  suggestedBy: uid                      ← stamped on create; immutable; used by security rules
  assignedTo: uid | null
  createdAt: timestamp
  updatedAt: timestamp

families/{familyId}/householdJobs/{jobId}/subtasks/{subtaskId}
  familyId: string                      ← stamped for the collection-group listener and security rule
  jobId: string                         ← stamped for the collection-group listener and security rule
  title: string
  notes: string                         ← optional free-text; absent/empty on older docs, capped at 500 chars client-side
  done: boolean
  assignedTo: uid | null
  order: number                         ← sort order within the job; parents can reorder
  createdAt: timestamp
  updatedAt: timestamp
```

**New family-scoped collections must be subcollections of `families/{familyId}/`.** Do not create new root-level collections that carry a `familyId` field for access control — nesting under the family document makes security rules simpler and avoids cross-family data leakage by construction. (`shoppingLists` was originally root-level; it was migrated to `families/{familyId}/shoppingLists` in issue #137, so every family-scoped collection now follows this convention.)

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
