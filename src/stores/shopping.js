import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, query, where, writeBatch,
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

  const activeAisles = computed(() => {
    const list = lists.value.find(l => l.id === activeListId.value)
    return list?.aisles ?? DEFAULT_AISLES
  })
  let currentFamilyId = null
  let unsubscribeLists = null
  let unsubscribeItems = null

  function storageKey(familyId) {
    return `lastActiveListId_${familyId}`
  }

  function activateList(listId) {
    if (unsubscribeItems) unsubscribeItems()
    activeListId.value = listId
    if (currentFamilyId) {
      localStorage.setItem(storageKey(currentFamilyId), listId)
    }
    unsubscribeItems = onSnapshot(
      collection(db, 'shoppingLists', listId, 'items'),
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

  function setup(familyId) {
    currentFamilyId = familyId
    unsubscribeLists = onSnapshot(
      query(collection(db, 'shoppingLists'), where('familyId', '==', familyId)),
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
  }

  function teardown() {
    if (unsubscribeLists) unsubscribeLists()
    if (unsubscribeItems) unsubscribeItems()
    unsubscribeLists = null
    unsubscribeItems = null
    lists.value = []
    items.value = []
    activeListId.value = null
  }

  async function deleteList() {
    if (!activeListId.value) return
    const listId = activeListId.value
    // Items must be deleted before the parent — the items rule does a get() on the
    // parent to read familyId; deleting the parent first would deny item deletes.
    const itemsSnap = await getDocs(collection(db, 'shoppingLists', listId, 'items'))
    await Promise.all(itemsSnap.docs.map(d => deleteDoc(doc(db, 'shoppingLists', listId, 'items', d.id))))
    await deleteDoc(doc(db, 'shoppingLists', listId))
  }

  async function createList(name) {
    const familyStore = useFamilyStore()
    const ref = await addDoc(collection(db, 'shoppingLists'), {
      familyId: currentFamilyId,
      name: name.trim(),
      createdAt: serverTimestamp(),
      createdBy: familyStore.currentUser?.uid ?? '',
      aisles: DEFAULT_AISLES,
    })
    activateList(ref.id)
  }

  async function deleteItem(itemId) {
    if (!activeListId.value) return
    await deleteDoc(doc(db, 'shoppingLists', activeListId.value, 'items', itemId))
  }

  function togglePriority(id) {
    if (!activeListId.value) return
    const item = items.value.find(i => i.id === id)
    if (!item) return
    item.priority = !(item.priority ?? false)
    updateDoc(doc(db, 'shoppingLists', activeListId.value, 'items', id), { priority: item.priority })
  }

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
    updateDoc(doc(db, 'shoppingLists', activeListId.value, 'items', id), update)
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
    updateDoc(doc(db, 'shoppingLists', activeListId.value, 'items', id), { done, addedBy, priority: priority ?? false })
  }

  function updateItem(id, { name, qty, aisle }) {
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
    updateDoc(doc(db, 'shoppingLists', activeListId.value, 'items', id), update)
  }

  async function reorderItems(updates) {
    if (!activeListId.value) return
    const batch = writeBatch(db)
    for (const { id, ...fields } of updates) {
      batch.update(doc(db, 'shoppingLists', activeListId.value, 'items', id), fields)
    }
    await batch.commit()
  }

  function addItem(name, qty = '', aisle = null) {
    if (!activeListId.value) return
    const resolvedAisle = aisle ?? activeAisles.value[0]?.name ?? 'Unknown'
    const aisleObj = activeAisles.value.find(a => a.name === resolvedAisle)
    const familyStore = useFamilyStore()
    addDoc(collection(db, 'shoppingLists', activeListId.value, 'items'), {
      name,
      qty,
      aisle: resolvedAisle,
      aisleOrder: aisleObj?.order ?? 99,
      done: false,
      addedBy: familyStore.currentUser?.uid ?? '',
      createdAt: serverTimestamp(),
    })
  }

  function restoreItem(id, qty, aisle) {
    if (!activeListId.value) return false
    const item = items.value.find(i => i.id === id)
    if (!item) return false
    const aisleObj = activeAisles.value.find(a => a.name === aisle)
    item.done = false
    item.qty = qty
    item.aisle = aisle
    item.aisleOrder = aisleObj?.order ?? 99
    updateDoc(doc(db, 'shoppingLists', activeListId.value, 'items', id), {
      done: false, qty, aisle, aisleOrder: aisleObj?.order ?? 99,
    })
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
    addDoc(collection(db, 'shoppingLists', destListId, 'items'), {
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
      deleteDoc(doc(db, 'shoppingLists', activeListId.value, 'items', itemId))
    }
  }

  async function saveAisles(aisles) {
    if (!activeListId.value) return
    await updateDoc(doc(db, 'shoppingLists', activeListId.value), { aisles })
  }

  async function deleteAisle(aisleName) {
    if (!activeListId.value) return
    const batch = writeBatch(db)
    const affectedItems = items.value.filter(i => i.aisle === aisleName)
    for (const item of affectedItems) {
      batch.update(
        doc(db, 'shoppingLists', activeListId.value, 'items', item.id),
        { aisle: 'Unknown', aisleOrder: 99 },
      )
    }
    const newAisles = activeAisles.value.filter(a => a.name !== aisleName)
    batch.update(doc(db, 'shoppingLists', activeListId.value), { aisles: newAisles })
    await batch.commit()
  }

  return { lists, items, activeListId, activeAisles, setup, teardown, activateList, createList, deleteList, deleteItem, toggleDone, togglePriority, restoreToggleState, updateItem, addItem, restoreItem, reorderItems, saveAisles, deleteAisle, moveOrCopyItem }
})
