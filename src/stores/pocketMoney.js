import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, doc, setDoc, onSnapshot,
  writeBatch, query, where, orderBy, getDocs, Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from '@/stores/family.js'

export const usePocketMoneyStore = defineStore('pocketMoney', () => {
  const familyStore = useFamilyStore()

  const snapshots = ref([])        // [{ uid, weeklyAmount, paymentDay, balance, lastUpdated }]
  const transactions = ref([])     // loaded on demand via getDocs
  const transactionsUid = ref(null)
  const loading = ref(false)

  let currentFamilyId = null
  let unsubscribe = null

  // Returns an array of Date objects for each occurrence of paymentDay (0=Sun…6=Sat)
  // strictly after lastUpdated and up to and including today.
  function pendingPaymentDates(lastUpdated, paymentDay) {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const cursor = new Date(lastUpdated)
    cursor.setHours(0, 0, 0, 0)
    cursor.setDate(cursor.getDate() + 1) // exclusive of lastUpdated

    const dates = []
    while (cursor <= today) {
      if (cursor.getDay() === paymentDay) {
        dates.push(new Date(cursor))
      }
      cursor.setDate(cursor.getDate() + 1)
    }
    return dates
  }

  // Locally-computed balance including any payments not yet flushed to Firestore.
  // Returns null when the child has no pocket money document.
  const displayBalance = computed(() => (uid) => {
    const snap = snapshots.value.find(s => s.uid === uid)
    if (!snap) return null
    const lastUpdated = snap.lastUpdated?.toDate?.() ?? new Date(0)
    const dates = pendingPaymentDates(lastUpdated, snap.paymentDay ?? 0)
    return (snap.balance ?? 0) + dates.length * (snap.weeklyAmount ?? 0)
  })

  function setup(familyId, currentUser) {
    if (unsubscribe) unsubscribe()
    currentFamilyId = familyId

    if (currentUser.role === 'parent') {
      unsubscribe = onSnapshot(
        collection(db, 'families', familyId, 'pocketMoney'),
        (snap) => {
          snapshots.value = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
        },
      )
    } else {
      unsubscribe = onSnapshot(
        doc(db, 'families', familyId, 'pocketMoney', currentUser.uid),
        (d) => {
          snapshots.value = d.exists() ? [{ uid: d.id, ...d.data() }] : []
        },
      )
    }
  }

  function teardown() {
    if (unsubscribe) unsubscribe()
    unsubscribe = null
    currentFamilyId = null
    snapshots.value = []
    transactions.value = []
    transactionsUid.value = null
  }

  // Parent-triggered: calculate pending payments and write them to Firestore.
  // Children never call this — they see a locally-computed displayBalance instead.
  async function flushPendingPayments(childUid) {
    if (!currentFamilyId) return
    const snap = snapshots.value.find(s => s.uid === childUid)
    if (!snap) return

    const lastUpdated = snap.lastUpdated?.toDate?.() ?? new Date(0)
    const dates = pendingPaymentDates(lastUpdated, snap.paymentDay ?? 0)
    if (dates.length === 0) return

    const batch = writeBatch(db)
    const snapRef = doc(db, 'families', currentFamilyId, 'pocketMoney', childUid)
    const txnCol = collection(db, 'families', currentFamilyId, 'pocketMoney', childUid, 'transactions')

    const newBalance = (snap.balance ?? 0) + dates.length * (snap.weeklyAmount ?? 0)
    batch.update(snapRef, {
      balance: newBalance,
      lastUpdated: Timestamp.fromDate(new Date()),
    })

    for (const date of dates) {
      batch.set(doc(txnCol), {
        type: 'payment',
        amount: snap.weeklyAmount ?? 0,
        date: Timestamp.fromDate(date),
        recordedBy: null,
        note: null,
      })
    }

    await batch.commit()
  }

  // Parent creates or updates a child's pocket money settings.
  // startingAmount is only applied when creating for the first time.
  async function saveConfig(childUid, { startingAmount, weeklyAmount, paymentDay }) {
    if (!currentFamilyId) throw new Error('Store not initialised')
    const isNew = !snapshots.value.find(s => s.uid === childUid)
    const data = { weeklyAmount, paymentDay }
    if (isNew) {
      data.balance = startingAmount ?? 0
      data.lastUpdated = Timestamp.now()
    }
    await setDoc(doc(db, 'families', currentFamilyId, 'pocketMoney', childUid), data, { merge: true })
  }

  // Parent records a cash withdrawal for a child.
  async function recordWithdrawal(childUid, { amount, note }) {
    if (!currentFamilyId) return
    const snap = snapshots.value.find(s => s.uid === childUid)
    if (!snap) return

    const batch = writeBatch(db)
    const snapRef = doc(db, 'families', currentFamilyId, 'pocketMoney', childUid)
    const txnRef = doc(collection(db, 'families', currentFamilyId, 'pocketMoney', childUid, 'transactions'))

    batch.update(snapRef, {
      balance: (snap.balance ?? 0) - amount,
      lastUpdated: Timestamp.fromDate(new Date()),
    })
    batch.set(txnRef, {
      type: 'withdrawal',
      amount,
      date: Timestamp.fromDate(new Date()),
      recordedBy: familyStore.currentUser?.uid ?? null,
      note: note || null,
    })

    await batch.commit()
  }

  // Load the last 90 days of transactions for a child (one-time, not a listener).
  async function loadTransactions(childUid) {
    if (!currentFamilyId) return
    loading.value = true
    transactionsUid.value = childUid

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 90)

    const q = query(
      collection(db, 'families', currentFamilyId, 'pocketMoney', childUid, 'transactions'),
      where('date', '>=', Timestamp.fromDate(cutoff)),
      orderBy('date', 'desc'),
    )

    const snap = await getDocs(q)
    transactions.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    loading.value = false
  }

  return {
    snapshots, transactions, transactionsUid, loading, displayBalance,
    setup, teardown, flushPendingPayments, saveConfig, recordWithdrawal, loadTransactions,
    // exported for unit tests
    pendingPaymentDates,
  }
})
