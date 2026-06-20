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
  done: boolean
  assignedTo: uid | null
  order: number                         ← sort order within the job; parents can reorder
  createdAt: timestamp
  updatedAt: timestamp
```

**New family-scoped collections must be subcollections of `families/{familyId}/`.** Do not create new root-level collections that carry a `familyId` field for access control — nesting under the family document makes security rules simpler and avoids cross-family data leakage by construction. (`shoppingLists` and `meals` predate this convention and use the root-level pattern; do not follow that pattern for any new data.)

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
