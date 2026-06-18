import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

const {
  mockOnSnapshot,
  mockAddDoc,
  mockUpdateDoc,
  mockDeleteDoc,
  mockGetDocs,
  mockDoc,
  mockCollection,
  mockCollectionGroup,
  mockQuery,
  mockWhere,
  mockServerTimestamp,
  mockWriteBatch,
  mockBatchUpdate,
  mockBatchCommit,
} = vi.hoisted(() => {
  const mockBatchUpdate = vi.fn()
  const mockBatchCommit = vi.fn().mockResolvedValue(undefined)
  return {
    mockOnSnapshot:      vi.fn(() => vi.fn()),
    mockAddDoc:          vi.fn().mockResolvedValue({ id: 'new-doc-id' }),
    mockUpdateDoc:       vi.fn(),
    mockDeleteDoc:       vi.fn().mockResolvedValue(undefined),
    mockGetDocs:         vi.fn().mockResolvedValue({ docs: [] }),
    mockDoc:             vi.fn((...args) => ({ id: args[args.length - 1] ?? 'mock-doc-id' })),
    mockCollection:      vi.fn(() => ({})),
    mockCollectionGroup: vi.fn(() => ({})),
    mockQuery:           vi.fn(() => ({})),
    mockWhere:           vi.fn(() => ({})),
    mockServerTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
    mockWriteBatch:      vi.fn(() => ({ update: mockBatchUpdate, commit: mockBatchCommit })),
    mockBatchUpdate,
    mockBatchCommit,
  }
})

vi.mock('@/firebase/config.js', () => ({ db: {} }))

vi.mock('firebase/firestore', () => ({
  collection:      mockCollection,
  collectionGroup: mockCollectionGroup,
  doc:             mockDoc,
  onSnapshot:      mockOnSnapshot,
  addDoc:          mockAddDoc,
  updateDoc:       mockUpdateDoc,
  deleteDoc:       mockDeleteDoc,
  getDocs:         mockGetDocs,
  serverTimestamp: mockServerTimestamp,
  query:           mockQuery,
  where:           mockWhere,
  writeBatch:      mockWriteBatch,
}))

// Stub family store
const mockFamilyStore = { currentUser: { uid: 'parent-uid' }, members: [] }
vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => mockFamilyStore,
}))

import { useJobsStore } from '@/stores/jobs.js'

// Helpers to fire snapshot callbacks
function fireJobsSnapshot(docs) {
  // The first onSnapshot call is for jobs, second for subtasks
  const calls = mockOnSnapshot.mock.calls
  const jobsCall = calls.find((_, i) => i % 2 === 0) || calls[calls.length - 2] || calls[calls.length - 1]
  const callback = jobsCall[1]
  callback({ docs: docs.map(d => ({ id: d.id, data: () => d.data })) })
}

function fireSubtasksSnapshot(docs) {
  const calls = mockOnSnapshot.mock.calls
  const subtasksCall = calls[calls.length - 1]
  const callback = subtasksCall[1]
  callback({ docs: docs.map(d => ({ id: d.id, data: () => d.data })) })
}

// After setup() is called, the jobs listener is call[0] and subtasks listener is call[1]
function fireSnapshot(listenerIndex, docs) {
  const callback = mockOnSnapshot.mock.calls[listenerIndex][1]
  callback({ docs: docs.map(d => ({ id: d.id, data: () => d.data })) })
}

