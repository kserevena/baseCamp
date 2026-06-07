import { db } from './config.js'
import { collection, getDocs, doc, setDoc, addDoc, serverTimestamp } from 'firebase/firestore'

const FAMILY_ID = 'family_1'

export async function seedIfEmpty() {
  const membersSnap = await getDocs(collection(db, 'families', FAMILY_ID, 'members'))
  if (!membersSnap.empty) return

  console.log('[BaseCamp] Seeding Firestore with mock data...')

  const members = [
    { uid: 'mock_dad',  name: 'Dad',  role: 'parent', colour: '#378ADD' },
    { uid: 'mock_mum',  name: 'Mum',  role: 'parent', colour: '#1D9E75' },
    { uid: 'mock_ella', name: 'Ella', role: 'child',  colour: '#D4537E' },
    { uid: 'mock_sam',  name: 'Sam',  role: 'child',  colour: '#EF9F27' },
  ]
  for (const m of members) {
    await setDoc(doc(db, 'families', FAMILY_ID, 'members', m.uid), {
      name: m.name, role: m.role, colour: m.colour,
    })
  }

  const listRef = await addDoc(collection(db, 'shoppingLists'), {
    familyId: FAMILY_ID,
    name: "This week's shop",
    createdAt: serverTimestamp(),
    createdBy: 'mock_dad',
  })
  const items = [
    { name: 'Milk',            qty: '2 pints', aisle: 'Dairy',       aisleOrder: 1, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { name: 'Cheddar cheese',  qty: '400g',    aisle: 'Dairy',       aisleOrder: 1, done: false, addedBy: 'mock_mum',  fromMeal: 'bolognese' },
    { name: 'Chicken thighs',  qty: '1kg',     aisle: 'Meat',        aisleOrder: 2, done: false, addedBy: 'mock_mum',  fromMeal: 'roast' },
    { name: 'Bacon',           qty: '300g',    aisle: 'Meat',        aisleOrder: 2, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { name: 'Pasta',           qty: '500g',    aisle: 'Dry goods',   aisleOrder: 3, done: false, addedBy: 'mock_ella', fromMeal: 'bolognese' },
    { name: 'Tinned tomatoes', qty: 'x2',      aisle: 'Dry goods',   aisleOrder: 3, done: false, addedBy: 'mock_mum',  fromMeal: 'bolognese' },
    { name: 'Bread',           qty: '1 loaf',  aisle: 'Bakery',      aisleOrder: 4, done: false, addedBy: 'mock_dad',  fromMeal: null },
    { name: 'Apples',          qty: '6 pack',  aisle: 'Fruit & veg', aisleOrder: 5, done: false, addedBy: 'mock_sam',  fromMeal: null },
    { name: 'Broccoli',        qty: '1 head',  aisle: 'Fruit & veg', aisleOrder: 5, done: false, addedBy: 'mock_mum',  fromMeal: null },
  ]
  for (const item of items) {
    await addDoc(collection(db, 'shoppingLists', listRef.id, 'items'), {
      ...item, createdAt: serverTimestamp(),
    })
  }

  const meals = [
    { familyId: FAMILY_ID, name: 'Pasta bolognese',  votes: ['mock_dad', 'mock_mum', 'mock_ella', 'mock_sam'], ingredients: [] },
    { familyId: FAMILY_ID, name: 'Roast chicken',    votes: ['mock_mum', 'mock_dad'], ingredients: [] },
    { familyId: FAMILY_ID, name: 'Bacon sandwiches', votes: ['mock_dad', 'mock_sam'], ingredients: [] },
    { familyId: FAMILY_ID, name: 'Veggie stir fry',  votes: ['mock_ella'], ingredients: [] },
  ]
  for (const meal of meals) {
    await addDoc(collection(db, 'meals'), meal)
  }

  console.log('[BaseCamp] Seed complete.')
}
