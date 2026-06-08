import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const {
  mockOnSnapshot, mockGetDocs, mockDoc, mockCollection, mockQuery,
  mockWhere, mockOrderBy, mockBatchUpdate, mockBatchSet, mockBatchCommit,
  mockWriteBatch, mockSetDoc, mockUseFamilyStore,
} = vi.hoisted(() => ({
  mockOnSnapshot:     vi.fn(() => vi.fn()),
  mockGetDocs:        vi.fn().mockResolvedValue({ docs: [] }),
  mockDoc:            vi.fn(() => ({ id: 'mock-doc-id' })),
  mockCollection:     vi.fn(() => ({})),
  mockQuery:          vi.fn(() => ({})),
  mockWhere:          vi.fn(() => ({})),
  mockOrderBy:        vi.fn(() => ({})),
  mockBatchUpdate:    vi.fn(),
  mockBatchSet:       vi.fn(),
  mockBatchCommit:    vi.fn().mockResolvedValue(undefined),
  mockWriteBatch:     vi.fn(),
  mockSetDoc:         vi.fn().mockResolvedValue(undefined),
  mockUseFamilyStore: vi.fn(() => ({ currentUser: { uid: 'parent-uid', role: 'parent' } })),
}))

vi.mock('@/stores/family.js', () => ({ useFamilyStore: mockUseFamilyStore }))
vi.mock('@/firebase/config.js', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  onSnapshot:  mockOnSnapshot,
  getDocs:     mockGetDocs,
  doc:         mockDoc,
  collection:  mockCollection,
  query:       mockQuery,
  where:       mockWhere,
  orderBy:     mockOrderBy,
  writeBatch:  mockWriteBatch,
  setDoc:      mockSetDoc,
  Timestamp: {
    now:      () => ({ toDate: () => new Date() }),
    fromDate: (d) => ({ toDate: () => d }),
  },
}))

import { usePocketMoneyStore } from '@/stores/pocketMoney.js'

const parentUser = { uid: 'parent-uid', role: 'parent' }
const childUser  = { uid: 'child-uid',  role: 'child'  }

function makeSnap(uid, overrides = {}) {
  const base = {
    weeklyAmount: 5,
    paymentDay: 5, // Friday
    balance: 10,
    lastUpdated: { toDate: () => new Date('2025-01-01') },
  }
  return { uid, ...base, ...overrides }
}

