import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const {
  mockOnSnapshot, mockUpdateDoc, mockDoc, mockCollection, mockQuery, mockWhere,
  mockArrayUnion, mockArrayRemove,
} = vi.hoisted(() => ({
  mockOnSnapshot:  vi.fn(() => vi.fn()),
  mockUpdateDoc:   vi.fn(),
  mockDoc:         vi.fn(() => ({ id: 'mock-doc-id' })),
  mockCollection:  vi.fn(() => ({})),
  mockQuery:       vi.fn(() => ({})),
  mockWhere:       vi.fn(() => ({})),
  mockArrayUnion:  vi.fn((uid) => ({ _type: 'arrayUnion', uid })),
  mockArrayRemove: vi.fn((uid) => ({ _type: 'arrayRemove', uid })),
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  onSnapshot:  mockOnSnapshot,
  updateDoc:   mockUpdateDoc,
  doc:         mockDoc,
  collection:  mockCollection,
  query:       mockQuery,
  where:       mockWhere,
  arrayUnion:  mockArrayUnion,
  arrayRemove: mockArrayRemove,
}))

import { useMealsStore } from '@/stores/meals.js'

function fireSnapshot(store, docs) {
  const callback = mockOnSnapshot.mock.calls[mockOnSnapshot.mock.calls.length - 1][1]
  callback({ docs: docs.map(d => ({ id: d.id, data: () => d.data })) })
}

describe('meals store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockOnSnapshot.mockReturnValue(vi.fn())
  })

  // ── setup() ────────────────────────────────────────────────────────────────

  describe('setup()', () => {
    it('subscribes to the meals collection filtered by familyId', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      expect(mockOnSnapshot).toHaveBeenCalledOnce()
      expect(mockWhere).toHaveBeenCalledWith('familyId', '==', 'fam-1')
    })

    it('populates meals from the initial snapshot', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { familyId: 'fam-1', name: 'Pasta', votes: [] } },
        { id: 'meal-2', data: { familyId: 'fam-1', name: 'Pizza', votes: ['uid-1'] } },
      ])
      expect(store.meals).toHaveLength(2)
      expect(store.meals[0]).toEqual({ id: 'meal-1', familyId: 'fam-1', name: 'Pasta', votes: [] })
      expect(store.meals[1]).toEqual({ id: 'meal-2', familyId: 'fam-1', name: 'Pizza', votes: ['uid-1'] })
    })

    it('replaces meals on subsequent snapshot updates', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
      ])
      expect(store.meals).toHaveLength(1)
      fireSnapshot(store, [])
      expect(store.meals).toHaveLength(0)
    })

    it('unsubscribes the existing listener before creating a new one on re-setup', () => {
      const firstUnsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValueOnce(firstUnsubscribe)
      const store = useMealsStore()
      store.setup('fam-1')
      store.setup('fam-2')
      expect(firstUnsubscribe).toHaveBeenCalledOnce()
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2)
    })
  })

  // ── teardown() ─────────────────────────────────────────────────────────────

  describe('teardown()', () => {
    it('calls the unsubscribe function', () => {
      const unsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValue(unsubscribe)
      const store = useMealsStore()
      store.setup('fam-1')
      store.teardown()
      expect(unsubscribe).toHaveBeenCalledOnce()
    })

    it('clears the meals array', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
      ])
      expect(store.meals).toHaveLength(1)
      store.teardown()
      expect(store.meals).toHaveLength(0)
    })

    it('does not throw when called before setup', () => {
      const store = useMealsStore()
      expect(() => store.teardown()).not.toThrow()
    })

    it('nulls out the unsubscribe reference so a second teardown is safe', () => {
      const unsubscribe = vi.fn()
      mockOnSnapshot.mockReturnValue(unsubscribe)
      const store = useMealsStore()
      store.setup('fam-1')
      store.teardown()
      expect(() => store.teardown()).not.toThrow()
      expect(unsubscribe).toHaveBeenCalledOnce()
    })
  })

  // ── toggleVote() ───────────────────────────────────────────────────────────

  describe('toggleVote()', () => {
    it('adds uid to votes optimistically when user has not yet voted', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
      ])
      store.toggleVote('meal-1', 'uid-1')
      expect(store.meals[0].votes).toContain('uid-1')
    })

    it('calls updateDoc with arrayUnion when user has not voted', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
      ])
      store.toggleVote('meal-1', 'uid-1')
      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      expect(mockArrayUnion).toHaveBeenCalledWith('uid-1')
      expect(mockArrayRemove).not.toHaveBeenCalled()
    })

    it('removes uid from votes optimistically when user has already voted', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: ['uid-1', 'uid-2'] } },
      ])
      store.toggleVote('meal-1', 'uid-1')
      expect(store.meals[0].votes).not.toContain('uid-1')
      expect(store.meals[0].votes).toContain('uid-2')
    })

    it('calls updateDoc with arrayRemove when user has already voted', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: ['uid-1'] } },
      ])
      store.toggleVote('meal-1', 'uid-1')
      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      expect(mockArrayRemove).toHaveBeenCalledWith('uid-1')
      expect(mockArrayUnion).not.toHaveBeenCalled()
    })

    it('does not update state or call updateDoc when mealId is not found', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
      ])
      expect(() => store.toggleVote('nonexistent', 'uid-1')).not.toThrow()
      expect(mockUpdateDoc).not.toHaveBeenCalled()
      expect(store.meals[0].votes).toHaveLength(0)
    })

    it('is fire-and-forget — does not throw even when updateDoc rejects', () => {
      mockUpdateDoc.mockRejectedValue(new Error('network error'))
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
      ])
      expect(() => store.toggleVote('meal-1', 'uid-1')).not.toThrow()
      // Optimistic state still applied despite the rejected write
      expect(store.meals[0].votes).toContain('uid-1')
    })

    it('handles absent votes field on old meal documents without crashing', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      // Old documents may not have a votes field
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta' } },
      ])
      expect(() => store.toggleVote('meal-1', 'uid-1')).not.toThrow()
    })

    it('does not mutate other meals when toggling one', () => {
      const store = useMealsStore()
      store.setup('fam-1')
      fireSnapshot(store, [
        { id: 'meal-1', data: { name: 'Pasta', votes: [] } },
        { id: 'meal-2', data: { name: 'Pizza', votes: ['uid-1'] } },
      ])
      store.toggleVote('meal-1', 'uid-1')
      expect(store.meals[1].votes).toEqual(['uid-1'])
    })
  })
})
