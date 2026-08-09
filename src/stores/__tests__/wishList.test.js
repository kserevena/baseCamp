import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const {
  mockOnSnapshot,
  mockAddDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockDoc,
  mockCollection,
  mockServerTimestamp,
} = vi.hoisted(() => ({
  mockOnSnapshot:      vi.fn(() => vi.fn()),
  mockAddDoc:          vi.fn().mockResolvedValue({ id: 'new-doc-id' }),
  mockUpdateDoc:       vi.fn(),
  mockDeleteDoc:       vi.fn().mockResolvedValue(undefined),
  mockDoc:             vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  mockCollection:      vi.fn((...args) => ({ path: args.slice(1).join('/') })),
  mockServerTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection:      mockCollection,
  doc:             mockDoc,
  onSnapshot:      mockOnSnapshot,
  addDoc:          mockAddDoc,
  updateDoc:       mockUpdateDoc,
  deleteDoc:       mockDeleteDoc,
  serverTimestamp: mockServerTimestamp,
}))

// Stub family store — the wish list store reads currentUser.uid to stamp
// addedBy/doneBy and to compute myActiveCount.
const mockFamilyStore = { currentUser: { uid: 'parent-uid' }, members: [] }
vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => mockFamilyStore,
}))

import { useWishListStore } from '@/stores/wishList.js'

// Fires the items snapshot callback registered by setup().
function fireSnapshot(docs) {
  const callback = mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 1][1]
  callback({ docs: docs.map(d => ({ id: d.id, data: () => d.data })) })
}

// Firestore Timestamps only need toMillis() for the store's sort.
const ts = (millis) => ({ toMillis: () => millis })

function setupStore(familyId = 'fam-1') {
  const store = useWishListStore()
  store.setup(familyId)
  return store
}

