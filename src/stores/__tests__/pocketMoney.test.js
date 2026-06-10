import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const {
  mockOnSnapshot, mockGetDocs, mockDoc, mockCollection, mockQuery,
  mockWhere, mockOrderBy, mockBatchUpdate, mockBatchSet, mockBatchCommit,
  mockWriteBatch, mockSetDoc, mockUseFamilyStore,
  mockRunTransaction, mockIncrement, mockTxnGet, mockTxnUpdate, mockTxnSet,
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
  // runTransaction is mocked to invoke the update function with a fake txn object;
  // mockTxnGet controls the "server" document the transaction reads.
  mockRunTransaction: vi.fn(),
  mockIncrement:      vi.fn((n) => ({ _increment: n })),
  mockTxnGet:         vi.fn(),
  mockTxnUpdate:      vi.fn(),
  mockTxnSet:         vi.fn(),
}))

vi.mock('@/stores/family.js', () => ({ useFamilyStore: mockUseFamilyStore }))
vi.mock('@/firebase/config.js', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  onSnapshot:     mockOnSnapshot,
  getDocs:        mockGetDocs,
  doc:            mockDoc,
  collection:     mockCollection,
  query:          mockQuery,
  where:          mockWhere,
  orderBy:        mockOrderBy,
  writeBatch:     mockWriteBatch,
  setDoc:         mockSetDoc,
  runTransaction: mockRunTransaction,
  increment:      mockIncrement,
  // Timestamp is faked just enough for the store: fromDate/now round-trip via toDate().
  Timestamp: {
    now:      () => ({ toDate: () => new Date() }),
    fromDate: (d) => ({ toDate: () => d }),
  },
}))

import { usePocketMoneyStore } from '@/stores/pocketMoney.js'

const parentUser = { uid: 'parent-uid', role: 'parent' }
const childUser  = { uid: 'child-uid',  role: 'child'  }

// Default pinned clock for tests that don't care about the exact date. 2025-06-13 is a
// Friday in UTC — see the dated cases below which pin their own system time as needed.
const DEFAULT_NOW = '2025-06-13T00:00:00Z'

// Build a Firestore-shaped snapshot. lastUpdated mimics a Firestore Timestamp (has toDate()).
function makeSnap(uid, overrides = {}) {
  const base = {
    weeklyAmount: 5,
    paymentDay: 5, // Friday
    balance: 10,
    lastUpdated: { toDate: () => new Date('2025-01-01T00:00:00Z') },
  }
  return { uid, ...base, ...overrides }
}

// A Timestamp-like wrapper around a fixed instant.
const ts = (iso) => ({ toDate: () => new Date(iso) })

// A Firestore-shaped doc snapshot for the transaction's txn.get() read.
const serverDoc = (data) => ({ exists: () => true, data: () => data })
const missingDoc = () => ({ exists: () => false })

// Format a Date (UTC midnight) as YYYY-MM-DD for stable comparison.
const ymd = (d) => d.toISOString().slice(0, 10)

