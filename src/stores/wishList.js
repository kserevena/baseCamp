import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from '@/stores/family.js'

// One flat collection per family — families/{familyId}/wishListItems — with an
// ownerUid field naming whose list each item belongs to. Every member can see
// every list, so a single onSnapshot loads them all and the getters group by
// owner in memory. A per-owner subcollection would have forced a
// collectionGroup listener (plus a top-level wildcard rule and a collection-group
// index, as with jobs/subtasks) for no benefit at family scale.
//
// Writes are gated on ownership rather than role: you manage your own list, and
// parents can also add to and tick any member's list (they are usually the ones
// doing the buying). The security rules enforce both, and ownerUid is immutable
// once written so an item can never be moved onto someone else's list.

export const useWishListStore = defineStore('wishList', () => {
  const familyStore = useFamilyStore()

  const items = ref([])

  let currentFamilyId = null
  let unsubscribeItems = null

  // ── path helpers ───────────────────────────────────────────────────────────

  const itemsCol = () => collection(db, 'families', currentFamilyId, 'wishListItems')
  const itemDoc = (id) => doc(db, 'families', currentFamilyId, 'wishListItems', id)

  // ── getters ────────────────────────────────────────────────────────────────

  // A member's items: outstanding wishes first, then ticked-off ones, each
  // newest-first. createdAt is null until an optimistic write syncs, so the
  // comparison guards with ?.toMillis?.() ?? 0 (an unsynced item sorts last
  // within its group, which is where the local write already placed it).
  const itemsFor = computed(() => (uid) =>
    items.value
      .filter(i => i.ownerUid === uid)
      .slice()
      .sort((a, b) =>
        Number(a.done) - Number(b.done) ||
        (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      )
  )

  // Count of outstanding (not ticked) wishes for a member — drives the badge on
  // the member selector and the home-screen preview card.
  const activeCountFor = computed(() => (uid) =>
    items.value.filter(i => i.ownerUid === uid && !i.done).length
  )

  const myActiveCount = computed(() =>
    activeCountFor.value(familyStore.currentUser?.uid ?? null)
  )

  // ── setup / teardown ───────────────────────────────────────────────────────

  function setup(familyId) {
    if (unsubscribeItems) unsubscribeItems()

    currentFamilyId = familyId

    unsubscribeItems = onSnapshot(
      collection(db, 'families', familyId, 'wishListItems'),
      (snap) => {
        items.value = snap.docs.map(d => {
          const data = d.data()
          return {
            id:        d.id,
            ownerUid:  data.ownerUid ?? null,
            name:      data.name ?? '',
            note:      data.note ?? null,
            link:      data.link ?? null,
            done:      data.done ?? false,
            doneBy:    data.doneBy ?? null,
            addedBy:   data.addedBy ?? null,
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          }
        })
      },
    )
  }

  function teardown() {
    if (unsubscribeItems) unsubscribeItems()
    unsubscribeItems = null
    currentFamilyId = null
    items.value = []
  }

  // ── actions ────────────────────────────────────────────────────────────────

  function addItem({ ownerUid, name, note = null, link = null }) {
    if (!currentFamilyId || !ownerUid) return
    addDoc(itemsCol(), {
      ownerUid,
      name,
      note: note ?? null,
      link: link ?? null,
      done:      false,
      doneBy:    null,
      addedBy:   familyStore.currentUser?.uid ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  }

  // Optimistic: flip in local state immediately, fire the Firestore write in
  // the background. doneBy records who ticked it and is cleared on un-ticking.
  function toggleDone(itemId) {
    const item = items.value.find(i => i.id === itemId)
    if (!item || !currentFamilyId) return
    const newDone = !item.done
    const doneBy = newDone ? (familyStore.currentUser?.uid ?? null) : null
    item.done = newDone
    item.doneBy = doneBy
    updateDoc(itemDoc(itemId), { done: newDone, doneBy, updatedAt: serverTimestamp() })
  }

  function updateItem(itemId, { name, note, link }) {
    const item = items.value.find(i => i.id === itemId)
    if (!item || !currentFamilyId) return
    const update = {}
    if (name !== undefined) update.name = name
    if (note !== undefined) update.note = note ?? null
    if (link !== undefined) update.link = link ?? null
    update.updatedAt = serverTimestamp()
    updateDoc(itemDoc(itemId), update)
  }

  function deleteItem(itemId) {
    const item = items.value.find(i => i.id === itemId)
    if (!item || !currentFamilyId) return
    items.value = items.value.filter(i => i.id !== itemId)
    deleteDoc(itemDoc(itemId))
  }

  return {
    items,
    itemsFor,
    activeCountFor,
    myActiveCount,
    setup,
    teardown,
    addItem,
    toggleDone,
    updateItem,
    deleteItem,
  }
})
