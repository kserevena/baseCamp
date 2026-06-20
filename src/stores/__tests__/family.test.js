import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// vi.hoisted ensures these are initialized before vi.mock factories run
const {
  mockGetDoc, mockGetDocFromCache, mockSetDoc, mockGetDocs, mockOnSnapshot,
  mockDoc, mockCollection, mockQuery, mockWhere, mockServerTimestamp,
  mockUseAuthStore,
} = vi.hoisted(() => ({
  mockGetDoc:           vi.fn(),
  mockGetDocFromCache:  vi.fn().mockRejectedValue(new Error('not in cache')),
  mockSetDoc:           vi.fn().mockResolvedValue(undefined),
  mockGetDocs:          vi.fn(),
  mockOnSnapshot:       vi.fn(() => vi.fn()),
  mockDoc:              vi.fn(() => ({ id: 'mock-doc-id' })),
  mockCollection:       vi.fn(() => ({})),
  mockQuery:            vi.fn(() => ({})),
  mockWhere:            vi.fn(() => ({})),
  mockServerTimestamp:  vi.fn(() => new Date()),
  mockUseAuthStore:     vi.fn(() => ({ user: { uid: 'parent-uid', displayName: 'Test Parent' } })),
}))

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: mockUseAuthStore,
}))

vi.mock('@/firebase/config.js', () => ({
  auth: {},
  db: {},
}))

vi.mock('firebase/firestore', () => ({
  getDoc: mockGetDoc,
  getDocFromCache: mockGetDocFromCache,
  setDoc: mockSetDoc,
  getDocs: mockGetDocs,
  onSnapshot: mockOnSnapshot,
  doc: mockDoc,
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  serverTimestamp: mockServerTimestamp,
}))

import { useFamilyStore } from '@/stores/family.js'

