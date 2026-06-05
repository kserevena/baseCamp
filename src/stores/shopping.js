import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from './family.js'

function getWeekId() {
  const d = new Date()
  const dayNum = d.getDay() || 7
  d.setDate(d.getDate() + 4 - dayNum)
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNum = Math.ceil((((d - yearStart) / 86400000) + 1) / 7)
  return `${d.getFullYear()}-week-${String(weekNum).padStart(2, '0')}`
}

const AISLE_ORDERS = {
  'Dairy': 1,
  'Meat': 2,
  'Dry goods': 3,
  'Bakery': 4,
  'Fruit & veg': 5,
}

export const useShoppingStore = defineStore('shopping', () => {
  const items = ref([])
  let weekId = getWeekId()
  let unsubscribe = null

  function setup() {
    weekId = getWeekId()
    unsubscribe = onSnapshot(
      collection(db, 'shoppingLists', weekId, 'items'),
      (snap) => {
        items.value = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => a.aisleOrder - b.aisleOrder)
      },
    )
  }

  function teardown() {
    if (unsubscribe) unsubscribe()
  }

  function toggleDone(id) {
    const item = items.value.find(i => i.id === id)
    if (!item) return
    item.done = !item.done
    updateDoc(doc(db, 'shoppingLists', weekId, 'items', id), { done: item.done })
  }

  function addItem(name, qty = '', aisle = 'Dry goods') {
    const familyStore = useFamilyStore()
    addDoc(collection(db, 'shoppingLists', weekId, 'items'), {
      name,
      qty,
      aisle,
      aisleOrder: AISLE_ORDERS[aisle] ?? 3,
      done: false,
      addedBy: familyStore.currentUser.uid,
      fromMeal: null,
      createdAt: serverTimestamp(),
    })
  }

  return { items, setup, teardown, toggleDone, addItem }
})
