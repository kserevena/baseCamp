// One-off cleanup: delete the legacy top-level shoppingLists documents (and their
// `items` subcollections) AFTER migrate-shopping-lists.mjs has copied them to
// families/{familyId}/shoppingLists and the app has been verified against the new
// path. See issue #137 Part A and docs/schema.md.
//
// SAFETY: for each old list this script first confirms the migrated copy exists at
// the new path and has at least as many items as the old one. Any list that is not
// fully present at the new path is SKIPPED (never deleted). It also defaults to a
// dry run — you must pass --yes to actually delete.
//
// Auth / target selection is identical to migrate-shopping-lists.mjs:
//   • Emulator  — set FIRESTORE_EMULATOR_HOST. No creds needed.
//   • Real project — set GOOGLE_APPLICATION_CREDENTIALS to a service-account key.
//   Project id comes from --project=<id>, GCLOUD_PROJECT, or GOOGLE_CLOUD_PROJECT.
//
// Usage:
//   node scripts/delete-old-shopping-lists.mjs --project=basecamp-app-prod            # dry run
//   node scripts/delete-old-shopping-lists.mjs --project=basecamp-app-prod --yes      # delete
//
// Flags:
//   --yes       Actually delete. Without it the script only reports (dry run).
//   --project   Firestore project id (overrides the env vars above).

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const confirmed = args.includes('--yes')
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
  `\nDeleting legacy top-level shoppingLists (verified-migrated only)` +
  `\n  project: ${projectId}` +
  `\n  target:  ${usingEmulator ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : 'LIVE project'}` +
  `\n  mode:    ${confirmed ? 'DELETE' : 'DRY RUN (pass --yes to delete)'}\n`,
)

let deleted = 0
let skipped = 0
const warnings = []

const oldLists = await db.collection('shoppingLists').get()

for (const listSnap of oldLists.docs) {
  const familyId = listSnap.data().familyId
  const oldItems = await db.collection(`shoppingLists/${listSnap.id}/items`).get()

  // Verify the migrated copy is present before deleting anything.
  if (!familyId) {
    warnings.push(`list ${listSnap.id} has no familyId — cannot verify migration, skipped`)
    skipped++
    continue
  }
  const newListRef = db.doc(`families/${familyId}/shoppingLists/${listSnap.id}`)
  const newList = await newListRef.get()
  if (!newList.exists) {
    warnings.push(`list ${listSnap.id} not found at new path — NOT migrated, skipped`)
    skipped++
    continue
  }
  const newItems = await newListRef.collection('items').get()
  if (newItems.size < oldItems.size) {
    warnings.push(
      `list ${listSnap.id} has ${oldItems.size} old item(s) but only ${newItems.size} at ` +
      `new path — migration incomplete, skipped`,
    )
    skipped++
    continue
  }

  console.log(`  - shoppingLists/${listSnap.id} (${oldItems.size} item(s)) verified at new path`)
  if (confirmed) {
    for (const itemSnap of oldItems.docs) {
      await db.doc(`shoppingLists/${listSnap.id}/items/${itemSnap.id}`).delete()
    }
    await db.doc(`shoppingLists/${listSnap.id}`).delete()
  }
  deleted++
}

console.log(
  `\n${confirmed ? 'Deleted' : 'Would delete'}: ${deleted} list(s). Skipped (unverified): ${skipped}.`,
)
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ! ${w}`)
}
console.log(confirmed ? '\nCleanup complete.\n' : '\nDry run complete — nothing deleted.\n')

process.exit(0)