describe('family store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockGetDocFromCache.mockRejectedValue(new Error('not in cache'))
    mockSetDoc.mockResolvedValue(undefined)
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockDoc.mockReturnValue({ id: 'mock-doc-id' })
    mockCollection.mockReturnValue({})
    mockQuery.mockReturnValue({})
    mockWhere.mockReturnValue({})
    mockServerTimestamp.mockReturnValue(new Date())
    mockUseAuthStore.mockReturnValue({ user: { uid: 'parent-uid', displayName: 'Test Parent' } })
  })

  describe('resolveFamily', () => {
    it('sets familyId and calls setup when users/{uid} doc exists', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-123' }),
      })

      const store = useFamilyStore()
      await store.resolveFamily('parent-uid')

      expect(store.familyId).toBe('fam-123')
      expect(mockOnSnapshot).toHaveBeenCalledOnce()
    })

    it('leaves familyId null when users/{uid} doc does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false })

      const store = useFamilyStore()
      await store.resolveFamily('parent-uid')

      expect(store.familyId).toBeNull()
      expect(mockOnSnapshot).not.toHaveBeenCalled()
    })

    it('is idempotent — does not call getDoc again if familyId already set', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-123' }),
      })

      const store = useFamilyStore()
      await store.resolveFamily('parent-uid')
      await store.resolveFamily('parent-uid')

      expect(mockGetDoc).toHaveBeenCalledOnce()
    })

    it('resolves familyId from cache without a network read', async () => {
      mockGetDocFromCache.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-cache' }),
      })

      const store = useFamilyStore()
      await store.resolveFamily('parent-uid')

      expect(store.familyId).toBe('fam-cache')
      expect(mockGetDocFromCache).toHaveBeenCalledOnce()
      expect(mockGetDoc).not.toHaveBeenCalled()
    })

    it('falls back to a network read when the document is not in cache', async () => {
      mockGetDocFromCache.mockRejectedValue(new Error('not in cache'))
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-network' }),
      })

      const store = useFamilyStore()
      await store.resolveFamily('parent-uid')

      expect(store.familyId).toBe('fam-network')
      expect(mockGetDoc).toHaveBeenCalledOnce()
    })

    it('leaves familyId null and does not throw when offline and uncached', async () => {
      mockGetDocFromCache.mockRejectedValue(new Error('not in cache'))
      mockGetDoc.mockRejectedValue(new Error('client is offline'))

      const store = useFamilyStore()
      await expect(store.resolveFamily('parent-uid')).resolves.toBeUndefined()
      expect(store.familyId).toBeNull()
    })
  })

  describe('currentUser', () => {
    it('returns the member matching the auth user uid', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-123' }),
      })
      mockOnSnapshot.mockImplementation((ref, callback) => {
        callback({
          docs: [
            { id: 'parent-uid', data: () => ({ name: 'Test Parent', role: 'parent', colour: '#fff' }) },
            { id: 'other-uid',  data: () => ({ name: 'Other',       role: 'child',  colour: '#000' }) },
          ],
        })
        return vi.fn()
      })

      const store = useFamilyStore()
      await store.resolveFamily('parent-uid')

      expect(store.currentUser).toEqual({ uid: 'parent-uid', name: 'Test Parent', role: 'parent', colour: '#fff' })
    })

    it('returns null when no member matches the auth user uid', async () => {
      const store = useFamilyStore()
      expect(store.currentUser).toBeNull()
    })

    it('returns null when auth user is null', () => {
      mockUseAuthStore.mockReturnValueOnce({ user: null })
      const store = useFamilyStore()
      expect(store.currentUser).toBeNull()
    })
  })

  describe('createFamily', () => {
    it('calls setDoc four times — family, member, user, and inviteCode docs', async () => {
      const store = useFamilyStore()
      await store.createFamily('The Smiths')

      expect(mockSetDoc).toHaveBeenCalledTimes(4)
    })

    it('writes the family name and stamps the creator on the family doc', async () => {
      const store = useFamilyStore()
      await store.createFamily('The Smiths')

      const familyDocCall = mockSetDoc.mock.calls[0]
      // createdBy is what the security rule uses to let exactly one user seat
      // themselves as parent.
      expect(familyDocCall[1]).toMatchObject({ name: 'The Smiths', createdBy: 'parent-uid' })
    })

    it('writes the creator as parent to the members doc', async () => {
      const store = useFamilyStore()
      await store.createFamily('The Smiths')

      const memberDocCall = mockSetDoc.mock.calls[1]
      expect(memberDocCall[1]).toMatchObject({
        name: 'Test Parent',
        role: 'parent',
      })
    })

    it('writes familyId to the users doc', async () => {
      const store = useFamilyStore()
      await store.createFamily('The Smiths')

      const userDocCall = mockSetDoc.mock.calls[2]
      expect(userDocCall[1]).toMatchObject({ familyId: expect.any(String) })
    })

    it('sets familyId after writes complete', async () => {
      const store = useFamilyStore()
      await store.createFamily('The Smiths')

      expect(store.familyId).not.toBeNull()
    })
  })

  describe('joinFamily', () => {
    it('returns false when the invite code doc does not exist', async () => {
      mockGetDoc.mockResolvedValue({ exists: () => false })

      const store = useFamilyStore()
      const result = await store.joinFamily('XXXXXX')

      expect(result).toBe(false)
      expect(mockSetDoc).not.toHaveBeenCalled()
    })

    it('returns true and sets familyId when a valid invite code is found', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-456' }),
      })

      const store = useFamilyStore()
      const result = await store.joinFamily('ABC123')

      expect(result).toBe(true)
      expect(store.familyId).toBe('fam-456')
    })

    it('writes the joining user as a child member, carrying the invite code', async () => {
      mockGetDoc.mockResolvedValue({
        exists: () => true,
        data: () => ({ familyId: 'fam-456' }),
      })

      const store = useFamilyStore()
      await store.joinFamily('ABCD2345')

      const memberDocCall = mockSetDoc.mock.calls[0]
      // role must be 'child' (no self-promotion) and the code must be recorded so
      // the security rule can verify the joiner actually holds it.
      expect(memberDocCall[1]).toMatchObject({ role: 'child', inviteCode: 'ABCD2345' })
    })
  })
})