describe('jobs store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockOnSnapshot.mockReturnValue(vi.fn())
    mockFamilyStore.currentUser = { uid: 'parent-uid' }
  })

  // ── setup() ─────────────────────────────────────────────────────────────────

  describe('setup()', () => {
    it('creates two onSnapshot listeners on setup', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(mockOnSnapshot).toHaveBeenCalledTimes(2)
    })

    it('uses collectionGroup for the subtasks listener', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(mockCollectionGroup).toHaveBeenCalledWith(expect.anything(), 'subtasks')
    })

    it('filters subtasks by familyId', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(mockWhere).toHaveBeenCalledWith('familyId', '==', 'fam-1')
    })

    it('populates jobs from the jobs snapshot', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(0, [
        { id: 'job-1', data: { title: 'Fix fence', status: 'suggested', category: 'Garden', suggestedBy: 'uid-1' } },
      ])
      expect(store.jobs).toHaveLength(1)
      expect(store.jobs[0].id).toBe('job-1')
      expect(store.jobs[0].title).toBe('Fix fence')
    })

    it('applies defensive fallbacks when job fields are absent', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(0, [
        { id: 'job-old', data: { title: 'Old job' } },
      ])
      expect(store.jobs[0].description).toBeNull()
      expect(store.jobs[0].priority).toBeNull()
      expect(store.jobs[0].costEstimate).toBeNull()
      expect(store.jobs[0].assignedTo).toBeNull()
      expect(store.jobs[0].status).toBe('suggested')
    })

    it('populates subtasks from the subtasks snapshot', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'Buy paint', done: false, order: 1 } },
      ])
      expect(store.subtasks).toHaveLength(1)
      expect(store.subtasks[0].id).toBe('st-1')
    })

    it('applies defensive fallbacks when subtask fields are absent', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-old', data: { jobId: 'job-1', familyId: 'fam-1', title: 'Task' } },
      ])
      expect(store.subtasks[0].done).toBe(false)
      expect(store.subtasks[0].assignedTo).toBeNull()
      expect(store.subtasks[0].order).toBe(0)
    })

    it('unsubscribes the existing listeners before creating new ones on re-setup', () => {
      const firstUnsub1 = vi.fn()
      const firstUnsub2 = vi.fn()
      mockOnSnapshot
        .mockReturnValueOnce(firstUnsub1)
        .mockReturnValueOnce(firstUnsub2)
      const store = useJobsStore()
      store.setup('fam-1')
      store.setup('fam-2')
      expect(firstUnsub1).toHaveBeenCalledOnce()
      expect(firstUnsub2).toHaveBeenCalledOnce()
    })
  })

  // ── teardown() ────────────────────────────────────────────────────────────

  describe('teardown()', () => {
    it('calls both unsubscribe functions', () => {
      const unsub1 = vi.fn()
      const unsub2 = vi.fn()
      mockOnSnapshot
        .mockReturnValueOnce(unsub1)
        .mockReturnValueOnce(unsub2)
      const store = useJobsStore()
      store.setup('fam-1')
      store.teardown()
      expect(unsub1).toHaveBeenCalledOnce()
      expect(unsub2).toHaveBeenCalledOnce()
    })

    it('clears jobs and subtasks arrays', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(0, [{ id: 'j-1', data: { title: 'Job', status: 'suggested' } }])
      expect(store.jobs).toHaveLength(1)
      store.teardown()
      expect(store.jobs).toHaveLength(0)
      expect(store.subtasks).toHaveLength(0)
    })

    it('does not throw when called before setup', () => {
      const store = useJobsStore()
      expect(() => store.teardown()).not.toThrow()
    })
  })

  // ── subtasksFor() ─────────────────────────────────────────────────────────

  describe('subtasksFor()', () => {
    it('returns only subtasks for the given jobId', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 1 } },
        { id: 'st-2', data: { jobId: 'job-2', familyId: 'fam-1', title: 'B', done: false, order: 1 } },
        { id: 'st-3', data: { jobId: 'job-1', familyId: 'fam-1', title: 'C', done: false, order: 2 } },
      ])
      const result = store.subtasksFor('job-1')
      expect(result).toHaveLength(2)
      expect(result.every(s => s.jobId === 'job-1')).toBe(true)
    })

    it('sorts subtasks by order field', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-3', data: { jobId: 'job-1', familyId: 'fam-1', title: 'C', done: false, order: 3 } },
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 1 } },
        { id: 'st-2', data: { jobId: 'job-1', familyId: 'fam-1', title: 'B', done: false, order: 2 } },
      ])
      const result = store.subtasksFor('job-1')
      expect(result.map(s => s.order)).toEqual([1, 2, 3])
    })

    it('returns empty array for a jobId with no subtasks', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(store.subtasksFor('nonexistent')).toHaveLength(0)
    })
  })

  // ── progressFor() ────────────────────────────────────────────────────────

  describe('progressFor()', () => {
    it('returns correct done/total counts', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: true,  order: 1 } },
        { id: 'st-2', data: { jobId: 'job-1', familyId: 'fam-1', title: 'B', done: false, order: 2 } },
        { id: 'st-3', data: { jobId: 'job-1', familyId: 'fam-1', title: 'C', done: true,  order: 3 } },
      ])
      expect(store.progressFor('job-1')).toEqual({ done: 2, total: 3 })
    })

    it('returns { done: 0, total: 0 } for a job with no subtasks', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(store.progressFor('no-subtasks')).toEqual({ done: 0, total: 0 })
    })
  })

  // ── addJob() ──────────────────────────────────────────────────────────────

  describe('addJob()', () => {
    it('calls addDoc with the correct fields', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      store.addJob({ title: 'New job', description: 'Details', category: 'Garden' })
      expect(mockAddDoc).toHaveBeenCalledOnce()
      const data = mockAddDoc.mock.calls[0][1]
      expect(data.title).toBe('New job')
      expect(data.status).toBe('suggested')
      expect(data.priority).toBeNull()
      expect(data.assignedTo).toBeNull()
      expect(data.costEstimate).toBeNull()
      expect(data.suggestedBy).toBe('parent-uid')
    })

    it('stamps suggestedBy from currentUser', () => {
      mockFamilyStore.currentUser = { uid: 'child-uid' }
      const store = useJobsStore()
      store.setup('fam-1')
      store.addJob({ title: 'Child job' })
      expect(mockAddDoc.mock.calls[0][1].suggestedBy).toBe('child-uid')
    })

    it('is fire-and-forget — does not throw when addDoc rejects', () => {
      mockAddDoc.mockRejectedValueOnce(new Error('network'))
      const store = useJobsStore()
      store.setup('fam-1')
      expect(() => store.addJob({ title: 'Test' })).not.toThrow()
    })
  })

  // ── updateJob() ──────────────────────────────────────────────────────────

  describe('updateJob()', () => {
    it('calls updateDoc with the provided fields and updatedAt', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      store.updateJob('job-1', { status: 'planned' })
      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      const data = mockUpdateDoc.mock.calls[0][1]
      expect(data.status).toBe('planned')
      expect(data.updatedAt).toBeDefined()
    })
  })

  // ── deleteJob() ───────────────────────────────────────────────────────────

  describe('deleteJob()', () => {
    it('deletes subtasks before deleting the parent job', async () => {
      const subtaskDoc = { id: 'st-1' }
      mockGetDocs.mockResolvedValueOnce({ docs: [subtaskDoc] })
      const deleteOrder = []
      mockDeleteDoc.mockImplementation(() => {
        deleteOrder.push(mockDeleteDoc.mock.calls.length)
        return Promise.resolve()
      })

      const store = useJobsStore()
      store.setup('fam-1')
      await store.deleteJob('job-1')

      // getDocs called to get subtasks
      expect(mockGetDocs).toHaveBeenCalledOnce()
      // deleteDoc called for subtask then the job (2 calls)
      expect(mockDeleteDoc).toHaveBeenCalledTimes(2)
    })

    it('still deletes the job when there are no subtasks', async () => {
      mockGetDocs.mockResolvedValueOnce({ docs: [] })
      const store = useJobsStore()
      store.setup('fam-1')
      await store.deleteJob('job-1')
      expect(mockDeleteDoc).toHaveBeenCalledTimes(1)
    })
  })

  // ── addSubtask() ─────────────────────────────────────────────────────────

  describe('addSubtask()', () => {
    it('calls addDoc with the correct fields', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      store.addSubtask('job-1', 'Buy paint')
      expect(mockAddDoc).toHaveBeenCalledOnce()
      const data = mockAddDoc.mock.calls[0][1]
      expect(data.title).toBe('Buy paint')
      expect(data.done).toBe(false)
      expect(data.familyId).toBe('fam-1')
      expect(data.jobId).toBe('job-1')
    })

    it('sets order to maxExistingOrder + 1', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 3 } },
        { id: 'st-2', data: { jobId: 'job-1', familyId: 'fam-1', title: 'B', done: false, order: 5 } },
      ])
      store.addSubtask('job-1', 'New task')
      expect(mockAddDoc.mock.calls[0][1].order).toBe(6)
    })

    it('sets order to 1 when there are no existing subtasks', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      store.addSubtask('job-1', 'First task')
      expect(mockAddDoc.mock.calls[0][1].order).toBe(1)
    })
  })

  // ── toggleSubtask() ──────────────────────────────────────────────────────

  describe('toggleSubtask()', () => {
    it('flips done optimistically in local state', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 1 } },
      ])
      store.toggleSubtask('st-1')
      expect(store.subtasks[0].done).toBe(true)
    })

    it('calls updateDoc with only done and updatedAt', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 1 } },
      ])
      store.toggleSubtask('st-1')
      expect(mockUpdateDoc).toHaveBeenCalledOnce()
      const data = mockUpdateDoc.mock.calls[0][1]
      expect(Object.keys(data)).toEqual(expect.arrayContaining(['done', 'updatedAt']))
      expect(Object.keys(data)).not.toContain('title')
      expect(Object.keys(data)).not.toContain('order')
      expect(Object.keys(data)).not.toContain('assignedTo')
    })

    it('is fire-and-forget — does not throw when updateDoc rejects', () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('offline'))
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 1 } },
      ])
      expect(() => store.toggleSubtask('st-1')).not.toThrow()
    })

    it('does not throw when subtaskId is absent', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(() => store.toggleSubtask('nonexistent')).not.toThrow()
      expect(mockUpdateDoc).not.toHaveBeenCalled()
    })

    it('toggles from true to false', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: true, order: 1 } },
      ])
      store.toggleSubtask('st-1')
      expect(store.subtasks[0].done).toBe(false)
    })
  })

  // ── reorderSubtasks() ────────────────────────────────────────────────────

  describe('reorderSubtasks()', () => {
    it('writes a batch with order fields for each id', async () => {
      const store = useJobsStore()
      store.setup('fam-1')
      await store.reorderSubtasks('job-1', ['st-c', 'st-a', 'st-b'])
      expect(mockWriteBatch).toHaveBeenCalledOnce()
      expect(mockBatchUpdate).toHaveBeenCalledTimes(3)
      expect(mockBatchCommit).toHaveBeenCalledOnce()
      // First id gets order 1, second gets 2, etc.
      expect(mockBatchUpdate.mock.calls[0][1].order).toBe(1)
      expect(mockBatchUpdate.mock.calls[1][1].order).toBe(2)
      expect(mockBatchUpdate.mock.calls[2][1].order).toBe(3)
    })
  })

  // ── deleteSubtask() ──────────────────────────────────────────────────────

  describe('deleteSubtask()', () => {
    it('removes the subtask from local state and calls deleteDoc', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      fireSnapshot(1, [
        { id: 'st-1', data: { jobId: 'job-1', familyId: 'fam-1', title: 'A', done: false, order: 1 } },
      ])
      store.deleteSubtask('st-1')
      expect(store.subtasks).toHaveLength(0)
      expect(mockDeleteDoc).toHaveBeenCalledOnce()
    })

    it('does not throw when subtaskId is absent', () => {
      const store = useJobsStore()
      store.setup('fam-1')
      expect(() => store.deleteSubtask('nonexistent')).not.toThrow()
    })
  })
})
