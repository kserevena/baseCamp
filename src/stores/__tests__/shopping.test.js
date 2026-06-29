import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const {
  mockOnSnapshot, mockAddDoc, mockUpdateDoc, mockDeleteDoc, mockGetDocs,
  mockDoc, mockCollection, mockQuery, mockWhere, mockServerTimestamp,
  mockUseFamilyStore, mockBatchUpdate, mockBatchCommit, mockWriteBatch,
} = vi.hoisted(() => ({
  mockOnSnapshot:      vi.fn(() => vi.fn()),
  mockAddDoc:          vi.fn().mockResolvedValue({ id: 'new-list-id' }),
  mockUpdateDoc:       vi.fn(),
  mockDeleteDoc:       vi.fn().mockResolvedValue(undefined),
  mockGetDocs:         vi.fn().mockResolvedValue({ docs: [] }),
  mockDoc:             vi.fn(() => ({ id: 'mock-doc-id' })),
  mockCollection:      vi.fn(() => ({})),
  mockQuery:           vi.fn(() => ({})),
  mockWhere:           vi.fn(() => ({})),
  mockServerTimestamp: vi.fn(() => new Date()),
  mockUseFamilyStore:  vi.fn(() => ({ currentUser: { uid: 'parent-uid' } })),
  mockBatchUpdate:     vi.fn(),
  mockBatchCommit:     vi.fn().mockResolvedValue(undefined),
  mockWriteBatch:      vi.fn(),
}))

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: mockUseFamilyStore,
}))

vi.mock('@/firebase/config.js', () => ({
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  onSnapshot:      mockOnSnapshot,
  addDoc:          mockAddDoc,
  updateDoc:       mockUpdateDoc,
  deleteDoc:       mockDeleteDoc,
  getDocs:         mockGetDocs,
  doc:             mockDoc,
  collection:      mockCollection,
  query:           mockQuery,
  where:           mockWhere,
  serverTimestamp: mockServerTimestamp,
  writeBatch:      mockWriteBatch,
}))

import { useShoppingStore } from '@/stores/shopping.js'

const DEFAULT_AISLES = [
  { name: 'Dairy', order: 1 },
  { name: 'Meat', order: 2 },
  { name: 'Dry goods', order: 3 },
  { name: 'Bakery', order: 4 },
  { name: 'Fruit & veg', order: 5 },
]

const mockList = (id, name, millis = 1000, aisles = undefined) => ({
  id,
  data: () => ({
    familyId: 'fam-1',
    name,
    createdAt: { toMillis: () => millis },
    ...(aisles !== undefined ? { aisles } : {}),
  }),
})

const mockItem = (id, overrides = {}) => ({
  id,
  data: () => ({ name: 'Milk', qty: '2 pints', aisle: 'Dairy', aisleOrder: 1, done: false, ...overrides }),
})

