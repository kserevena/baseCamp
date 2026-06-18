import { db } from './config.js'
import { collection, getDocs, doc, setDoc, addDoc, serverTimestamp, Timestamp } from 'firebase/firestore'

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

  // ── householdJobs ───────────────────────────────────────────────────────────

  const jobsData = [
    {
      id: 'job_gutters',
      data: {
        title: 'Clean gutters',
        description: 'Front and back of the house — last done 2 years ago.',
        category: 'Maintenance',
        status: 'planned',
        priority: 'medium',
        costEstimate: 80,
        suggestedBy: 'mock_dad',
        assignedTo: 'mock_dad',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      id: 'job_garden_tidy',
      data: {
        title: 'Garden tidy-up',
        description: null,
        category: 'Garden',
        status: 'suggested',
        priority: 'low',
        costEstimate: null,
        suggestedBy: 'mock_ella',
        assignedTo: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      id: 'job_shed_clear',
      data: {
        title: 'Clear out the shed',
        description: 'Sort tools, donate anything unused.',
        category: 'Maintenance',
        status: 'done',
        priority: null,
        costEstimate: null,
        suggestedBy: 'mock_mum',
        assignedTo: 'mock_mum',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
    {
      id: 'job_holiday',
      data: {
        title: 'Plan summer holiday',
        description: 'Budget £2 000. Two weeks, somewhere sunny.',
        category: 'Planning',
        status: 'in_progress',
        priority: 'high',
        costEstimate: 2000,
        suggestedBy: 'mock_mum',
        assignedTo: 'mock_mum',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
    },
  ]

  for (const job of jobsData) {
    await setDoc(doc(db, 'families', FAMILY_ID, 'householdJobs', job.id), job.data)
  }

  // Subtasks for the summer holiday job
  const holidaySubtasks = [
    { id: 'st_flights',        title: 'Book flights',       done: true,  order: 1 },
    { id: 'st_insurance',      title: 'Travel insurance',   done: true,  order: 2 },
    { id: 'st_accommodation',  title: 'Book accommodation', done: false, order: 3 },
    { id: 'st_parking',        title: 'Airport parking',    done: false, order: 4 },
    { id: 'st_pack',           title: 'Pack bags',          done: false, order: 5 },
  ]
  for (const st of holidaySubtasks) {
    await setDoc(
      doc(db, 'families', FAMILY_ID, 'householdJobs', 'job_holiday', 'subtasks', st.id),
      {
        familyId:   FAMILY_ID,
        jobId:      'job_holiday',
        title:      st.title,
        done:       st.done,
        assignedTo: st.id === 'st_flights' ? 'mock_mum' : null,
        order:      st.order,
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      },
    )
  }

  console.log('[BaseCamp] Seed complete.')
}
