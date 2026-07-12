// One-off migration for issue #137 Part B (supermarket allocation & per-store
// aisle ordering). Two additive, idempotent steps per family:
//
//   1. Collapse multiple shopping lists into one. The newest list (by createdAt)
//      survives; every other list's items are copied into it (copy-if-absent by
//      id). With --delete-merged, the drained lists and their items are then
//      removed. Without it, the extra lists are left in place (the app only shows
//      the surviving list, so nothing is lost — cleanup can run later).
//
//   2. Ensure a default supermarket exists. If the family has no supermarkets, one
//      named "My supermarket" is created, seeded from the surviving list's aisles
//      (or the built-in defaults). This matches the app's auto-provisioning, and
//      covers families where no parent has opened the app since the update.
//
// Existing items need no change: absent supermarketIds / allSupermarkets read as
// "unallocated", which displays in every view. Nothing is deleted unless
// --delete-merged is passed, and re-running is safe.
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

let itemsMerged = 0
let itemsSkipped = 0
let listsDeleted = 0
let supermarketsCreated = 0
const warnings = []

const families = await db.collection('families').get()

for (const familySnap of families.docs) {
  const familyId = familySnap.id
  const listsRef = familySnap.ref.collection('shoppingLists')
  const listSnaps = (await listsRef.get()).docs

  // Step 1 — collapse lists into the newest one.
  let survivingList = null
  if (listSnaps.length > 0) {
    const sorted = [...listSnaps].sort((a, b) => millis(b.data().createdAt) - millis(a.data().createdAt))
    survivingList = sorted[0]
    const drained = sorted.slice(1)

    for (const listSnap of drained) {
      const items = (await listSnap.ref.collection('items').get()).docs
      for (const itemSnap of items) {
        const destRef = survivingList.ref.collection('items').doc(itemSnap.id)
        if ((await destRef.get()).exists) {
          itemsSkipped++
        } else {
          console.log(`  + item ${itemSnap.id}: ${listSnap.id} → ${survivingList.id} (family ${familyId})`)
          if (!dryRun) await destRef.set(itemSnap.data())
          itemsMerged++
        }
      }
      if (deleteMerged) {
        if (!dryRun) {
          for (const itemSnap of items) await itemSnap.ref.delete()
          await listSnap.ref.delete()
        }
        console.log(`  - drained list ${listSnap.id} deleted (family ${familyId})`)
        listsDeleted++
      }
    }
  }

  // Step 2 — ensure a default supermarket exists.
  const supermarketsRef = familySnap.ref.collection('supermarkets')
  const existingSupermarkets = (await supermarketsRef.get()).docs
  if (existingSupermarkets.length === 0) {
    const seedAisles = survivingList?.data()?.aisles ?? DEFAULT_AISLES
    console.log(`  + supermarket "My supermarket" for family ${familyId} (${seedAisles.length} aisles)`)
    if (!dryRun) {
      await supermarketsRef.add({
        name: 'My supermarket',
        aisles: seedAisles,
        order: 0,
        createdBy: survivingList?.data()?.createdBy ?? null,
        createdAt: FieldValue.serverTimestamp(),
      })
    }
    supermarketsCreated++
  }
}

console.log(
  `\n${dryRun ? 'Would merge' : 'Merged'}: ${itemsMerged} item(s) ` +
  `(skipped ${itemsSkipped} already present). ` +
  `${dryRun ? 'Would create' : 'Created'}: ${supermarketsCreated} default supermarket(s).` +
  `${deleteMerged ? ` ${dryRun ? 'Would delete' : 'Deleted'}: ${listsDeleted} drained list(s).` : ''}`,
)
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ! ${w}`)
}
console.log(dryRun ? '\nDry run complete — nothing written.\n' : '\nMigration complete.\n')

process.exit(0)