describe('shopping store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    localStorage.clear()
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockAddDoc.mockResolvedValue({ id: 'new-list-id' })
    mockDeleteDoc.mockResolvedValue(undefined)
    mockGetDocs.mockResolvedValue({ docs: [] })
    mockUseFamilyStore.mockReturnValue({ currentUser: { uid: 'parent-uid' } })
    mockBatchCommit.mockResolvedValue(undefined)
    mockWriteBatch.mockReturnValue({ update: mockBatchUpdate, commit: mockBatchCommit })
  })

  describe('setup', () => {
    it('registers a lists listener without calling setDoc', () => {
      const store = useShoppingStore()
      store.setup('fam-1')

      expect(mockOnSnapshot).toHaveBeenCalledOnce()
      // addDoc / updateDoc / setDoc should not be called on setup
      expect(mockAddDoc).not.toHaveBeenCalled()
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('populates lists and auto-activates the first list when snapshot fires with data', () => {
      let listsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { listsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')

      listsCallback({ docs: [mockList('list-1', 'Weekly shop', 2000), mockList('list-2', 'Old shop', 1000)] })

      expect(store.lists).toHaveLength(2)
      expect(store.lists[0].id).toBe('list-1') // sorted newest first
      expect(store.activeListId).toBe('list-1')
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2) // lists + items
    })

    it('leaves lists empty and activeListId null when snapshot fires with no data', () => {
      let listsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { listsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')

      listsCallback({ docs: [] })

      expect(store.lists).toHaveLength(0)
      expect(store.activeListId).toBeNull()
      expect(mockOnSnapshot).toHaveBeenCalledOnce() // only the lists listener
    })

    it('does not re-activate if activeListId is already set when new snapshot fires', () => {
      let listsCallback
      mockOnSnapshot.mockImplementation((_ref, cb) => { listsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'First shop')] })
      // activeListId is now 'list-1'; onSnapshot called twice (lists + items)

      // A second snapshot fires (e.g. item added to another list)
      listsCallback({ docs: [mockList('list-1', 'First shop'), mockList('list-2', 'Second shop', 2000)] })

      // Should NOT call activateList again — still two onSnapshot calls total
      // (lists is still the first call; we called activateList once so items was registered once)
      expect(store.activeListId).toBe('list-1')
    })
  })

  describe('activateList', () => {
    it('sets activeListId and starts an items listener', () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      expect(store.activeListId).toBe('list-1')
      expect(mockOnSnapshot).toHaveBeenCalledOnce()
    })

    it('tears down the previous items listener before starting a new one', () => {
      const unsub1 = vi.fn()
      mockOnSnapshot.mockReturnValueOnce(unsub1)

      const store = useShoppingStore()
      store.activateList('list-1')
      store.activateList('list-2')

      expect(unsub1).toHaveBeenCalledOnce()
      expect(store.activeListId).toBe('list-2')
    })

    it('populates items from the snapshot callback', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')

      itemsCallback({ docs: [mockItem('item-1'), mockItem('item-2', { aisleOrder: 2 })] })

      expect(store.items).toHaveLength(2)
      expect(store.items[0].id).toBe('item-1')
    })
  })

  describe('createList', () => {
    it('calls addDoc with the correct shape', async () => {
      const store = useShoppingStore()
      store.setup('fam-1') // sets currentFamilyId

      await store.createList('Party supplies')

      expect(mockAddDoc).toHaveBeenCalledOnce()
      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload).toMatchObject({
        familyId: 'fam-1',
        name: 'Party supplies',
        createdBy: 'parent-uid',
      })
      expect(payload.createdAt).toBeDefined()
      expect(payload.aisles).toEqual(DEFAULT_AISLES)
    })

    it('trims whitespace from the list name', async () => {
      const store = useShoppingStore()
      store.setup('fam-1')

      await store.createList('  Weekend shop  ')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.name).toBe('Weekend shop')
    })

    it('calls activateList with the new doc id', async () => {
      mockAddDoc.mockResolvedValueOnce({ id: 'created-list-id' })

      const store = useShoppingStore()
      store.setup('fam-1')

      await store.createList('New list')

      expect(store.activeListId).toBe('created-list-id')
    })
  })

  describe('addItem', () => {
    it('calls addDoc on the correct path using activeListId', () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      store.addItem('Butter', '250g', 'Dairy')

      expect(mockAddDoc).toHaveBeenCalledOnce()
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items')
    })

    it('does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      store.addItem('Butter')

      expect(mockAddDoc).not.toHaveBeenCalled()
    })

    it('uses aisleOrder 99 for an aisle not in activeAisles', () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      store.addItem('Widget', '1', 'Nonexistent aisle')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.aisleOrder).toBe(99)
    })

    it('defaults to the first aisle in activeAisles when aisle param is null', () => {
      let listsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockReturnValue(vi.fn())

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Weekly shop', 1000, DEFAULT_AISLES)] })

      store.addItem('Eggs')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.aisle).toBe('Dairy')
      expect(payload.aisleOrder).toBe(1)
    })

    it('uses aisleOrder from activeAisles when the aisle matches', () => {
      let listsCallback
      const customAisles = [{ name: 'Produce', order: 1 }, { name: 'Frozen', order: 2 }]
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockReturnValue(vi.fn())

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Weekly shop', 1000, customAisles)] })

      store.addItem('Peas', '400g', 'Frozen')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.aisleOrder).toBe(2)
    })
  })

  describe('restoreItem', () => {
    it('returns false and does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      const result = store.restoreItem('item-1', '1 pint', 'Dairy')
      expect(result).toBe(false)
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('returns false and does nothing when item id is not found', () => {
      const store = useShoppingStore()
      store.activateList('list-1')
      const result = store.restoreItem('nonexistent', '1 pint', 'Dairy')
      expect(result).toBe(false)
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('returns true and calls updateDoc with done:false, qty, aisle, aisleOrder', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { done: true, aisle: 'Dairy', aisleOrder: 1 })] })

      const result = store.restoreItem('item-1', '1 pint', 'Dairy')

      expect(result).toBe(true)
      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1')
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), {
        done: false, qty: '1 pint', aisle: 'Dairy', aisleOrder: 1,
      })
    })

    it('updates item optimistically in local state', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { done: true, qty: '2 pints', aisle: 'Dairy', aisleOrder: 1 })] })

      store.restoreItem('item-1', '1 pint', 'Dairy')

      const item = store.items.find(i => i.id === 'item-1')
      expect(item.done).toBe(false)
      expect(item.qty).toBe('1 pint')
    })

    it('uses aisleOrder 99 when the aisle is not in activeAisles', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { done: true })] })

      store.restoreItem('item-1', '', 'Unknown aisle')

      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ aisleOrder: 99 }))
    })
  })

  describe('togglePriority', () => {
    it('does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      store.togglePriority('item-1')
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('does nothing when item is not found', () => {
      const store = useShoppingStore()
      store.activateList('list-1')
      store.togglePriority('nonexistent')
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('sets priority to true when item has no priority field', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.togglePriority('item-1')

      expect(store.items[0].priority).toBe(true)
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { priority: true })
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1')
    })

    it('sets priority to true when item has priority: false', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { priority: false })] })

      store.togglePriority('item-1')

      expect(store.items[0].priority).toBe(true)
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { priority: true })
    })

    it('sets priority to false when item has priority: true', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { priority: true })] })

      store.togglePriority('item-1')

      expect(store.items[0].priority).toBe(false)
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { priority: false })
    })

    it('updates Pinia state optimistically without awaiting Firestore', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })
      mockUpdateDoc.mockReturnValueOnce(new Promise(() => {})) // never resolves, scoped to one call

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.togglePriority('item-1')

      // Pinia state is updated immediately, before the promise resolves
      expect(store.items[0].priority).toBe(true)
    })
  })

  describe('toggleDone', () => {
    it('calls updateDoc on the correct path using activeListId', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.toggleDone('item-1')

      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1')
    })

    it('does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      store.toggleDone('item-1')

      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('clears priority and does not change addedBy when checking an item (done: false → true)', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { done: false, addedBy: 'original-uid', priority: true })] })

      store.toggleDone('item-1')

      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { done: true, priority: false })
      expect(store.items[0].addedBy).toBe('original-uid')
      expect(store.items[0].priority).toBe(false)
    })

    it('updates addedBy to the current user when unchecking an item (done: true → false)', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })
      mockUseFamilyStore.mockReturnValue({ currentUser: { uid: 'unchecking-uid' } })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { done: true, addedBy: 'original-uid' })] })

      store.toggleDone('item-1')

      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { done: false, addedBy: 'unchecking-uid' })
      expect(store.items[0].addedBy).toBe('unchecking-uid')
    })
  })

  describe('restoreToggleState', () => {
    it('does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      store.restoreToggleState('item-1', { done: false, addedBy: 'uid' })
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('does nothing when the item id is not found in the local list', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.restoreToggleState('nonexistent', { done: false, addedBy: 'uid' })
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('writes back the exact done, addedBy, and priority without reassigning addedBy', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { done: true, addedBy: 'current-uid', priority: false })] })

      // Undo an accidental tick: restore to the original (not-done, original adder, originally starred).
      store.restoreToggleState('item-1', { done: false, addedBy: 'original-uid', priority: true })

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1')
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { done: false, addedBy: 'original-uid', priority: true })
      expect(store.items[0].done).toBe(false)
      expect(store.items[0].addedBy).toBe('original-uid')
      expect(store.items[0].priority).toBe(true)
    })
  })

  describe('updateItem', () => {
    it('does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      store.updateItem('item-1', { name: 'Eggs', qty: '6' })
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('does nothing when the item id is not found in the local list', () => {
      const store = useShoppingStore()
      store.activateList('list-1')
      store.updateItem('nonexistent-id', { name: 'Ghost', qty: '' })
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('calls updateDoc on the correct Firestore path', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.updateItem('item-1', { name: 'Skimmed milk', qty: '1 pint' })

      expect(mockDoc).toHaveBeenCalledWith(
        expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1'
      )
    })

    it('calls updateDoc with only name and qty', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.updateItem('item-1', { name: 'Skimmed milk', qty: '1 pint' })

      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { name: 'Skimmed milk', qty: '1 pint' }
      )
    })

    it('performs an optimistic local update before Firestore resolves', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { name: 'Milk', qty: '2 pints' })] })

      store.updateItem('item-1', { name: 'Skimmed milk', qty: '1 pint' })

      const item = store.items.find(i => i.id === 'item-1')
      expect(item.name).toBe('Skimmed milk')
      expect(item.qty).toBe('1 pint')
    })

    it('writes aisle and the matching aisleOrder when aisle is provided', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1', { aisle: 'Dairy', aisleOrder: 1 })] })

      store.updateItem('item-1', { name: 'Milk', qty: '2 pints', aisle: 'Bakery' })

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { name: 'Milk', qty: '2 pints', aisle: 'Bakery', aisleOrder: 4 }
      )
      const item = store.items.find(i => i.id === 'item-1')
      expect(item.aisle).toBe('Bakery')
      expect(item.aisleOrder).toBe(4)
    })

    it('falls back to aisleOrder 99 when the given aisle is not found', () => {
      let itemsCallback
      mockOnSnapshot.mockImplementationOnce((_ref, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [mockItem('item-1')] })

      store.updateItem('item-1', { name: 'Milk', qty: '2 pints', aisle: 'Nonexistent' })

      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        { name: 'Milk', qty: '2 pints', aisle: 'Nonexistent', aisleOrder: 99 }
      )
    })
  })

  describe('deleteList', () => {
    it('is a no-op when activeListId is null', async () => {
      const store = useShoppingStore()
      await store.deleteList()
      expect(mockGetDocs).not.toHaveBeenCalled()
      expect(mockDeleteDoc).not.toHaveBeenCalled()
    })

    it('calls getDocs on the items subcollection first', async () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.deleteList()

      expect(mockGetDocs).toHaveBeenCalledOnce()
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items')
    })

    it('calls deleteDoc for each item before deleting the parent', async () => {
      const item1 = { id: 'item-1' }
      const item2 = { id: 'item-2' }
      mockGetDocs.mockResolvedValueOnce({ docs: [item1, item2] })

      const store = useShoppingStore()
      store.activateList('list-1')

      await store.deleteList()

      // deleteDoc called 3 times: 2 items + 1 parent
      expect(mockDeleteDoc).toHaveBeenCalledTimes(3)
      // Parent delete is last
      const calls = mockDoc.mock.calls
      const parentCall = calls.find(c => c.length === 3 && c[2] === 'list-1')
      const itemCalls = calls.filter(c => c.length === 5)
      expect(itemCalls).toHaveLength(2)
      expect(parentCall).toBeDefined()
    })

    it('deletes the parent document at path shoppingLists/{activeListId}', async () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.deleteList()

      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1')
      expect(mockDeleteDoc).toHaveBeenCalled()
    })
  })

  describe('deleteItem', () => {
    it('calls deleteDoc on the correct Firestore path', async () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.deleteItem('item-1')

      expect(mockDeleteDoc).toHaveBeenCalledOnce()
      expect(mockDoc).toHaveBeenCalledWith(
        expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1'
      )
    })

    it('does nothing when no list is active', async () => {
      const store = useShoppingStore()

      await store.deleteItem('item-1')

      expect(mockDeleteDoc).not.toHaveBeenCalled()
    })
  })

  describe('snapshot callback — deleted active list', () => {
    it('activates the next list when the active list is removed from the snapshot', () => {
      let listsCallback
      // Use Once so the items listener calls don't overwrite listsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockReturnValue(vi.fn())

      const store = useShoppingStore()
      store.setup('fam-1')
      // Initial snapshot: two lists, list-1 becomes active
      listsCallback({ docs: [mockList('list-1', 'First', 2000), mockList('list-2', 'Second', 1000)] })
      expect(store.activeListId).toBe('list-1')

      // Subsequent snapshot: list-1 is gone
      listsCallback({ docs: [mockList('list-2', 'Second', 1000)] })
      expect(store.activeListId).toBe('list-2')
    })

    it('clears state when the last list is removed from the snapshot', () => {
      const unsubItems = vi.fn()
      let listsCallback

      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce(() => unsubItems)

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Only list')] })
      expect(store.activeListId).toBe('list-1')

      // Final snapshot: empty
      listsCallback({ docs: [] })

      expect(store.activeListId).toBeNull()
      expect(store.items).toHaveLength(0)
      expect(unsubItems).toHaveBeenCalledOnce()
    })
  })

  describe('reorderItems', () => {
    it('does nothing when activeListId is null', async () => {
      const store = useShoppingStore()
      await store.reorderItems([{ id: 'item-1', sortOrder: 0 }])
      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('calls writeBatch and commits sortOrder updates for a same-aisle reorder', async () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.reorderItems([
        { id: 'item-1', sortOrder: 0 },
        { id: 'item-2', sortOrder: 100 },
      ])

      expect(mockWriteBatch).toHaveBeenCalledOnce()
      expect(mockBatchUpdate).toHaveBeenCalledTimes(2)
      expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), { sortOrder: 0 })
      expect(mockBatchUpdate).toHaveBeenCalledWith(expect.anything(), { sortOrder: 100 })
      expect(mockBatchCommit).toHaveBeenCalledOnce()
    })

    it('includes aisle and aisleOrder in the update for cross-aisle moves', async () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.reorderItems([
        { id: 'item-1', sortOrder: 0, aisle: 'Meat', aisleOrder: 2 },
      ])

      expect(mockBatchUpdate).toHaveBeenCalledWith(
        expect.anything(),
        { sortOrder: 0, aisle: 'Meat', aisleOrder: 2 },
      )
    })

    it('targets the correct item document path', async () => {
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.reorderItems([{ id: 'item-99', sortOrder: 0 }])

      expect(mockDoc).toHaveBeenCalledWith(
        expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-99',
      )
    })
  })

  describe('activeAisles', () => {
    it('returns DEFAULT_AISLES when there is no active list', () => {
      const store = useShoppingStore()
      expect(store.activeAisles).toEqual(DEFAULT_AISLES)
    })

    it('returns DEFAULT_AISLES when the active list has no aisles field', () => {
      let listsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockReturnValue(vi.fn())

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Weekly shop')] })

      expect(store.activeAisles).toEqual(DEFAULT_AISLES)
    })

    it('returns the stored aisles when the active list has an aisles field', () => {
      const customAisles = [{ name: 'Produce', order: 1 }, { name: 'Frozen', order: 2 }]
      let listsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockReturnValue(vi.fn())

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Weekly shop', 1000, customAisles)] })

      expect(store.activeAisles).toEqual(customAisles)
    })

    it('updates reactively when the lists snapshot fires with new aisles', () => {
      const updatedAisles = [{ name: 'Bakery', order: 1 }]
      let listsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockReturnValue(vi.fn())

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Weekly shop')] })
      expect(store.activeAisles).toEqual(DEFAULT_AISLES)

      listsCallback({ docs: [mockList('list-1', 'Weekly shop', 1000, updatedAisles)] })
      expect(store.activeAisles).toEqual(updatedAisles)
    })
  })

  describe('saveAisles', () => {
    it('is a no-op when activeListId is null', async () => {
      const store = useShoppingStore()
      await store.saveAisles([{ name: 'Dairy', order: 1 }])
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('calls updateDoc on shoppingLists/{listId} with the aisles array', async () => {
      const newAisles = [{ name: 'Dairy', order: 1 }, { name: 'Meat', order: 2 }]
      const store = useShoppingStore()
      store.activateList('list-1')

      await store.saveAisles(newAisles)

      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1')
      expect(mockUpdateDoc).toHaveBeenCalledWith(expect.anything(), { aisles: newAisles })
    })
  })

  describe('deleteAisle', () => {
    it('is a no-op when activeListId is null', async () => {
      const store = useShoppingStore()
      await store.deleteAisle('Dairy')
      expect(mockWriteBatch).not.toHaveBeenCalled()
    })

    it('batch-updates affected items to Unknown/aisleOrder 99', async () => {
      let itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [
        mockItem('item-1', { aisle: 'Dairy', aisleOrder: 1 }),
        mockItem('item-2', { aisle: 'Dairy', aisleOrder: 1 }),
        mockItem('item-3', { aisle: 'Meat', aisleOrder: 2 }),
      ] })

      await store.deleteAisle('Dairy')

      expect(mockWriteBatch).toHaveBeenCalledOnce()
      expect(mockBatchUpdate).toHaveBeenCalledWith(
        expect.anything(), { aisle: 'Unknown', aisleOrder: 99 }
      )
      // Called for both Dairy items but not the Meat item
      expect(mockBatchUpdate.mock.calls.filter(c =>
        c[1]?.aisle === 'Unknown'
      )).toHaveLength(2)
    })

    it('does not update items that are in a different aisle', async () => {
      let itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')
      itemsCallback({ docs: [
        mockItem('item-1', { aisle: 'Meat', aisleOrder: 2 }),
      ] })

      await store.deleteAisle('Dairy')

      const unknownUpdates = mockBatchUpdate.mock.calls.filter(c => c[1]?.aisle === 'Unknown')
      expect(unknownUpdates).toHaveLength(0)
    })

    it('updates the list document with the filtered aisles array', async () => {
      let listsCallback, itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Weekly shop', 1000, DEFAULT_AISLES)] })
      itemsCallback({ docs: [] })

      await store.deleteAisle('Dairy')

      const listDocUpdate = mockBatchUpdate.mock.calls.find(c => c[1]?.aisles !== undefined)
      expect(listDocUpdate).toBeDefined()
      expect(listDocUpdate[1].aisles.find(a => a.name === 'Dairy')).toBeUndefined()
      expect(listDocUpdate[1].aisles).toHaveLength(4)
    })

    it('commits the batch', async () => {
      mockOnSnapshot.mockImplementationOnce((_r, cb) => { cb({ docs: [] }); return vi.fn() })

      const store = useShoppingStore()
      store.activateList('list-1')

      await store.deleteAisle('Dairy')

      expect(mockBatchCommit).toHaveBeenCalledOnce()
    })
  })

  describe('setup — localStorage preference', () => {
    it('activates the saved list when it is present in the snapshot', () => {
      localStorage.setItem('lastActiveListId_fam-1', 'list-2')
      let listsCallback
      mockOnSnapshot.mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Newest', 2000), mockList('list-2', 'Saved', 1000)] })

      expect(store.activeListId).toBe('list-2')
    })

    it('falls back to newest list when the saved ID is no longer in the snapshot', () => {
      localStorage.setItem('lastActiveListId_fam-1', 'list-deleted')
      let listsCallback
      mockOnSnapshot.mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Newest', 2000), mockList('list-2', 'Older', 1000)] })

      expect(store.activeListId).toBe('list-1')
    })

    it('defaults to the newest list when no localStorage entry exists', () => {
      let listsCallback
      mockOnSnapshot.mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Newest', 2000), mockList('list-2', 'Older', 1000)] })

      expect(store.activeListId).toBe('list-1')
    })

    it('writes the list ID to localStorage when activateList is called after setup', () => {
      const store = useShoppingStore()
      store.setup('fam-1')
      store.activateList('list-99')

      expect(localStorage.getItem('lastActiveListId_fam-1')).toBe('list-99')
    })

    it('does not write to localStorage when activateList is called before setup', () => {
      const store = useShoppingStore()
      store.activateList('list-99')

      expect(localStorage.getItem('lastActiveListId_fam-1')).toBeNull()
    })

    it('does not clear localStorage on teardown', () => {
      localStorage.setItem('lastActiveListId_fam-1', 'list-2')
      let listsCallback, itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      // list-2 is in the snapshot so the saved ID is valid → activateList('list-2') writes 'list-2'
      listsCallback({ docs: [mockList('list-1', 'Newest', 2000), mockList('list-2', 'Saved', 1000)] })
      itemsCallback({ docs: [] })
      store.teardown()

      expect(localStorage.getItem('lastActiveListId_fam-1')).toBe('list-2')
    })
  })

  describe('moveOrCopyItem', () => {
    function setupTwoLists(store) {
      let listsCallback, itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })
      store.setup('fam-1')
      listsCallback({ docs: [
        mockList('list-1', 'Weekly shop', 2000, DEFAULT_AISLES),
        mockList('list-2', 'Party supplies', 1000, [
          { name: 'Drinks', order: 1 },
          { name: 'Snacks', order: 2 },
        ]),
      ] })
      itemsCallback({ docs: [
        mockItem('item-1', { name: 'Milk', qty: '2 pints', aisle: 'Dairy', aisleOrder: 1, addedBy: 'parent-uid', sortOrder: 3 }),
      ] })
    }

    it('does nothing when activeListId is null', () => {
      const store = useShoppingStore()
      store.moveOrCopyItem('item-1', 'list-2', 'copy')
      expect(mockAddDoc).not.toHaveBeenCalled()
    })

    it('does nothing when destListId equals activeListId', () => {
      const store = useShoppingStore()
      store.activateList('list-1')
      store.moveOrCopyItem('item-1', 'list-1', 'copy')
      expect(mockAddDoc).not.toHaveBeenCalled()
    })

    it('does nothing when the item is not found in local state', () => {
      const store = useShoppingStore()
      store.activateList('list-1')
      store.moveOrCopyItem('nonexistent', 'list-2', 'copy')
      expect(mockAddDoc).not.toHaveBeenCalled()
    })

    it('copy — calls addDoc on the destination list items subcollection', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      expect(mockAddDoc).toHaveBeenCalledOnce()
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-2', 'items')
    })

    it('copy — writes correct item fields to the destination', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.name).toBe('Milk')
      expect(payload.qty).toBe('2 pints')
      expect(payload.done).toBe(false)
      expect(payload.sortOrder).toBeNull()
      expect(payload.addedBy).toBe('parent-uid')
    })

    it('copy — preserves the priority flag from the source item', () => {
      let listsCallback, itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })
      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [
        mockList('list-1', 'Weekly shop', 2000, DEFAULT_AISLES),
        mockList('list-2', 'Party supplies', 1000, DEFAULT_AISLES),
      ] })
      itemsCallback({ docs: [mockItem('item-1', { priority: true })] })

      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      expect(mockAddDoc.mock.calls[0][1].priority).toBe(true)
    })

    it('copy — falls back to Unknown/99 when the source aisle is not in the destination list', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      // 'Dairy' is not in list-2's aisles ([Drinks, Snacks])
      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.aisle).toBe('Unknown')
      expect(payload.aisleOrder).toBe(99)
    })

    it('copy — uses the destination aisle order when the aisle name matches', () => {
      let listsCallback, itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })
      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [
        mockList('list-1', 'Weekly shop', 2000, DEFAULT_AISLES),
        mockList('list-2', 'Party supplies', 1000, [
          { name: 'Dairy', order: 3 }, // same aisle name, different order
        ]),
      ] })
      itemsCallback({ docs: [
        mockItem('item-1', { name: 'Milk', qty: '2 pints', aisle: 'Dairy', aisleOrder: 1 }),
      ] })

      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      const payload = mockAddDoc.mock.calls[0][1]
      expect(payload.aisle).toBe('Dairy')
      expect(payload.aisleOrder).toBe(3)
    })

    it('copy — does not call deleteDoc (item stays in source list)', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      expect(mockDeleteDoc).not.toHaveBeenCalled()
    })

    it('copy — does not remove the item from local Pinia state', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'copy')

      expect(store.items.some(i => i.id === 'item-1')).toBe(true)
    })

    it('move — calls addDoc on the destination list items subcollection', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'move')

      expect(mockAddDoc).toHaveBeenCalledOnce()
      expect(mockCollection).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-2', 'items')
    })

    it('move — calls deleteDoc on the source item', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'move')

      expect(mockDeleteDoc).toHaveBeenCalledOnce()
      expect(mockDoc).toHaveBeenCalledWith(expect.anything(), 'shoppingLists', 'list-1', 'items', 'item-1')
    })

    it('move — removes the item from local Pinia state immediately', () => {
      const store = useShoppingStore()
      setupTwoLists(store)

      store.moveOrCopyItem('item-1', 'list-2', 'move')

      expect(store.items.some(i => i.id === 'item-1')).toBe(false)
    })
  })

  describe('teardown', () => {
    it('clears lists, items, and activeListId', () => {
      let listsCallback, itemsCallback
      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return vi.fn() })
        .mockImplementationOnce((_r, cb) => { itemsCallback = cb; return vi.fn() })

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Test')] })
      itemsCallback({ docs: [mockItem('item-1')] })

      store.teardown()

      expect(store.lists).toHaveLength(0)
      expect(store.items).toHaveLength(0)
      expect(store.activeListId).toBeNull()
    })

    it('calls both unsubscribe functions', () => {
      const unsubLists = vi.fn()
      const unsubItems = vi.fn()
      let listsCallback

      mockOnSnapshot
        .mockImplementationOnce((_r, cb) => { listsCallback = cb; return unsubLists })
        .mockImplementationOnce(() => unsubItems)

      const store = useShoppingStore()
      store.setup('fam-1')
      listsCallback({ docs: [mockList('list-1', 'Test')] })

      store.teardown()

      expect(unsubLists).toHaveBeenCalledOnce()
      expect(unsubItems).toHaveBeenCalledOnce()
    })
  })
})
