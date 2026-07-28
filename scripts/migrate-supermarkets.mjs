// One-off migration for issue #137 Part B (supermarket allocation & per-store
// aisle ordering). Converts the old multi-list model into the new single-list +
// supermarkets model, per family. Additive and idempotent.
//
//   1. Each existing shopping list becomes a supermarket. A supermarket document
//      is created at supermarkets/{listId} (keyed by the list's id so re-runs are
//      idempotent), carrying the list's name and its aisle ordering. Order is
//      assigned oldest-list-first, so the oldest list is the default (order 0)
//      that seeds the "All items" aisle axis — reorder in the app if you prefer.
//
//   2. All items collapse into one surviving list (the newest by createdAt) and
//      are allocated to the supermarket derived from the list they came from:
//      supermarketIds = [originListId]. Items already carrying an allocation are
//      left as-is (so manual edits are never clobbered). Copies are copy-if-absent
//      by item id.
//
//   With --delete-merged, the drained (non-surviving) lists and their items are
//   removed afterwards; without it they are left in place (the app only shows the
//   surviving list, so nothing is lost — cleanup can run later).
//
// A family with a single list yields one supermarket with all its items allocated
// to it. Nothing is deleted unless --delete-merged is passed, and re-running is safe.
//
// Ordering note: run this BEFORE parents open the updated app. The app auto-
// provisions a lone "My supermarket" for a family that has zero supermarkets; if
// that already happened, this migration still creates the per-list supermarkets
// (keyed by list id, no collision) and the empty "My supermarket" can be deleted
// in the app afterwards.
//
// Auth / target selection:
//   • Emulator  — set FIRESTORE_EMULATOR_HOST (e.g. localhost:8080). No creds needed.
//   • Real project — set GOOGLE_APPLICATION_CREDENTIALS to a service-account key
//     with Firestore access (the same key the deploy workflow uses).
//   The project id comes from --project=<id>, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT.
//
// Usage:
//   node scripts/migrate-supermarkets.mjs --project=basecamp-app-prod --dry-run
//   node scripts/migrate-supermarkets.mjs --project=basecamp-app-prod
//   node scripts/migrate-supermarkets.mjs --project=basecamp-app-prod --delete-merged
//
// Flags:
//   --dry-run         Report what would change without writing anything.
//   --delete-merged   After merging, delete the drained (non-surviving) lists.
//   --project         Firestore project id (overrides the env vars above).

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const DEFAULT_AISLES = [
  { name: 'Dairy', order: 1 },
  { name: 'Meat', order: 2 },
  { name: 'Dry goods', order: 3 },
  { name: 'Bakery', order: 4 },
  { name: 'Fruit & veg', order: 5 },
]

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const deleteMerged = args.includes('--delete-merged')
const projectArg = args.find(a => a.startsWith('--project'))
const projectId =
  (projectArg?.includes('=') ? projectArg.split('=')[1] : args[args.indexOf(projectArg) + 1]) ||
  process.env.GCLOUD_PROJECT ||
  process.env.GOOGLE_CLOUD_PROJECT

if (!projectId) {
  console.error('✖ No project id. Pass --project=<id> or set GCLOUD_PROJECT.')
  process.exit(1)
}

const usingEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST)

initializeApp(usingEmulator ? { projectId } : { credential: applicationDefault(), projectId })
const db = getFirestore()

console.log(
  `\nMigrating families for supermarket allocation (#137 Part B)` +
  `\n  project: ${projectId}` +
  `\n  target:  ${usingEmulator ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : 'LIVE project'}` +
  `${dryRun ? '\n  mode:    DRY RUN (no writes)' : ''}` +
  `${deleteMerged ? '\n  extras:  drained lists will be DELETED' : '\n  extras:  drained lists kept (use --delete-merged to remove)'}\n`,
)

const millis = (ts) => (ts?.toMillis?.() ?? 0)
const isUnallocated = (data) =>
  !(data.allSupermarkets ?? false) && ((data.supermarketIds?.length ?? 0) === 0)

let supermarketsCreated = 0
let itemsAllocated = 0
let itemsSkipped = 0
let listsDeleted = 0
const warnings = []

const families = await db.collection('families').get()

for (const familySnap of families.docs) {
  const familyId = familySnap.id
  const listSnaps = (await familySnap.ref.collection('shoppingLists').get()).docs
  if (listSnaps.length === 0) continue

  // Oldest-first drives supermarket order; newest survives as the single list.
  const byOldest = [...listSnaps].sort((a, b) => millis(a.data().createdAt) - millis(b.data().createdAt))
  const surviving = [...listSnaps].sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt))[0]
  const supermarketsRef = familySnap.ref.collection('supermarkets')

  // 1. One supermarket per list, keyed by the list id (idempotent).
  for (let i = 0; i < byOldest.length; i++) {
    const listSnap = byOldest[i]
    const smRef = supermarketsRef.doc(listSnap.id)
    if ((await smRef.get()).exists) continue
    const data = listSnap.data()
    console.log(`  + supermarket "${data.name ?? 'Shopping'}" (from list ${listSnap.id}, family ${familyId})`)
    if (!dryRun) {
      await smRef.set({
        name: data.name ?? 'Shopping',
        aisles: data.aisles ?? DEFAULT_AISLES,
        order: i,
        createdBy: data.createdBy ?? null,
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
      })
    }
    supermarketsCreated++
  }

  // 2. Merge items into the surviving list and allocate to their origin supermarket.
  for (const listSnap of listSnaps) {
    const originId = listSnap.id
    const items = (await listSnap.ref.collection('items').get()).docs

    for (const itemSnap of items) {
      const data = itemSnap.data()
      // Preserve any existing allocation; otherwise allocate to the origin store.
      const allocation = isUnallocated(data)
        ? { supermarketIds: [originId], allSupermarkets: false }
        : { supermarketIds: data.supermarketIds ?? [], allSupermarkets: data.allSupermarkets ?? false }

      if (originId === surviving.id) {
        // Already in the surviving list — only stamp allocation if unallocated.
        if (isUnallocated(data)) {
          if (!dryRun) await itemSnap.ref.update(allocation)
          itemsAllocated++
        } else {
          itemsSkipped++
        }
      } else {
        const destRef = surviving.ref.collection('items').doc(itemSnap.id)
        if ((await destRef.get()).exists) {
          itemsSkipped++
        } else {
          console.log(`  + item ${itemSnap.id}: ${originId} → ${surviving.id} @ store ${originId} (family ${familyId})`)
          if (!dryRun) await destRef.set({ ...data, ...allocation })
          itemsAllocated++
        }
      }
    }

    if (deleteMerged && originId !== surviving.id) {
      if (!dryRun) {
        for (const itemSnap of items) await itemSnap.ref.delete()
        await listSnap.ref.delete()
      }
      console.log(`  - drained list ${originId} deleted (family ${familyId})`)
      listsDeleted++
    }
  }
}

console.log(
  `\n${dryRun ? 'Would create' : 'Created'}: ${supermarketsCreated} supermarket(s). ` +
  `${dryRun ? 'Would allocate' : 'Allocated'}: ${itemsAllocated} item(s) ` +
  `(skipped ${itemsSkipped} already allocated/present).` +
  `${deleteMerged ? ` ${dryRun ? 'Would delete' : 'Deleted'}: ${listsDeleted} drained list(s).` : ''}`,
)
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ! ${w}`)
}
console.log(dryRun ? '\nDry run complete — nothing written.\n' : '\nMigration complete.\n')

process.exit(0)
