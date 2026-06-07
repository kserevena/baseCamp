import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, query, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from './family.js'

const AISLE_ORDERS = {
  'Dairy': 1,
  'Meat': 2,
  'Dry goods': 3,
  'Bakery': 4,
  'Fruit & veg': 5,
}

export const useShoppingStore = defineStore('shopping', () => {
  const lists = ref([])
  const items = ref([])
  const activeListId = ref(null)
  let currentFamilyId = null
  let unsubscribeLists = null
  let unsubscribeItems = null

  function activateList(listId) {
    if (unsubscribeItems) unsubscribeItems()
    activeListId.value = listId
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
            activateList(lists.value[0].id)
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
    })
    activateList(ref.id)
  }

  async function deleteItem(itemId) {
    if (!activeListId.value) return
    await deleteDoc(doc(db, 'shoppingLists', activeListId.value, 'items', itemId))
  }

  function toggleDone(id) {
    if (!activeListId.value) return
    const item = items.value.find(i => i.id === id)
    if (!item) return
    item.done = !item.done
    updateDoc(doc(db, 'shoppingLists', activeListId.value, 'items', id), { done: item.done })
  }

  async function reorderItems(updates) {
    if (!activeListId.value) return
    const batch = writeBatch(db)
    for (const { id, ...fields } of updates) {
      batch.update(doc(db, 'shoppingLists', activeListId.value, 'items', id), fields)
    }
    await batch.commit()
  }

  function addItem(name, qty = '', aisle = 'Dry goods') {
    if (!activeListId.value) return
    const familyStore = useFamilyStore()
    addDoc(collection(db, 'shoppingLists', activeListId.value, 'items'), {
      name,
      qty,
      aisle,
      aisleOrder: AISLE_ORDERS[aisle] ?? 3,
      done: false,
      addedBy: familyStore.currentUser?.uid ?? '',
      fromMeal: null,
      createdAt: serverTimestamp(),
    })
  }

  return { lists, items, activeListId, setup, teardown, activateList, createList, deleteList, deleteItem, toggleDone, addItem, reorderItems }
})
