import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, doc, setDoc, onSnapshot, runTransaction, increment,
  writeBatch, query, where, orderBy, getDocs, Timestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from '@/stores/family.js'
import { ROLE_PARENT } from '@/constants/roles.js'
import { pendingPaymentDates } from '@/utils/paymentSchedule.js'

export const usePocketMoneyStore = defineStore('pocketMoney', () => {
  const familyStore = useFamilyStore()

  const snapshots = ref([])        // [{ uid, weeklyAmount, paymentDay, balance, lastUpdated }]
  const transactions = ref([])     // loaded on demand via getDocs
  const transactionsUid = ref(null)
  const loading = ref(false)

  let currentFamilyId = null
  let unsubscribe = null

  // Locally-computed balance including any payments not yet flushed to Firestore.
  // Returns null when the child has no pocket money document.
  // A missing lastUpdated means the accrual state is unknown — treat it as "now"
  // (no pending payments) rather than guessing at decades of back-pay from the epoch.
  const displayBalance = computed(() => (uid) => {
    const snap = snapshots.value.find(s => s.uid === uid)
    if (!snap) return null
    const lastUpdated = snap.lastUpdated?.toDate?.() ?? new Date()
    const dates = pendingPaymentDates(lastUpdated, snap.paymentDay ?? 0)
    return (snap.balance ?? 0) + dates.length * (snap.weeklyAmount ?? 0)
  })

  function setup(familyId, currentUser) {
    if (unsubscribe) unsubscribe()
    currentFamilyId = familyId

    if (currentUser.role === ROLE_PARENT) {
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

  // Hard ceiling on payments per flush. Transactions allow 500 writes; staying far
  // below it means a corrupt/ancient lastUpdated can never produce a commit that is
  // doomed to fail. 400 weeks ≈ 7.7 years — any gap that large is not real accrual.
  const MAX_PENDING_PAYMENTS = 400

  // Parent-triggered: calculate pending payments and write them to Firestore.
  // Children never call this — they see a locally-computed displayBalance instead.
  //
  // Runs as a Firestore transaction (online-only) so two parents flushing at once
  // cannot double-pay: the transaction re-reads the authoritative lastUpdated, and a
  // concurrent flush retries against the fresh value and finds nothing pending.
  // Payment transactions use deterministic IDs (payment-YYYY-MM-DD) so any residual
  // double-write lands on the same document instead of duplicating it. Offline the
  // transaction fails — that's fine, displayBalance already shows pending payments
  // locally and the flush happens next time a parent opens the sheet online.
  async function flushPendingPayments(childUid) {
    if (!currentFamilyId) return
    if (!snapshots.value.find(s => s.uid === childUid)) return

    const snapRef = doc(db, 'families', currentFamilyId, 'pocketMoney', childUid)
    const txnCol = collection(db, 'families', currentFamilyId, 'pocketMoney', childUid, 'transactions')

    await runTransaction(db, async (txn) => {
      const docSnap = await txn.get(snapRef)
      if (!docSnap.exists()) return
      const data = docSnap.data()

      const lastUpdated = data.lastUpdated?.toDate?.() ?? new Date()
      const dates = pendingPaymentDates(lastUpdated, data.paymentDay ?? 0)
      if (dates.length === 0 || dates.length > MAX_PENDING_PAYMENTS) return

      const weeklyAmount = data.weeklyAmount ?? 0
      txn.update(snapRef, {
        balance: increment(dates.length * weeklyAmount),
        lastUpdated: Timestamp.fromDate(new Date()),
      })

      for (const date of dates) {
        txn.set(doc(txnCol, 'payment-' + date.toISOString().slice(0, 10)), {
          type: 'payment',
          amount: weeklyAmount,
          date: Timestamp.fromDate(date),
          recordedBy: null,
          note: null,
        })
      }
    })
  }

  // Parent creates or updates a child's pocket money settings.
  // startingAmount is only applied when creating for the first time.
  async function saveConfig(childUid, { startingAmount, weeklyAmount, paymentDay }) {
    if (!currentFamilyId) throw new Error('Store not initialised')
    const isNew = !snapshots.value.find(s => s.uid === childUid)
    const data = { weeklyAmount, paymentDay }
    if (isNew) {
      // Number.isFinite rather than ?? — NaN from an empty form field must not be stored.
      data.balance = Number.isFinite(startingAmount) ? startingAmount : 0
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

    // increment() is commutative, so concurrent or offline-queued withdrawals can't
    // overwrite each other. lastUpdated is NOT touched here — it means "payments
    // accrued through this date", and stamping it would swallow unflushed payments.
    batch.update(snapRef, {
      balance: increment(-amount),
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
    cutoff.setUTCDate(cutoff.getUTCDate() - 90)

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
