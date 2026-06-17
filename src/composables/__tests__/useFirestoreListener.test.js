import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockOnSnapshot } = vi.hoisted(() => ({
  mockOnSnapshot: vi.fn(),
}))

vi.mock('firebase/firestore', () => ({ onSnapshot: mockOnSnapshot }))

import { useFirestoreListener } from '@/composables/useFirestoreListener.js'

describe('useFirestoreListener', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSnapshot.mockReturnValue(vi.fn())
  })

  it('calls onSnapshot with the given ref and handler', () => {
    const { subscribe } = useFirestoreListener()
    const ref = {}
    const handler = vi.fn()
    subscribe(ref, handler)
    expect(mockOnSnapshot).toHaveBeenCalledWith(ref, handler)
  })

  it('returns an unsubscribe function that calls the raw unsub', () => {
    const rawUnsub = vi.fn()
    mockOnSnapshot.mockReturnValue(rawUnsub)
    const { subscribe } = useFirestoreListener()
    const unsubscribe = subscribe({}, vi.fn())
    unsubscribe()
    expect(rawUnsub).toHaveBeenCalledOnce()
  })

  it('returned unsubscribe removes the handle so unsubscribeAll does not double-call it', () => {
    const rawUnsub = vi.fn()
    mockOnSnapshot.mockReturnValue(rawUnsub)
    const { subscribe, unsubscribeAll } = useFirestoreListener()
    const unsubscribe = subscribe({}, vi.fn())
    unsubscribe()
    unsubscribeAll()
    expect(rawUnsub).toHaveBeenCalledOnce()
  })

  it('calling returned unsubscribe twice only calls rawUnsub once', () => {
    const rawUnsub = vi.fn()
    mockOnSnapshot.mockReturnValue(rawUnsub)
    const { subscribe } = useFirestoreListener()
    const unsubscribe = subscribe({}, vi.fn())
    unsubscribe()
    unsubscribe()
    expect(rawUnsub).toHaveBeenCalledOnce()
  })

  it('unsubscribeAll calls all tracked handles', () => {
    const unsub1 = vi.fn()
    const unsub2 = vi.fn()
    mockOnSnapshot.mockReturnValueOnce(unsub1).mockReturnValueOnce(unsub2)
    const { subscribe, unsubscribeAll } = useFirestoreListener()
    subscribe({}, vi.fn())
    subscribe({}, vi.fn())
    unsubscribeAll()
    expect(unsub1).toHaveBeenCalledOnce()
    expect(unsub2).toHaveBeenCalledOnce()
  })

  it('unsubscribeAll is safe when there are no handles', () => {
    const { unsubscribeAll } = useFirestoreListener()
    expect(() => unsubscribeAll()).not.toThrow()
  })

  it('calling unsubscribeAll twice only calls each raw unsub once', () => {
    const rawUnsub = vi.fn()
    mockOnSnapshot.mockReturnValue(rawUnsub)
    const { subscribe, unsubscribeAll } = useFirestoreListener()
    subscribe({}, vi.fn())
    unsubscribeAll()
    unsubscribeAll()
    expect(rawUnsub).toHaveBeenCalledOnce()
  })

  it('each useFirestoreListener() call has an independent set of handles', () => {
    const unsub1 = vi.fn()
    const unsub2 = vi.fn()
    mockOnSnapshot.mockReturnValueOnce(unsub1).mockReturnValueOnce(unsub2)
    const listenerA = useFirestoreListener()
    const listenerB = useFirestoreListener()
    listenerA.subscribe({}, vi.fn())
    listenerB.subscribe({}, vi.fn())
    listenerA.unsubscribeAll()
    expect(unsub1).toHaveBeenCalledOnce()
    expect(unsub2).not.toHaveBeenCalled()
  })
})