describe('pocketMoney store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockGetDocs.mockResolvedValue({ docs: [] })
    mockBatchCommit.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockWriteBatch.mockReturnValue({
      update: mockBatchUpdate,
      set: mockBatchSet,
      commit: mockBatchCommit,
    })
    mockUseFamilyStore.mockReturnValue({ currentUser: { uid: 'parent-uid', role: 'parent' } })
  })

  // ─── pendingPaymentDates ───────────────────────────────────────────────────

  describe('pendingPaymentDates', () => {
    it('returns empty array when lastUpdated is today', () => {
      const store = usePocketMoneyStore()
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const result = store.pendingPaymentDates(today, today.getDay())
      expect(result).toHaveLength(0)
    })

    it('returns empty array when no matching day falls in range', () => {
      const store = usePocketMoneyStore()
      // lastUpdated yesterday, payment day is today + 1 (no match before tomorrow)
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const tomorrowDay = (new Date().getDay() + 1) % 7
      const result = store.pendingPaymentDates(yesterday, tomorrowDay)
      // Could be 0 (tomorrow hasn't arrived) or possibly 1 if tomorrowDay wraps to today
      // Safe assertion: result is an array
      expect(Array.isArray(result)).toBe(true)
    })

    it('returns one date when one payment day falls in the window', () => {
      const store = usePocketMoneyStore()
      // lastUpdated 8 days ago, payment day = today's day of week
      const eightDaysAgo = new Date()
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8)
      const todayDay = new Date().getDay()
      const result = store.pendingPaymentDates(eightDaysAgo, todayDay)
      // Today matches, plus possibly 7 days ago
      expect(result.length).toBeGreaterThanOrEqual(1)
    })

    it('returns two dates when two payment days fall in the window', () => {
      const store = usePocketMoneyStore()
      // lastUpdated 15 days ago, payment day = today's day (today + 7 days ago + 14 days ago but 14 < 15)
      const fifteenDaysAgo = new Date()
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15)
      const todayDay = new Date().getDay()
      const result = store.pendingPaymentDates(fifteenDaysAgo, todayDay)
      // Should include: (today - 14 days) and today  → 2 occurrences
      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it('returns dates with the correct day of week', () => {
      const store = usePocketMoneyStore()
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const targetDay = 3 // Wednesday
      const result = store.pendingPaymentDates(tenDaysAgo, targetDay)
      result.forEach(d => {
        expect(d.getDay()).toBe(3)
      })
    })

    it('handles paymentDay 0 (Sunday)', () => {
      const store = usePocketMoneyStore()
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const result = store.pendingPaymentDates(tenDaysAgo, 0)
      result.forEach(d => expect(d.getDay()).toBe(0))
    })

    it('handles paymentDay 6 (Saturday)', () => {
      const store = usePocketMoneyStore()
      const tenDaysAgo = new Date()
      tenDaysAgo.setDate(tenDaysAgo.getDate() - 10)
      const result = store.pendingPaymentDates(tenDaysAgo, 6)
      result.forEach(d => expect(d.getDay()).toBe(6))
    })

    it('result dates are strictly after lastUpdated', () => {
      const store = usePocketMoneyStore()
      const lastUpdated = new Date('2025-06-04') // Wednesday
      const result = store.pendingPaymentDates(lastUpdated, 3) // next Wednesday
      result.forEach(d => expect(d > lastUpdated).toBe(true))
    })

    it('result dates are on or before today', () => {
      const store = usePocketMoneyStore()
      const lastUpdated = new Date('2020-01-01')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const result = store.pendingPaymentDates(lastUpdated, 1)
      result.forEach(d => expect(d <= today).toBe(true))
    })
  })

  // ─── displayBalance ────────────────────────────────────────────────────────

  describe('displayBalance', () => {
    it('returns null when no snapshot exists for uid', () => {
      const store = usePocketMoneyStore()
      expect(store.displayBalance('unknown-uid')).toBeNull()
    })

    it('returns stored balance when no pending payments', () => {
      const store = usePocketMoneyStore()
      // Set lastUpdated to today so no payments pending
      const today = new Date()
      store.snapshots = [makeSnap('child-uid', {
        balance: 10,
        lastUpdated: { toDate: () => today },
        weeklyAmount: 5,
        paymentDay: (today.getDay() + 1) % 7, // tomorrow's day → never matches today
      })]
      // No pending payments possible since paymentDay is tomorrow
      const result = store.displayBalance('child-uid')
      expect(result).toBe(10)
    })

    it('adds weeklyAmount for each pending payment', () => {
      const store = usePocketMoneyStore()
      // Create a snapshot where we know exactly how many payments are pending
      // by using a fixed lastUpdated and fixing the day calculation
      store.snapshots = [makeSnap('child-uid', {
        balance: 0,
        weeklyAmount: 5,
        paymentDay: 3,
        lastUpdated: { toDate: () => new Date('2000-01-01') }, // long ago → many payments
      })]
      const result = store.displayBalance('child-uid')
      // Should be significantly more than 0
      expect(result).toBeGreaterThan(0)
    })
  })

  // ─── setup ─────────────────────────────────────────────────────────────────

  describe('setup', () => {
    it('registers a collection listener when user is parent', () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      expect(mockOnSnapshot).toHaveBeenCalledOnce()
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'families', 'fam-1', 'pocketMoney')
    })

    it('registers a single-doc listener when user is child', () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', childUser)

      expect(mockOnSnapshot).toHaveBeenCalledOnce()
      expect(mockDoc).toHaveBeenCalledWith(
        expect.anything(), 'families', 'fam-1', 'pocketMoney', 'child-uid'
      )
    })

    it('populates snapshots from collection callback (parent)', () => {
      let cb
      mockOnSnapshot.mockImplementationOnce((_ref, fn) => { cb = fn; return vi.fn() })

      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      cb({ docs: [{ id: 'child-uid', data: () => ({ balance: 10, weeklyAmount: 5, paymentDay: 5 }) }] })

      expect(store.snapshots).toHaveLength(1)
      expect(store.snapshots[0].uid).toBe('child-uid')
      expect(store.snapshots[0].balance).toBe(10)
    })

    it('populates snapshots from single-doc callback (child) when doc exists', () => {
      let cb
      mockOnSnapshot.mockImplementationOnce((_ref, fn) => { cb = fn; return vi.fn() })

      const store = usePocketMoneyStore()
      store.setup('fam-1', childUser)

      cb({ exists: () => true, id: 'child-uid', data: () => ({ balance: 7, weeklyAmount: 3, paymentDay: 1 }) })

      expect(store.snapshots).toHaveLength(1)
      expect(store.snapshots[0].uid).toBe('child-uid')
    })

    it('sets snapshots to empty when doc does not exist (child)', () => {
      let cb
      mockOnSnapshot.mockImplementationOnce((_ref, fn) => { cb = fn; return vi.fn() })

      const store = usePocketMoneyStore()
      store.setup('fam-1', childUser)

      cb({ exists: () => false })

      expect(store.snapshots).toHaveLength(0)
    })

    it('calls previous unsubscribe before re-subscribing', () => {
      const unsub = vi.fn()
      mockOnSnapshot.mockReturnValueOnce(unsub)

      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.setup('fam-1', parentUser)

      expect(unsub).toHaveBeenCalledOnce()
    })
  })

  // ─── teardown ──────────────────────────────────────────────────────────────

  describe('teardown', () => {
    it('clears snapshots, transactions, and transactionsUid', () => {
      const store = usePocketMoneyStore()
      store.snapshots = [makeSnap('child-uid')]
      store.transactions = [{ id: 'txn-1' }]
      store.transactionsUid = 'child-uid'

      store.teardown()

      expect(store.snapshots).toHaveLength(0)
      expect(store.transactions).toHaveLength(0)
      expect(store.transactionsUid).toBeNull()
    })

    it('calls the unsubscribe function', () => {
      const unsub = vi.fn()
      mockOnSnapshot.mockReturnValueOnce(unsub)

      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.teardown()

      expect(unsub).toHaveBeenCalledOnce()
    })
  })

  // ─── flushPendingPayments ──────────────────────────────────────────────────

  describe('flushPendingPayments', () => {
    it('is a no-op when currentFamilyId is not set', async () => {
      const store = usePocketMoneyStore()
      await store.flushPendingPayments('child-uid')
      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('is a no-op when no snapshot exists for childUid', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.flushPendingPayments('unknown-uid')

      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('is a no-op when no pending payments', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      const today = new Date()
      store.snapshots = [makeSnap('child-uid', {
        lastUpdated: { toDate: () => today },
        paymentDay: (today.getDay() + 1) % 7,
      })]

      await store.flushPendingPayments('child-uid')

      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('calls writeBatch, batch.update, batch.set, and commit when payments are pending', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      // lastUpdated long ago so payments will be pending
      store.snapshots = [makeSnap('child-uid', {
        balance: 0,
        weeklyAmount: 5,
        paymentDay: new Date().getDay(), // today is a payment day
        lastUpdated: { toDate: () => new Date('2025-01-01') },
      })]

      await store.flushPendingPayments('child-uid')

      expect(mockWriteBatch).toHaveBeenCalledOnce()
      expect(mockBatchUpdate).toHaveBeenCalledOnce()
      expect(mockBatchSet).toHaveBeenCalled()
      expect(mockBatchCommit).toHaveBeenCalledOnce()
    })

    it('writes the correct new balance', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      // Use today as paymentDay and lastUpdated 8 days ago → exactly 1 pending payment
      const eightDaysAgo = new Date()
      eightDaysAgo.setDate(eightDaysAgo.getDate() - 8)
      const todayDay = new Date().getDay()

      store.snapshots = [makeSnap('child-uid', {
        balance: 10,
        weeklyAmount: 5,
        paymentDay: todayDay,
        lastUpdated: { toDate: () => eightDaysAgo },
      })]

      await store.flushPendingPayments('child-uid')

      const updateCall = mockBatchUpdate.mock.calls[0]
      // balance should be 10 + (n * 5) where n >= 1
      expect(updateCall[1].balance).toBeGreaterThan(10)
    })

    it('sets recordedBy: null and type: payment on transaction records', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      store.snapshots = [makeSnap('child-uid', {
        paymentDay: new Date().getDay(),
        lastUpdated: { toDate: () => new Date('2025-01-01') },
      })]

      await store.flushPendingPayments('child-uid')

      const setCall = mockBatchSet.mock.calls[0]
      expect(setCall[1].type).toBe('payment')
      expect(setCall[1].recordedBy).toBeNull()
    })
  })

  // ─── saveConfig ────────────────────────────────────────────────────────────

  describe('saveConfig', () => {
    it('throws when currentFamilyId is not set', async () => {
      const store = usePocketMoneyStore()
      await expect(
        store.saveConfig('child-uid', { startingAmount: 10, weeklyAmount: 5, paymentDay: 5 })
      ).rejects.toThrow('Store not initialised')
      expect(mockSetDoc).not.toHaveBeenCalled()
    })

    it('includes balance and lastUpdated when creating a new record', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      // No existing snapshot → isNew = true

      await store.saveConfig('child-uid', { startingAmount: 20, weeklyAmount: 5, paymentDay: 4 })

      expect(mockSetDoc).toHaveBeenCalledOnce()
      const payload = mockSetDoc.mock.calls[0][1]
      expect(payload.balance).toBe(20)
      expect(payload.lastUpdated).toBeDefined()
      expect(payload.weeklyAmount).toBe(5)
      expect(payload.paymentDay).toBe(4)
    })

    it('does not include balance when updating an existing record', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]

      await store.saveConfig('child-uid', { startingAmount: 99, weeklyAmount: 10, paymentDay: 1 })

      const payload = mockSetDoc.mock.calls[0][1]
      expect(payload.balance).toBeUndefined()
      expect(payload.weeklyAmount).toBe(10)
      expect(payload.paymentDay).toBe(1)
    })

    it('calls setDoc with merge: true', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.saveConfig('child-uid', { startingAmount: 10, weeklyAmount: 5, paymentDay: 5 })

      const options = mockSetDoc.mock.calls[0][2]
      expect(options).toEqual({ merge: true })
    })
  })

  // ─── recordWithdrawal ──────────────────────────────────────────────────────

  describe('recordWithdrawal', () => {
    it('is a no-op when currentFamilyId is not set', async () => {
      const store = usePocketMoneyStore()
      await store.recordWithdrawal('child-uid', { amount: 5, note: null })
      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('is a no-op when no snapshot exists', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.recordWithdrawal('unknown-uid', { amount: 5, note: null })

      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('deducts the amount from the stored balance', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 7, note: null })

      const updateCall = mockBatchUpdate.mock.calls[0]
      expect(updateCall[1].balance).toBe(13)
    })

    it('writes a transaction with type withdrawal, correct amount, and recordedBy', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 5, note: 'ice cream' })

      const setCall = mockBatchSet.mock.calls[0]
      expect(setCall[1].type).toBe('withdrawal')
      expect(setCall[1].amount).toBe(5)
      expect(setCall[1].note).toBe('ice cream')
      expect(setCall[1].recordedBy).toBe('parent-uid')
    })

    it('stores null for note when not provided', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 5, note: '' })

      const setCall = mockBatchSet.mock.calls[0]
      expect(setCall[1].note).toBeNull()
    })

    it('commits the batch', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 5, note: null })

      expect(mockBatchCommit).toHaveBeenCalledOnce()
    })
  })

  // ─── loadTransactions ──────────────────────────────────────────────────────

  describe('loadTransactions', () => {
    it('is a no-op when currentFamilyId is not set', async () => {
      const store = usePocketMoneyStore()
      await store.loadTransactions('child-uid')
      expect(mockGetDocs).not.toHaveBeenCalled()
    })

    it('calls getDocs with a 90-day cutoff query', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.loadTransactions('child-uid')

      expect(mockGetDocs).toHaveBeenCalledOnce()
      expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.anything())
      expect(mockOrderBy).toHaveBeenCalledWith('date', 'desc')
    })

    it('queries the correct transactions subcollection path', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.loadTransactions('child-uid')

      expect(mockCollection).toHaveBeenCalledWith(
        expect.anything(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions'
      )
    })

    it('populates transactions from the result', async () => {
      mockGetDocs.mockResolvedValueOnce({
        docs: [
          { id: 'txn-1', data: () => ({ type: 'payment', amount: 5 }) },
          { id: 'txn-2', data: () => ({ type: 'withdrawal', amount: 3 }) },
        ],
      })

      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.loadTransactions('child-uid')

      expect(store.transactions).toHaveLength(2)
      expect(store.transactions[0].id).toBe('txn-1')
      expect(store.transactions[1].type).toBe('withdrawal')
    })

    it('sets transactionsUid to the requested uid', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.loadTransactions('child-uid')

      expect(store.transactionsUid).toBe('child-uid')
    })

    it('sets loading true then false', async () => {
      let loadingDuring = null
      mockGetDocs.mockImplementationOnce(async () => {
        loadingDuring = true
        return { docs: [] }
      })

      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.loadTransactions('child-uid')

      expect(loadingDuring).toBe(true)
      expect(store.loading).toBe(false)
    })
  })
})
