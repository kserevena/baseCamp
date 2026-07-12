// One-off migration: copy shopping lists from the legacy top-level collection
// (shoppingLists/{listId}) to the family subcollection
// (families/{familyId}/shoppingLists/{listId}), including each list's `items`
// subcollection. See issue #137 Part A and docs/schema.md.
//
// The migration is ADDITIVE and IDEMPOTENT (copy-if-absent): a document that
// already exists at the new path is left untouched, so re-running it is safe and
// it will never clobber edits made after an earlier run. It does not delete any
// old data — use delete-old-shopping-lists.mjs for that, after verifying.
//
// Auth / target selection:
//   • Emulator  — set FIRESTORE_EMULATOR_HOST (e.g. localhost:8080). No creds needed.
//   • Real project — set GOOGLE_APPLICATION_CREDENTIALS to a service-account key
//     with Firestore access (the same key the deploy workflow uses).
//   In both cases the project id comes from --project=<id>, GCLOUD_PROJECT, or
//   GOOGLE_CLOUD_PROJECT.
//
// Usage:
//   node scripts/migrate-shopping-lists.mjs --project=basecamp-app-prod
//   node scripts/migrate-shopping-lists.mjs --project=demo-test --dry-run
//
// Flags:
//   --dry-run   Report what would be copied without writing anything.
//   --project   Firestore project id (overrides the env vars above).

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
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
  `\nMigrating shoppingLists → families/{familyId}/shoppingLists` +
  `\n  project: ${projectId}` +
  `\n  target:  ${usingEmulator ? `emulator (${process.env.FIRESTORE_EMULATOR_HOST})` : 'LIVE project'}` +
  `${dryRun ? '\n  mode:    DRY RUN (no writes)' : ''}\n`,
)

let listsCopied = 0
let listsSkipped = 0
let itemsCopied = 0
let itemsSkipped = 0
const warnings = []

const oldLists = await db.collection('shoppingLists').get()

for (const listSnap of oldLists.docs) {
  const data = listSnap.data()
  const familyId = data.familyId
  if (!familyId) {
    warnings.push(`list ${listSnap.id} has no familyId — cannot place it, skipped`)
    continue
  }

  const newListRef = db.doc(`families/${familyId}/shoppingLists/${listSnap.id}`)
  const existing = await newListRef.get()
  if (existing.exists) {
    listsSkipped++
  } else {
    console.log(`  + list ${listSnap.id} → families/${familyId}/shoppingLists/${listSnap.id}`)
    if (!dryRun) await newListRef.set(data)
    listsCopied++
  }

  const oldItems = await db.collection(`shoppingLists/${listSnap.id}/items`).get()
  for (const itemSnap of oldItems.docs) {
    const newItemRef = newListRef.collection('items').doc(itemSnap.id)
    const itemExists = await newItemRef.get()
    if (itemExists.exists) {
      itemsSkipped++
    } else {
      if (!dryRun) await newItemRef.set(itemSnap.data())
      itemsCopied++
    }
  }
}

console.log(
  `\n${dryRun ? 'Would copy' : 'Copied'}: ` +
  `${listsCopied} list(s), ${itemsCopied} item(s). ` +
  `Skipped (already present): ${listsSkipped} list(s), ${itemsSkipped} item(s).`,
)
if (warnings.length) {
  console.log('\nWarnings:')
  for (const w of warnings) console.log(`  ! ${w}`)
}
console.log(dryRun ? '\nDry run complete — nothing written.\n' : '\nMigration complete.\n')

process.exit(0)
