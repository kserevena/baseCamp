import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from './family.js'

const DEFAULT_AISLES = [
  { name: 'Dairy', order: 1 },
  { name: 'Meat', order: 2 },
  { name: 'Dry goods', order: 3 },
  { name: 'Bakery', order: 4 },
  { name: 'Fruit & veg', order: 5 },
]

export const useShoppingStore = defineStore('shopping', () => {
  const lists = ref([])
  const items = ref([])
  const activeListId = ref(null)

  // Supermarkets (issue #137 Part B). Each family defines its own supermarkets;
  // each carries its own independent aisle ordering. selectedSupermarketId is
  // local view state (null = "All items"), persisted per family in localStorage —
  // it filters what is shown and which aisle ordering is used, and never rewrites
  // item data or affects what other family members see.
  const supermarkets = ref([])
  const selectedSupermarketId = ref(null)
  const supermarketsLoaded = ref(false)
  // When true and a specific supermarket is selected, hides items allocated to
  // "all supermarkets" / unallocated, leaving only items allocated to this store.
  // Local view state only, not persisted — resets whenever the selection changes.
  const storeOnlyFilter = ref(false)

  let currentFamilyId = null
  let unsubscribeLists = null
  let unsubscribeItems = null
  let unsubscribeSupermarkets = null
  // Guards so a client only auto-provisions the default supermarket once while the
  // create write is in flight (before the snapshot echoes it back).
  let provisioningSupermarket = false

  // Firestore path helpers. Shopping lists and supermarkets live under the family
  // document so the family scope is carried by the path — there is no familyId
  // field on the documents.
  const listsCol = () => collection(db, 'families', currentFamilyId, 'shoppingLists')
  const listDoc = (listId) => doc(db, 'families', currentFamilyId, 'shoppingLists', listId)
  const itemsCol = (listId) => collection(db, 'families', currentFamilyId, 'shoppingLists', listId, 'items')
  const itemDoc = (listId, itemId) => doc(db, 'families', currentFamilyId, 'shoppingLists', listId, 'items', itemId)
  const supermarketsCol = () => collection(db, 'families', currentFamilyId, 'supermarkets')
  const supermarketDoc = (id) => doc(db, 'families', currentFamilyId, 'supermarkets', id)

  function storageKey(familyId) {
    return `lastActiveListId_${familyId}`
  }
  function supermarketStorageKey(familyId) {
    return `selectedSupermarket_${familyId}`
  }

  // The "default" supermarket is the first one (lowest order). It seeds the
  // aisle ordering for the "All items" view and is the one created by migration.
  const defaultSupermarket = computed(() => supermarkets.value[0] ?? null)

  const selectedSupermarket = computed(() =>
    selectedSupermarketId.value
      ? supermarkets.value.find(s => s.id === selectedSupermarketId.value) ?? null
      : null
  )

  // Deduplicated union of aisle names across every supermarket, used as the aisle
  // axis for the "All items" view. The default supermarket's order comes first;
  // aisle names that only exist in other stores are appended alphabetically.
  // Dedup is case-insensitive (keyed on the lowercased name), displaying the
  // first-seen casing — so two stores that both have "Dairy" collapse to one.
  function unionAisles() {
    if (supermarkets.value.length === 0) return null
    const seen = new Map() // lowerName -> { name, order }
    let order = 0
    for (const a of (defaultSupermarket.value?.aisles ?? [])) {
      const key = a.name.toLowerCase()
      if (!seen.has(key)) seen.set(key, { name: a.name, order: order++ })
    }
    const extras = []
    for (const sm of supermarkets.value.slice(1)) {
      for (const a of (sm.aisles ?? [])) {
        const key = a.name.toLowerCase()
        if (!seen.has(key) && !extras.some(e => e.key === key)) {
          extras.push({ key, name: a.name })
        }
      }
    }
    extras.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of extras) seen.set(e.key, { name: e.name, order: order++ })
    return Array.from(seen.values())
  }

  // Aisle ordering for the current view:
  //  - a specific supermarket selected → that supermarket's aisles
  //  - "All items" with supermarkets defined → the deduplicated union
  //  - no supermarkets yet (old data / pre-provision) → the active list's aisles,
  //    falling back to DEFAULT_AISLES (backward compatible with Part A documents)
  const activeAisles = computed(() => {
    if (supermarkets.value.length > 0) {
      if (selectedSupermarket.value) return selectedSupermarket.value.aisles ?? DEFAULT_AISLES
      return unionAisles() ?? DEFAULT_AISLES
    }
    const list = lists.value.find(l => l.id === activeListId.value)
    return list?.aisles ?? DEFAULT_AISLES
  })

  // Items visible in the current view. "All items" (no selection) shows every
  // item; a specific supermarket shows items allocated to it, allocated to all
  // supermarkets, or unallocated (empty allocation). Fields are read defensively
  // so pre-Part-B items (no allocation fields) behave as unallocated.
  const visibleItems = computed(() => {
    const s = selectedSupermarketId.value
    if (!s) return items.value
    return items.value.filter((i) => {
      const ids = i.supermarketIds ?? []
      if (ids.includes(s)) return true
      if (storeOnlyFilter.value) return false
      return (i.allSupermarkets ?? false) || ids.length === 0
    })
  })

  function activateList(listId) {
    if (unsubscribeItems) unsubscribeItems()
    activeListId.value = listId
    if (currentFamilyId) {
      localStorage.setItem(storageKey(currentFamilyId), listId)
    }
    unsubscribeItems = onSnapshot(
      itemsCol(listId),
      (snap) => {
        items.value = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) =>
            a.aisleOrder !== b.aisleOrder
              ? (a.aisleOrder ?? 3) - (b.aisleOrder ?? 3)
              : (a.sortOrder ?? Infinity) !== (b.sortOrder ?? Infinity)
                ? (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
                : a.name.localeCompare(b.name)
          )
      },
    )
  }

  function selectSupermarket(id) {
    selectedSupermarketId.value = id || null
    storeOnlyFilter.value = false
    if (currentFamilyId) {
      if (id) localStorage.setItem(supermarketStorageKey(currentFamilyId), id)
      else localStorage.removeItem(supermarketStorageKey(currentFamilyId))
    }
  }

  function setStoreOnlyFilter(value) {
    storeOnlyFilter.value = value
  }

  function setup(familyId) {
    currentFamilyId = familyId
    // Restore the persisted supermarket selection (validated once the snapshot
    // arrives — a stale ID for a deleted store falls back to "All items").
    selectedSupermarketId.value = localStorage.getItem(supermarketStorageKey(familyId)) || null

    // Lists listener is registered first so it stays the first onSnapshot call.
    unsubscribeLists = onSnapshot(
      listsCol(),
      (snap) => {
        lists.value = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
        const idStillValid = activeListId.value !== null &&
          lists.value.some(l => l.id === activeListId.value)
        if (!idStillValid) {
          if (lists.value.length > 0) {
            const savedId = localStorage.getItem(storageKey(familyId))
            const savedValid = savedId !== null && lists.value.some(l => l.id === savedId)
            activateList(savedValid ? savedId : lists.value[0].id)
          } else {
            unsubscribeItems?.()
            unsubscribeItems = null
            items.value = []
            activeListId.value = null
          }
        }
      },
    )

    unsubscribeSupermarkets = onSnapshot(
      supermarketsCol(),
      (snap) => {
        supermarkets.value = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) =>
            (a.order ?? 0) !== (b.order ?? 0)
              ? (a.order ?? 0) - (b.order ?? 0)
              : (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0)
          )
        supermarketsLoaded.value = true
        if (selectedSupermarketId.value &&
            !supermarkets.value.some(s => s.id === selectedSupermarketId.value)) {
          selectSupermarket(null)
        }
      },
    )
  }

  function teardown() {
    if (unsubscribeLists) unsubscribeLists()
    if (unsubscribeItems) unsubscribeItems()
    if (unsubscribeSupermarkets) unsubscribeSupermarkets()
    unsubscribeLists = null
    unsubscribeItems = null
    unsubscribeSupermarkets = null
    currentFamilyId = null
    lists.value = []
    items.value = []
    activeListId.value = null
    supermarkets.value = []
    supermarketsLoaded.value = false
    selectedSupermarketId.value = null
    storeOnlyFilter.value = false
    provisioningSupermarket = false
  }

  async function deleteList() {
    if (!activeListId.value) return
    const listId = activeListId.value
    // Items must be deleted before the parent — parents-only delete is scoped by the
    // families/{familyId} path, but deleting child items first mirrors established
    // child-before-parent deletion practice (see deleteJob in the jobs store).
    const itemsSnap = await getDocs(itemsCol(listId))
    await Promise.all(itemsSnap.docs.map(d => deleteDoc(itemDoc(listId, d.id))))
    await deleteDoc(listDoc(listId))
  }

  async function createList(name) {
    if (!currentFamilyId) return
    const familyStore = useFamilyStore()
    const ref = await addDoc(listsCol(), {
      name: name.trim(),
      createdAt: serverTimestamp(),
      createdBy: familyStore.currentUser?.uid ?? '',
      aisles: DEFAULT_AISLES,
    })
    activateList(ref.id)
  }

  async function deleteItem(itemId) {
    if (!activeListId.value) return
    await deleteDoc(itemDoc(activeListId.value, itemId))
  }

  function togglePriority(id) {
    if (!activeListId.value) return
    const item = items.value.find(i => i.id === id)
    if (!item) return
    item.priority = !(item.priority ?? false)
    updateDoc(itemDoc(activeListId.value, id), { priority: item.priority })
  }

  // Deliberately does not touch supermarketIds/allSupermarkets — a plain
  // check/uncheck in the list (as opposed to re-adding a done item via the
  // Add item sheet's suggestions) always keeps the item's existing store
  // allocation, since the item document itself never left.
  function toggleDone(id) {
    if (!activeListId.value) return
    const item = items.value.find(i => i.id === id)
    if (!item) return
    const wasUnchecked = item.done
    item.done = !item.done
    const update = { done: item.done }
    if (wasUnchecked) {
      const familyStore = useFamilyStore()
      const uid = familyStore.currentUser?.uid ?? ''
      item.addedBy = uid
      update.addedBy = uid
    } else {
      item.priority = false
      update.priority = false
    }
    updateDoc(itemDoc(activeListId.value, id), update)
  }

  // Restores an item's exact done/addedBy/priority state. Used to undo a toggleDone:
  // toggleDone reassigns addedBy on the uncheck path and clears priority on the check path,
  // so re-toggling is not a faithful inverse — undo must write back the captured pre-toggle values.
  function restoreToggleState(id, { done, addedBy, priority }) {
    if (!activeListId.value) return
    const item = items.value.find(i => i.id === id)
    if (!item) return
    item.done = done
    item.addedBy = addedBy
    item.priority = priority ?? false
    updateDoc(itemDoc(activeListId.value, id), { done, addedBy, priority: priority ?? false })
  }

  function updateItem(id, { name, qty, aisle, supermarketIds, allSupermarkets, priority }) {
    if (!activeListId.value) return
    const item = items.value.find(i => i.id === id)
    if (!item) return
    item.name = name
    item.qty = qty
    const update = { name, qty }
    if (aisle != null) {
      const aisleObj = activeAisles.value.find(a => a.name === aisle)
      item.aisle = aisle
      item.aisleOrder = aisleObj?.order ?? 99
      update.aisle = aisle
      update.aisleOrder = aisleObj?.order ?? 99
    }
    if (supermarketIds !== undefined) {
      item.supermarketIds = supermarketIds
      update.supermarketIds = supermarketIds
    }
    if (allSupermarkets !== undefined) {
      item.allSupermarkets = allSupermarkets
      update.allSupermarkets = allSupermarkets
    }
    if (priority !== undefined) {
      item.priority = priority
      update.priority = priority
    }
    updateDoc(itemDoc(activeListId.value, id), update)
  }

  async function reorderItems(updates) {
    if (!activeListId.value) return
    const batch = writeBatch(db)
    for (const { id, ...fields } of updates) {
      batch.update(itemDoc(activeListId.value, id), fields)
    }
    await batch.commit()
  }

  function addItem(name, qty = '', aisle = null, allocation = {}) {
    if (!activeListId.value) return
    const resolvedAisle = aisle ?? activeAisles.value[0]?.name ?? 'Unknown'
    const aisleObj = activeAisles.value.find(a => a.name === resolvedAisle)
    const familyStore = useFamilyStore()
    addDoc(itemsCol(activeListId.value), {
      name,
      qty,
      aisle: resolvedAisle,
      aisleOrder: aisleObj?.order ?? 99,
      done: false,
      addedBy: familyStore.currentUser?.uid ?? '',
      // Allocation: default unallocated (empty list, not "all") — shows in every view.
      supermarketIds: allocation.supermarketIds ?? [],
      allSupermarkets: allocation.allSupermarkets ?? false,
      priority: allocation.priority ?? false,
      createdAt: serverTimestamp(),
    })
  }

  function restoreItem(id, qty, aisle, allocation = {}) {
    if (!activeListId.value) return false
    const item = items.value.find(i => i.id === id)
    if (!item) return false
    const familyStore = useFamilyStore()
    const uid = familyStore.currentUser?.uid ?? ''
    const aisleObj = activeAisles.value.find(a => a.name === aisle)
    item.done = false
    item.qty = qty
    item.aisle = aisle
    item.aisleOrder = aisleObj?.order ?? 99
    item.addedBy = uid
    const update = {
      done: false, qty, aisle, aisleOrder: aisleObj?.order ?? 99, addedBy: uid,
    }
    // Optional: the re-add sheet passes the item's own allocation back
    // (round-tripped through its UI state, possibly edited by the user).
    // Undefined means "not supplied" — leave the document's existing
    // allocation untouched, same convention as updateItem.
    if (allocation.supermarketIds !== undefined) {
      item.supermarketIds = allocation.supermarketIds
      update.supermarketIds = allocation.supermarketIds
    }
    if (allocation.allSupermarkets !== undefined) {
      item.allSupermarkets = allocation.allSupermarkets
      update.allSupermarkets = allocation.allSupermarkets
    }
    if (allocation.priority !== undefined) {
      item.priority = allocation.priority
      update.priority = allocation.priority
    }
    updateDoc(itemDoc(activeListId.value, id), update)
    return true
  }

  function moveOrCopyItem(itemId, destListId, action) {
    if (!activeListId.value || destListId === activeListId.value) return
    const item = items.value.find(i => i.id === itemId)
    if (!item) return
    const destList = lists.value.find(l => l.id === destListId)
    const destAisles = destList?.aisles ?? DEFAULT_AISLES
    const aisleObj = destAisles.find(a => a.name === item.aisle)
    const familyStore = useFamilyStore()
    addDoc(itemsCol(destListId), {
      name: item.name,
      qty: item.qty ?? '',
      aisle: aisleObj ? item.aisle : 'Unknown',
      aisleOrder: aisleObj?.order ?? 99,
      done: false,
      priority: item.priority ?? false,
      addedBy: familyStore.currentUser?.uid ?? '',
      sortOrder: null,
      createdAt: serverTimestamp(),
    })
    if (action === 'move') {
      items.value = items.value.filter(i => i.id !== itemId)
      deleteDoc(itemDoc(activeListId.value, itemId))
    }
  }

  async function saveAisles(aisles) {
    if (!activeListId.value) return
    await updateDoc(listDoc(activeListId.value), { aisles })
  }

  async function deleteAisle(aisleName) {
    if (!activeListId.value) return
    const batch = writeBatch(db)
    const affectedItems = items.value.filter(i => i.aisle === aisleName)
    for (const item of affectedItems) {
      batch.update(
        itemDoc(activeListId.value, item.id),
        { aisle: 'Unknown', aisleOrder: 99 },
      )
    }
    const newAisles = activeAisles.value.filter(a => a.name !== aisleName)
    batch.update(listDoc(activeListId.value), { aisles: newAisles })
    await batch.commit()
  }

  // ── Supermarkets (Part B) ───────────────────────────────────────────────────

  async function addSupermarket(name) {
    if (!currentFamilyId) return
    const familyStore = useFamilyStore()
    const maxOrder = supermarkets.value.reduce((m, s) => Math.max(m, s.order ?? 0), -1)
    await addDoc(supermarketsCol(), {
      name: name.trim(),
      aisles: DEFAULT_AISLES,
      order: maxOrder + 1,
      createdBy: familyStore.currentUser?.uid ?? '',
      createdAt: serverTimestamp(),
    })
  }

  async function renameSupermarket(id, name) {
    if (!currentFamilyId) return
    await updateDoc(supermarketDoc(id), { name: name.trim() })
  }

  // Deleting a supermarket strips its ID from every loaded item that references
  // it; an item left with an empty allocation becomes unallocated (visible
  // everywhere) rather than orphaned. The supermarket document is deleted in the
  // same batch. If the deleted store was selected, the view resets to "All items".
  async function deleteSupermarket(id) {
    if (!currentFamilyId) return
    const batch = writeBatch(db)
    // Only the active list's loaded items are stripped. Post-collapse there is a
    // single list, so this covers every item; a dangling id in another list would
    // simply filter to nothing until that list is merged.
    if (activeListId.value) {
      for (const item of items.value) {
        const ids = item.supermarketIds ?? []
        if (ids.includes(id)) {
          batch.update(itemDoc(activeListId.value, item.id), {
            supermarketIds: ids.filter(x => x !== id),
          })
        }
      }
    }
    batch.delete(supermarketDoc(id))
    await batch.commit()
    if (selectedSupermarketId.value === id) selectSupermarket(null)
  }

  async function saveSupermarketAisles(id, aisles) {
    if (!currentFamilyId) return
    await updateDoc(supermarketDoc(id), { aisles })
  }

  // Removing an aisle from a supermarket only drops it from that store's ordering.
  // Unlike the list-level deleteAisle, it deliberately does NOT rewrite item.aisle —
  // the same aisle name may still be used by another store, and items whose aisle
  // is absent from the selected store already fall to the bottom of that view.
  async function deleteSupermarketAisle(id, aisleName) {
    if (!currentFamilyId) return
    const sm = supermarkets.value.find(s => s.id === id)
    if (!sm) return
    const next = (sm.aisles ?? []).filter(a => a.name !== aisleName)
    await updateDoc(supermarketDoc(id), { aisles: next })
  }

  // Auto-provision the family's default supermarket, seeded from the surviving
  // list's aisles (or DEFAULT_AISLES). This is the automatic, additive migration
  // for existing families: called by the view once a parent has loaded and no
  // supermarket exists yet. Children never provision (rules would deny anyway);
  // until a parent provisions, activeAisles falls back to the list's aisles.
  async function ensureDefaultSupermarket() {
    if (!currentFamilyId || provisioningSupermarket) return
    if (!supermarketsLoaded.value || supermarkets.value.length > 0) return
    provisioningSupermarket = true
    const familyStore = useFamilyStore()
    const survivingList = lists.value.find(l => l.id === activeListId.value) ?? lists.value[0]
    const seedAisles = survivingList?.aisles ?? DEFAULT_AISLES
    try {
      await addDoc(supermarketsCol(), {
        name: 'My supermarket',
        aisles: seedAisles,
        order: 0,
        createdBy: familyStore.currentUser?.uid ?? '',
        createdAt: serverTimestamp(),
      })
    } catch {
      // Allow a later retry if the write was rejected (e.g. a child called this).
      provisioningSupermarket = false
    }
  }

  return {
    lists, items, activeListId, activeAisles, visibleItems,
    supermarkets, selectedSupermarketId, selectedSupermarket, defaultSupermarket, supermarketsLoaded,
    storeOnlyFilter, setStoreOnlyFilter,
    setup, teardown, activateList, createList, deleteList, deleteItem,
    toggleDone, togglePriority, restoreToggleState, updateItem, addItem, restoreItem,
    reorderItems, saveAisles, deleteAisle, moveOrCopyItem,
    selectSupermarket, addSupermarket, renameSupermarket, deleteSupermarket,
    saveSupermarketAisles, deleteSupermarketAisle, ensureDefaultSupermarket,
  }
})
