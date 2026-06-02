import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useShoppingStore = defineStore('shopping', () => {
  const items = ref([
    { id: '1', name: 'Milk',            qty: '2 pints', aisle: 'Dairy',       aisleOrder: 1, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { id: '2', name: 'Cheddar cheese',  qty: '400g',    aisle: 'Dairy',       aisleOrder: 1, done: false, addedBy: 'mock_mum',  fromMeal: 'bolognese' },
    { id: '3', name: 'Chicken thighs',  qty: '1kg',     aisle: 'Meat',        aisleOrder: 2, done: false, addedBy: 'mock_mum',  fromMeal: 'roast' },
    { id: '4', name: 'Bacon',           qty: '300g',    aisle: 'Meat',        aisleOrder: 2, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { id: '5', name: 'Pasta',           qty: '500g',    aisle: 'Dry goods',   aisleOrder: 3, done: false, addedBy: 'mock_ella', fromMeal: 'bolognese' },
    { id: '6', name: 'Tinned tomatoes', qty: 'x2',      aisle: 'Dry goods',   aisleOrder: 3, done: false, addedBy: 'mock_mum',  fromMeal: 'bolognese' },
    { id: '7', name: 'Bread',           qty: '1 loaf',  aisle: 'Bakery',      aisleOrder: 4, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { id: '8', name: 'Apples',          qty: '6 pack',  aisle: 'Fruit & veg', aisleOrder: 5, done: false, addedBy: 'mock_sam',  fromMeal: null },
    { id: '9', name: 'Broccoli',        qty: '1 head',  aisle: 'Fruit & veg', aisleOrder: 5, done: false, addedBy: 'mock_mum',  fromMeal: null },
  ])

  function toggleDone(id) {
    const item = items.value.find(i => i.id === id)
    if (item) item.done = !item.done
  }

  function addItem(name, qty = '', aisle = 'Dry goods') {
    items.value.push({
      id: Date.now().toString(),
      name, qty, aisle,
      aisleOrder: 3,
      done: false,
      addedBy: 'mock_dad',
      fromMeal: null,
    })
  }

  return { items, toggleDone, addItem }
})
