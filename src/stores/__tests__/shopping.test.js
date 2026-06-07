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
