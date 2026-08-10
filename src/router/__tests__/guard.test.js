import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// src/firebase/config.js calls getAuth()/getFirestore() at module scope, which
// throws auth/invalid-api-key when no .env is present — the case in CI, which
// never writes one. Importing the router reaches config.js through whichever
// route component is not stubbed below, so mock the module itself: that keeps
// this file passing when a new route is added without a matching stub, which is
// otherwise invisible locally (every dev machine has a .env) and only red in CI.
vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))

// Stub all view components so Vue Router doesn't need to render them.
vi.mock('@/views/HomeView.vue',     () => ({ default: { template: '<div />' } }))
vi.mock('@/views/ShoppingView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/LoginView.vue',    () => ({ default: { template: '<div />' } }))
vi.mock('@/views/SetupView.vue',      () => ({ default: { template: '<div />' } }))
vi.mock('@/views/PocketMoneyView.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/views/JobsView.vue',        () => ({ default: { template: '<div />' } }))
vi.mock('@/views/WishListView.vue',    () => ({ default: { template: '<div />' } }))

// Mutable store state — tests update these to simulate auth scenarios
const authState = {
  user: null,
  authReady: Promise.resolve(),
}
const familyState = {
  familyId: null,
  resolveFamily: vi.fn(),
}

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => authState,
}))
vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyState,
}))

import router from '@/router/index.js'

describe('router guard', () => {
  beforeEach(async () => {
    setActivePinia(createPinia())
    authState.user = null
    authState.authReady = Promise.resolve()
    familyState.familyId = null
    familyState.resolveFamily = vi.fn()
    // Start from a known location
    await router.push('/login')
  })

  describe('unauthenticated user', () => {
    it('is redirected to /login when navigating to /', async () => {
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('is redirected to /login when navigating to /shopping', async () => {
      await router.push('/shopping')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('can access /login (public route)', async () => {
      await router.push('/login')
      expect(router.currentRoute.value.path).toBe('/login')
    })

    it('can access /setup (public route)', async () => {
      await router.push('/setup')
      expect(router.currentRoute.value.path).toBe('/setup')
    })
  })

  describe('authenticated user with a family', () => {
    beforeEach(() => {
      authState.user = { uid: 'user-123' }
      familyState.familyId = 'fam-456'
    })

    it('can access /', async () => {
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/')
    })

    it('can access /shopping', async () => {
      await router.push('/shopping')
      expect(router.currentRoute.value.path).toBe('/shopping')
    })

    it('does not call resolveFamily when familyId is already set', async () => {
      await router.push('/')
      expect(familyState.resolveFamily).not.toHaveBeenCalled()
    })
  })

  describe('authenticated user with no family', () => {
    beforeEach(() => {
      authState.user = { uid: 'user-123' }
      familyState.familyId = null
      familyState.resolveFamily = vi.fn() // resolveFamily leaves familyId null
    })

    it('is redirected to /setup when navigating to /', async () => {
      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/setup')
    })

    it('is redirected to /setup when navigating to /shopping', async () => {
      await router.push('/shopping')
      expect(router.currentRoute.value.path).toBe('/setup')
    })

    it('can access /setup directly', async () => {
      await router.push('/setup')
      expect(router.currentRoute.value.path).toBe('/setup')
    })

    it('calls resolveFamily to check for an existing family', async () => {
      await router.push('/')
      expect(familyState.resolveFamily).toHaveBeenCalledWith('user-123')
    })
  })

  describe('authenticated user whose family resolves on first navigation', () => {
    it('passes through to / when resolveFamily sets familyId', async () => {
      authState.user = { uid: 'user-123' }
      familyState.familyId = null
      familyState.resolveFamily = vi.fn(() => {
        familyState.familyId = 'fam-789'
      })

      await router.push('/')
      expect(router.currentRoute.value.path).toBe('/')
    })
  })
})
