import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

let capturedAuthCallback = null
let lastProviderInstance = null

function makeMockUser(overrides = {}) {
  return {
    uid: 'user-123',
    displayName: 'Test User',
    ...overrides,
  }
}

function mockPeopleApi(ageRange) {
  const body = ageRange ? { ageRanges: [{ ageRange }] } : {}
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    json: () => Promise.resolve(body),
  }))
}

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: vi.fn((auth, callback) => {
    capturedAuthCallback = callback
    return vi.fn()
  }),
  signInWithPopup: vi.fn().mockResolvedValue({ user: makeMockUser() }),
  signOut: vi.fn().mockResolvedValue(undefined),
  GoogleAuthProvider: Object.assign(
    vi.fn(function GoogleAuthProvider() {
      this.addScope = vi.fn()
      lastProviderInstance = this
    }),
    { credentialFromResult: vi.fn(() => ({ accessToken: 'mock-token' })) }
  ),
  getAuth: vi.fn(() => ({})),
}))

vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))

import { useAuthStore } from '@/stores/auth.js'
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    capturedAuthCallback = null
    localStorage.clear()
    vi.clearAllMocks()
    // Re-apply default mock implementations after clearAllMocks
    signInWithPopup.mockResolvedValue({ user: makeMockUser() })
    signOut.mockResolvedValue(undefined)
    onAuthStateChanged.mockImplementation((auth, callback) => {
      capturedAuthCallback = callback
      return vi.fn()
    })
    GoogleAuthProvider.credentialFromResult.mockReturnValue({ accessToken: 'mock-token' })
    mockPeopleApi(null) // adult by default (no ageRanges entry)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('startAuthListener', () => {
    it('registers an onAuthStateChanged listener', () => {
      const store = useAuthStore()
      store.startAuthListener()
      expect(onAuthStateChanged).toHaveBeenCalledOnce()
    })

    it('sets user when callback fires with a user object', () => {
      const store = useAuthStore()
      store.startAuthListener()
      const mockUser = makeMockUser()
      capturedAuthCallback(mockUser)
      expect(store.user).toEqual(mockUser)
    })

    it('sets user to null when callback fires with null', () => {
      const store = useAuthStore()
      store.startAuthListener()
      capturedAuthCallback(makeMockUser())
      capturedAuthCallback(null)
      expect(store.user).toBeNull()
    })
  })

  describe('authReady', () => {
    it('is a Promise', () => {
      const store = useAuthStore()
      expect(store.authReady).toBeInstanceOf(Promise)
    })

    it('resolves after the auth callback fires', async () => {
      const store = useAuthStore()
      store.startAuthListener()

      let resolved = false
      store.authReady.then(() => { resolved = true })

      expect(resolved).toBe(false)
      capturedAuthCallback(null)
      await store.authReady
      expect(resolved).toBe(true)
    })

    it('resolves whether the user is signed in or not', async () => {
      const store = useAuthStore()
      store.startAuthListener()
      capturedAuthCallback(makeMockUser())
      await expect(store.authReady).resolves.toBeUndefined()
    })
  })

  describe('signInWithGoogle', () => {
    it('calls signInWithPopup with a GoogleAuthProvider', async () => {
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(signInWithPopup).toHaveBeenCalledOnce()
      expect(signInWithPopup).toHaveBeenCalledWith({}, expect.any(Object))
    })

    it('requests the user.age.read scope', async () => {
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(lastProviderInstance.addScope).toHaveBeenCalledWith(
        'https://www.googleapis.com/auth/profile.agerange.read'
      )
    })

    it('calls the People API ageRanges endpoint after sign-in', async () => {
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(fetch).toHaveBeenCalledWith(
        'https://people.googleapis.com/v1/people/me?personFields=ageRanges',
        expect.objectContaining({ headers: { Authorization: 'Bearer mock-token' } })
      )
    })
  })

  describe('signOut', () => {
    it('calls Firebase signOut', async () => {
      const store = useAuthStore()
      await store.signOut()
      expect(signOut).toHaveBeenCalledOnce()
    })

    it('sets user to null', async () => {
      const store = useAuthStore()
      store.startAuthListener()
      capturedAuthCallback(makeMockUser())
      await store.signOut()
      expect(store.user).toBeNull()
    })

    it('resets isMinor to false', async () => {
      mockPeopleApi('LESS_THAN_EIGHTEEN')
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(store.isMinor).toBe(true)
      await store.signOut()
      expect(store.isMinor).toBe(false)
    })

    it('removes the localStorage entry for the user', async () => {
      mockPeopleApi('LESS_THAN_EIGHTEEN')
      const store = useAuthStore()
      store.startAuthListener()
      capturedAuthCallback(makeMockUser())
      await store.signInWithGoogle()
      expect(localStorage.getItem('isMinor_user-123')).toBe('true')
      await store.signOut()
      expect(localStorage.getItem('isMinor_user-123')).toBeNull()
    })
  })

  describe('isMinor', () => {
    it('is false by default', () => {
      const store = useAuthStore()
      expect(store.isMinor).toBe(false)
    })

    it('is true when People API returns LESS_THAN_EIGHTEEN', async () => {
      mockPeopleApi('LESS_THAN_EIGHTEEN')
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(store.isMinor).toBe(true)
    })

    it('is false when People API returns a non-minor age range', async () => {
      mockPeopleApi('TWENTY_ONE_OR_OLDER')
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(store.isMinor).toBe(false)
    })

    it('is false when People API returns no ageRanges', async () => {
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(store.isMinor).toBe(false)
    })

    it('is false (fail open) when People API call throws', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(store.isMinor).toBe(false)
    })

    it('persists true to localStorage after sign-in as minor', async () => {
      mockPeopleApi('LESS_THAN_EIGHTEEN')
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(localStorage.getItem('isMinor_user-123')).toBe('true')
    })

    it('persists false to localStorage after sign-in as adult', async () => {
      const store = useAuthStore()
      await store.signInWithGoogle()
      expect(localStorage.getItem('isMinor_user-123')).toBe('false')
    })

    it('restores true from localStorage on page refresh (startAuthListener)', () => {
      localStorage.setItem('isMinor_user-123', 'true')
      const store = useAuthStore()
      store.startAuthListener()
      capturedAuthCallback(makeMockUser())
      expect(store.isMinor).toBe(true)
    })

    it('restores false from localStorage on page refresh', () => {
      localStorage.setItem('isMinor_user-123', 'false')
      const store = useAuthStore()
      store.startAuthListener()
      capturedAuthCallback(makeMockUser())
      expect(store.isMinor).toBe(false)
    })
  })
})