describe('wishList store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockFamilyStore.currentUser = { uid: 'parent-uid' }
  })

  // ── setup() ────────────────────────────────────────────────────────────────

  describe('setup()', () => {
    it('creates a single onSnapshot listener on the family wishListItems collection', () => {
      setupStore()
      expect(mockOnSnapshot).toHaveBeenCalledTimes(1)
      expect(mockCollection).toHaveBeenCalledWith({}, 'families', 'fam-1', 'wishListItems')
    })

    it('populates items from the snapshot', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set', done: false } },
      ])
      expect(store.items).toHaveLength(1)
      expect(store.items[0]).toMatchObject({ id: 'w-1', ownerUid: 'child-uid', name: 'Lego set' })
    })

    it('applies defensive fallbacks when fields are absent', () => {
      const store = setupStore()
      fireSnapshot([{ id: 'w-old', data: {} }])
      expect(store.items[0]).toMatchObject({
        ownerUid:  null,
        name:      '',
        note:      null,
        link:      null,
        done:      false,
        doneBy:    null,
        addedBy:   null,
        createdAt: null,
        updatedAt: null,
      })
    })

    it('unsubscribes a previous listener when setup is called again', () => {
      const unsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValueOnce(unsubscribe)
      const store = useWishListStore()
      store.setup('fam-1')
      store.setup('fam-2')
      expect(unsubscribe).toHaveBeenCalled()
    })
  })

  // ── teardown() ─────────────────────────────────────────────────────────────

  describe('teardown()', () => {
    it('unsubscribes the listener and clears items', () => {
      const unsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValueOnce(unsubscribe)
      const store = useWishListStore()
      store.setup('fam-1')
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set' } }])
      store.teardown()
      expect(unsubscribe).toHaveBeenCalled()
      expect(store.items).toEqual([])
    })

    it('makes writes no-ops after teardown', () => {
      const store = setupStore()
      store.teardown()
      store.addItem({ ownerUid: 'child-uid', name: 'Ignored' })
      expect(mockAddDoc).not.toHaveBeenCalled()
    })
  })

  // ── getters ────────────────────────────────────────────────────────────────

  describe('itemsFor()', () => {
    it('returns only the given member\'s items', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid',  name: 'Lego set' } },
        { id: 'w-2', data: { ownerUid: 'parent-uid', name: 'Drill' } },
      ])
      expect(store.itemsFor('child-uid').map(i => i.id)).toEqual(['w-1'])
    })

    it('sorts outstanding items before ticked ones', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-done',   data: { ownerUid: 'child-uid', name: 'Bought',  done: true,  createdAt: ts(3000) } },
        { id: 'w-active', data: { ownerUid: 'child-uid', name: 'Wanted',  done: false, createdAt: ts(1000) } },
      ])
      expect(store.itemsFor('child-uid').map(i => i.id)).toEqual(['w-active', 'w-done'])
    })

    it('sorts newest first within each group', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-old', data: { ownerUid: 'child-uid', name: 'Old', done: false, createdAt: ts(1000) } },
        { id: 'w-new', data: { ownerUid: 'child-uid', name: 'New', done: false, createdAt: ts(2000) } },
      ])
      expect(store.itemsFor('child-uid').map(i => i.id)).toEqual(['w-new', 'w-old'])
    })

    it('tolerates a null createdAt from a not-yet-synced optimistic write', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-synced',   data: { ownerUid: 'child-uid', name: 'Synced', done: false, createdAt: ts(1000) } },
        { id: 'w-unsynced', data: { ownerUid: 'child-uid', name: 'Pending', done: false } },
      ])
      expect(store.itemsFor('child-uid').map(i => i.id)).toEqual(['w-synced', 'w-unsynced'])
    })

    it('does not mutate the underlying items array when sorting', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid', name: 'A', done: true,  createdAt: ts(1000) } },
        { id: 'w-2', data: { ownerUid: 'child-uid', name: 'B', done: false, createdAt: ts(2000) } },
      ])
      store.itemsFor('child-uid')
      expect(store.items.map(i => i.id)).toEqual(['w-1', 'w-2'])
    })
  })

  describe('activeCountFor() and myActiveCount', () => {
    beforeEach(() => {
      mockFamilyStore.currentUser = { uid: 'child-uid' }
    })

    it('counts only outstanding items for that member', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid',  name: 'A', done: false } },
        { id: 'w-2', data: { ownerUid: 'child-uid',  name: 'B', done: true } },
        { id: 'w-3', data: { ownerUid: 'parent-uid', name: 'C', done: false } },
      ])
      expect(store.activeCountFor('child-uid')).toBe(1)
      expect(store.activeCountFor('parent-uid')).toBe(1)
      expect(store.activeCountFor('nobody')).toBe(0)
    })

    it('myActiveCount tracks the current user', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid', name: 'A', done: false } },
        { id: 'w-2', data: { ownerUid: 'child-uid', name: 'B', done: false } },
      ])
      expect(store.myActiveCount).toBe(2)
    })

    it('myActiveCount is 0 when there is no current user', () => {
      mockFamilyStore.currentUser = null
      const store = setupStore()
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'A', done: false } }])
      expect(store.myActiveCount).toBe(0)
    })
  })

  // ── addItem() ──────────────────────────────────────────────────────────────

  describe('addItem()', () => {
    it('writes a new item to the family collection with defaults', () => {
      const store = setupStore()
      store.addItem({ ownerUid: 'child-uid', name: 'Lego set' })
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'families/fam-1/wishListItems' }),
        expect.objectContaining({
          ownerUid: 'child-uid',
          name:     'Lego set',
          note:     null,
          link:     null,
          done:     false,
          doneBy:   null,
          addedBy:  'parent-uid',
        }),
      )
    })

    it('stores note and link when provided', () => {
      const store = setupStore()
      store.addItem({ ownerUid: 'child-uid', name: 'Bike', note: 'Blue one', link: 'https://example.com' })
      expect(mockAddDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ note: 'Blue one', link: 'https://example.com' }),
      )
    })

    it('does nothing when ownerUid is missing', () => {
      const store = setupStore()
      store.addItem({ ownerUid: null, name: 'Orphan' })
      expect(mockAddDoc).not.toHaveBeenCalled()
    })
  })

  // ── toggleDone() ───────────────────────────────────────────────────────────

  describe('toggleDone()', () => {
    it('flips done in local state immediately (optimistic write)', () => {
      const store = setupStore()
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set', done: false } }])
      store.toggleDone('w-1')
      expect(store.items[0].done).toBe(true)
    })

    it('stamps doneBy with the current user when ticking', () => {
      const store = setupStore()
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set', done: false } }])
      store.toggleDone('w-1')
      expect(store.items[0].doneBy).toBe('parent-uid')
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'families/fam-1/wishListItems/w-1' }),
        expect.objectContaining({ done: true, doneBy: 'parent-uid' }),
      )
    })

    it('clears doneBy when un-ticking', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set', done: true, doneBy: 'parent-uid' } },
      ])
      store.toggleDone('w-1')
      expect(store.items[0].done).toBe(false)
      expect(store.items[0].doneBy).toBeNull()
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ done: false, doneBy: null }),
      )
    })

    it('does not write ownerUid, so the immutability rule cannot be tripped', () => {
      const store = setupStore()
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set', done: false } }])
      store.toggleDone('w-1')
      expect(Object.keys(mockUpdateDoc.mock.calls[0][1]).sort()).toEqual(['done', 'doneBy', 'updatedAt'])
    })

    it('does nothing for an unknown item id', () => {
      const store = setupStore()
      fireSnapshot([])
      store.toggleDone('missing')
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })
  })

  // ── updateItem() ───────────────────────────────────────────────────────────

  describe('updateItem()', () => {
    beforeEach(() => {
      mockFamilyStore.currentUser = { uid: 'child-uid' }
    })

    it('writes only the supplied fields', () => {
      const store = setupStore()
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set' } }])
      store.updateItem('w-1', { name: 'Lego Technic set' })
      expect(mockUpdateDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'families/fam-1/wishListItems/w-1' }),
        expect.objectContaining({ name: 'Lego Technic set' }),
      )
      expect(Object.keys(mockUpdateDoc.mock.calls[0][1]).sort()).toEqual(['name', 'updatedAt'])
    })

    it('normalises an empty note or link to null', () => {
      const store = setupStore()
      fireSnapshot([{ id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set', note: 'Old' } }])
      store.updateItem('w-1', { note: undefined, link: null })
      expect(mockUpdateDoc.mock.calls[0][1]).toMatchObject({ link: null })
      expect(mockUpdateDoc.mock.calls[0][1]).not.toHaveProperty('note')
    })

    it('does nothing for an unknown item id', () => {
      const store = setupStore()
      fireSnapshot([])
      store.updateItem('missing', { name: 'Nope' })
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })
  })

  // ── deleteItem() ───────────────────────────────────────────────────────────

  describe('deleteItem()', () => {
    it('removes the item from local state and deletes the document', () => {
      const store = setupStore()
      fireSnapshot([
        { id: 'w-1', data: { ownerUid: 'child-uid', name: 'Lego set' } },
        { id: 'w-2', data: { ownerUid: 'child-uid', name: 'Bike' } },
      ])
      store.deleteItem('w-1')
      expect(store.items.map(i => i.id)).toEqual(['w-2'])
      expect(mockDeleteDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'families/fam-1/wishListItems/w-1' }),
      )
    })

    it('does nothing for an unknown item id', () => {
      const store = setupStore()
      fireSnapshot([])
      store.deleteItem('missing')
      expect(mockDeleteDoc).not.toHaveBeenCalled()
    })
  })
})