describe('pocketMoney store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    // Fake only Date so "today" is deterministic; leave timers/promises real so the
    // awaited batch.commit() in the store still resolves via the real microtask queue.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(DEFAULT_NOW))
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockGetDocs.mockResolvedValue({ docs: [] })
    mockBatchCommit.mockResolvedValue(undefined)
    mockSetDoc.mockResolvedValue(undefined)
    mockWriteBatch.mockReturnValue({
      update: mockBatchUpdate,
      set: mockBatchSet,
      commit: mockBatchCommit,
    })
    mockRunTransaction.mockImplementation((_db, fn) =>
      fn({ get: mockTxnGet, update: mockTxnUpdate, set: mockTxnSet })
    )
    mockTxnGet.mockResolvedValue(missingDoc())
    mockUseFamilyStore.mockReturnValue({ currentUser: { uid: 'parent-uid', role: 'parent' } })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ─── pendingPaymentDates ───────────────────────────────────────────────────
  // All cases pin "today" via vi.setSystemTime and assert the EXACT set of payment
  // dates. Day boundaries are UTC, so these are reproducible on any host timezone.

  describe('pendingPaymentDates', () => {
    // [name, today, lastUpdated, paymentDay, expected (array of YYYY-MM-DD)]
    const cases = [
      // Exclusive of lastUpdated: its own weekday is NOT counted.
      ['excludes lastUpdated itself (same day, same weekday)',
        '2025-06-13', '2025-06-13', 5, []],
      // One occurrence in a short window.
      ['one occurrence in the window',
        '2025-06-13', '2025-06-09', 5, ['2025-06-13']],
      // Exclusive boundary skips lastUpdated's Friday, picks the NEXT Friday.
      ['skips lastUpdated weekday and picks the next occurrence',
        '2025-06-20', '2025-06-13', 5, ['2025-06-20']],
      // Two occurrences.
      ['two occurrences in the window',
        '2025-06-20', '2025-06-06', 5, ['2025-06-13', '2025-06-20']],
      // Month boundary (Jan → Feb).
      ['spans a month boundary',
        '2025-02-04', '2025-01-28', 1, ['2025-02-03']],
      // Year boundary (Dec 2024 → Jan 2025).
      ['spans a year boundary',
        '2025-01-05', '2024-12-28', 3, ['2025-01-01']],
      // Leap day: 29 Feb 2024 is a Thursday and must be counted.
      ['counts the leap day (29 Feb 2024)',
        '2024-03-03', '2024-02-25', 4, ['2024-02-29']],
      // DST regression — UK spring-forward day (30 Mar 2025) is a Sunday; with UTC
      // math it is counted exactly once, never doubled or skipped.
      ['handles UK DST spring-forward without double/skip',
        '2025-04-02', '2025-03-26', 0, ['2025-03-30']],
      // DST regression — UK autumn-back day (26 Oct 2025) is a Sunday.
      ['handles UK DST autumn-back without double/skip',
        '2025-10-29', '2025-10-22', 0, ['2025-10-26']],
      // Defensive: a lastUpdated in the future yields no payments.
      ['returns empty when lastUpdated is in the future',
        '2025-06-13', '2025-12-25', 4, []],
    ]

    it.each(cases)('%s', (_name, today, lastUpdated, paymentDay, expected) => {
      vi.setSystemTime(new Date(today))
      const store = usePocketMoneyStore()
      const result = store.pendingPaymentDates(new Date(lastUpdated), paymentDay)
      expect(result.map(ymd)).toEqual(expected)
    })

    // All seven weekdays over one fixed 7-day window (each weekday occurs exactly once).
    const sevenDayWindow = [
      [0, '2025-06-08'], // Sunday
      [1, '2025-06-09'], // Monday
      [2, '2025-06-10'], // Tuesday
      [3, '2025-06-11'], // Wednesday
      [4, '2025-06-12'], // Thursday
      [5, '2025-06-13'], // Friday
      [6, '2025-06-07'], // Saturday
    ]

    it.each(sevenDayWindow)(
      'finds exactly one occurrence of paymentDay %i in a 7-day window',
      (paymentDay, expectedDate) => {
        vi.setSystemTime(new Date('2025-06-13'))
        const store = usePocketMoneyStore()
        // Window is exclusive of 2025-06-06 (Fri) through 2025-06-13 (Fri) inclusive.
        const result = store.pendingPaymentDates(new Date('2025-06-06'), paymentDay)
        expect(result.map(ymd)).toEqual([expectedDate])
      },
    )

    it('counts exactly 53 Wednesdays across a full year gap', () => {
      vi.setSystemTime(new Date('2025-01-01'))
      const store = usePocketMoneyStore()
      const result = store.pendingPaymentDates(new Date('2024-01-01'), 3)
      expect(result).toHaveLength(53)
      result.forEach(d => expect(d.getUTCDay()).toBe(3))
    })

    it('returns dates strictly after lastUpdated and on or before today', () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      const lastUpdated = new Date('2025-05-01')
      const today = new Date('2025-06-13T00:00:00Z')
      const result = store.pendingPaymentDates(lastUpdated, 1)
      result.forEach(d => {
        expect(d > lastUpdated).toBe(true)
        expect(d <= today).toBe(true)
      })
    })
  })

  // ─── displayBalance ────────────────────────────────────────────────────────

  describe('displayBalance', () => {
    it('returns null when no snapshot exists for uid', () => {
      const store = usePocketMoneyStore()
      expect(store.displayBalance('unknown-uid')).toBeNull()
    })

    it('returns the stored balance exactly when no payments are pending', () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      // lastUpdated is today (Friday) and paymentDay is Friday → exclusive → none pending.
      store.snapshots = [makeSnap('child-uid', {
        balance: 10, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2025-06-13'),
      })]
      expect(store.displayBalance('child-uid')).toBe(10)
    })

    it('adds weeklyAmount for each pending payment (exact)', () => {
      vi.setSystemTime(new Date('2025-06-20'))
      const store = usePocketMoneyStore()
      // Fridays after 2025-06-06: 13th and 20th → 2 pending × 5 = 10, plus balance 10.
      store.snapshots = [makeSnap('child-uid', {
        balance: 10, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2025-06-06'),
      })]
      expect(store.displayBalance('child-uid')).toBe(20)
    })

    it('treats a missing balance as 0', () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      const snap = makeSnap('child-uid', { weeklyAmount: 5, paymentDay: 5, lastUpdated: ts('2025-06-06') })
      delete snap.balance
      store.snapshots = [snap]
      // 1 pending Friday × 5, balance defaults to 0.
      expect(store.displayBalance('child-uid')).toBe(5)
    })

    it('treats a missing weeklyAmount as 0', () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      const snap = makeSnap('child-uid', { balance: 10, paymentDay: 5, lastUpdated: ts('2025-06-06') })
      delete snap.weeklyAmount
      store.snapshots = [snap]
      expect(store.displayBalance('child-uid')).toBe(10)
    })

    it('defaults a missing paymentDay to 0 (Sunday)', () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      const snap = makeSnap('child-uid', { balance: 10, weeklyAmount: 5, lastUpdated: ts('2025-06-06') })
      delete snap.paymentDay
      store.snapshots = [snap]
      // Sunday after 2025-06-06 is the 8th → 1 pending × 5 + 10 = 15.
      expect(store.displayBalance('child-uid')).toBe(15)
    })

    it('returns the stored balance unchanged when lastUpdated is absent (no back-pay)', () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      const snap = makeSnap('child-uid', { balance: 10, weeklyAmount: 5, paymentDay: 5 })
      delete snap.lastUpdated
      store.snapshots = [snap]
      // Unknown accrual state is treated as "now" — never decades of epoch back-pay.
      expect(store.displayBalance('child-uid')).toBe(10)
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
      expect(mockRunTransaction).not.toHaveBeenCalled()
    })

    it('is a no-op when no cached snapshot exists for childUid', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.flushPendingPayments('unknown-uid')

      expect(mockRunTransaction).not.toHaveBeenCalled()
    })

    it('writes nothing when the server document does not exist', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      mockTxnGet.mockResolvedValue(missingDoc())

      await store.flushPendingPayments('child-uid')

      expect(mockTxnUpdate).not.toHaveBeenCalled()
      expect(mockTxnSet).not.toHaveBeenCalled()
    })

    it('writes nothing when the server doc has no pending payments', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      mockTxnGet.mockResolvedValue(serverDoc({
        balance: 10, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2025-06-13'), // today (Friday), exclusive
      }))

      await store.flushPendingPayments('child-uid')

      expect(mockTxnUpdate).not.toHaveBeenCalled()
      expect(mockTxnSet).not.toHaveBeenCalled()
    })

    it('recomputes from the SERVER doc, not the cached snapshot (concurrent-flush safety)', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      // Cached snapshot is stale and says a payment is pending…
      store.snapshots = [makeSnap('child-uid', { lastUpdated: ts('2025-06-06') })]
      // …but another parent already flushed: server lastUpdated is today.
      mockTxnGet.mockResolvedValue(serverDoc({
        balance: 15, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2025-06-13'),
      }))

      await store.flushPendingPayments('child-uid')

      expect(mockTxnUpdate).not.toHaveBeenCalled()
      expect(mockTxnSet).not.toHaveBeenCalled()
    })

    it('writes nothing when the server doc has no lastUpdated (unknown accrual state)', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      mockTxnGet.mockResolvedValue(serverDoc({ balance: 10, weeklyAmount: 5, paymentDay: 5 }))

      await store.flushPendingPayments('child-uid')

      expect(mockTxnUpdate).not.toHaveBeenCalled()
      expect(mockTxnSet).not.toHaveBeenCalled()
    })

    it('writes nothing when pending payments exceed the 400-payment safety cap', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      // ~10 years of Fridays ≈ 520 pending — far over the cap, far under the old epoch case.
      mockTxnGet.mockResolvedValue(serverDoc({
        balance: 10, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2015-06-13'),
      }))

      await store.flushPendingPayments('child-uid')

      expect(mockTxnUpdate).not.toHaveBeenCalled()
      expect(mockTxnSet).not.toHaveBeenCalled()
    })

    it('increments the balance and stamps lastUpdated for a single pending payment', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      mockTxnGet.mockResolvedValue(serverDoc({
        balance: 10, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2025-06-06'), // 1 pending Friday → 13th
      }))

      await store.flushPendingPayments('child-uid')

      // Balance is an increment delta (1 × 5), never an absolute value.
      expect(mockTxnUpdate).toHaveBeenCalledOnce()
      const update = mockTxnUpdate.mock.calls[0][1]
      expect(mockIncrement).toHaveBeenCalledWith(5)
      expect(update.balance).toEqual({ _increment: 5 })
      expect(update.lastUpdated).toBeDefined()

      // Exactly one payment transaction, dated the payment day, amount = weeklyAmount.
      expect(mockTxnSet).toHaveBeenCalledOnce()
      const txn = mockTxnSet.mock.calls[0][1]
      expect(txn.type).toBe('payment')
      expect(txn.amount).toBe(5)
      expect(txn.recordedBy).toBeNull()
      expect(txn.note).toBeNull()
      expect(ymd(txn.date.toDate())).toBe('2025-06-13')
    })

    it('uses a deterministic payment-YYYY-MM-DD doc ID per payment (idempotency)', async () => {
      vi.setSystemTime(new Date('2025-06-20'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      mockTxnGet.mockResolvedValue(serverDoc({
        balance: 0, weeklyAmount: 5, paymentDay: 5,
        lastUpdated: ts('2025-06-06'), // Fridays 13th and 20th → 2 payments
      }))

      await store.flushPendingPayments('child-uid')

      expect(mockIncrement).toHaveBeenCalledWith(10) // 2 × 5
      expect(mockTxnSet).toHaveBeenCalledTimes(2)
      const dates = mockTxnSet.mock.calls.map(c => ymd(c[1].date.toDate()))
      expect(dates).toEqual(['2025-06-13', '2025-06-20'])
      // doc() called with the transactions collection and the deterministic ID.
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'payment-2025-06-13')
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'payment-2025-06-20')
    })

    it('still flushes (zero delta) when weeklyAmount is 0', async () => {
      vi.setSystemTime(new Date('2025-06-13'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid')]
      mockTxnGet.mockResolvedValue(serverDoc({
        balance: 7, weeklyAmount: 0, paymentDay: 5,
        lastUpdated: ts('2025-06-06'), // 1 pending day
      }))

      await store.flushPendingPayments('child-uid')

      expect(mockIncrement).toHaveBeenCalledWith(0)
      expect(mockTxnSet).toHaveBeenCalledOnce()
      expect(mockTxnSet.mock.calls[0][1].amount).toBe(0)
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

    it('defaults the starting balance to 0 when startingAmount is omitted', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.saveConfig('child-uid', { weeklyAmount: 5, paymentDay: 4 })

      expect(mockSetDoc.mock.calls[0][1].balance).toBe(0)
    })

    it('defaults the starting balance to 0 when startingAmount is NaN', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      // parseFloat('') in the view yields NaN; the store must never persist it.
      await store.saveConfig('child-uid', { startingAmount: NaN, weeklyAmount: 5, paymentDay: 4 })

      expect(mockSetDoc.mock.calls[0][1].balance).toBe(0)
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

    it('deducts the amount via a commutative increment, not an absolute balance', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 7, note: null })

      expect(mockIncrement).toHaveBeenCalledWith(-7)
      expect(mockBatchUpdate.mock.calls[0][1].balance).toEqual({ _increment: -7 })
    })

    it('does not stamp lastUpdated (would swallow unflushed payments)', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 7, note: null })

      expect(mockBatchUpdate.mock.calls[0][1]).not.toHaveProperty('lastUpdated')
    })

    it('handles decimal amounts exactly', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 10 })]

      await store.recordWithdrawal('child-uid', { amount: 2.5, note: null })

      expect(mockIncrement).toHaveBeenCalledWith(-2.5)
      expect(mockBatchSet.mock.calls[0][1].amount).toBe(2.5)
    })

    it('writes a transaction with type withdrawal, correct amount, note, and recordedBy', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 5, note: 'ice cream' })

      const txn = mockBatchSet.mock.calls[0][1]
      expect(txn.type).toBe('withdrawal')
      expect(txn.amount).toBe(5)
      expect(txn.note).toBe('ice cream')
      expect(txn.recordedBy).toBe('parent-uid')
    })

    it('stores null for note when not provided', async () => {
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 5, note: '' })

      expect(mockBatchSet.mock.calls[0][1].note).toBeNull()
    })

    it('falls back to null recordedBy when there is no current user', async () => {
      mockUseFamilyStore.mockReturnValue({ currentUser: null })
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)
      store.snapshots = [makeSnap('child-uid', { balance: 20 })]

      await store.recordWithdrawal('child-uid', { amount: 5, note: null })

      expect(mockBatchSet.mock.calls[0][1].recordedBy).toBeNull()
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

    it('queries with an exact 90-day UTC cutoff, ordered by date desc', async () => {
      vi.setSystemTime(new Date('2025-06-13T00:00:00Z'))
      const store = usePocketMoneyStore()
      store.setup('fam-1', parentUser)

      await store.loadTransactions('child-uid')

      expect(mockGetDocs).toHaveBeenCalledOnce()
      expect(mockWhere).toHaveBeenCalledWith('date', '>=', expect.anything())
      const cutoff = mockWhere.mock.calls[0][2].toDate()
      expect(cutoff.toISOString()).toBe('2025-03-15T00:00:00.000Z')
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

    it('sets loading true during the fetch and false afterwards', async () => {
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
