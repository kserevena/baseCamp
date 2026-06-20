import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createPinia, setActivePinia } from 'pinia'
import { reactive } from 'vue'

// ── shared store state ────────────────────────────────────────────────────────

let familyStore, shoppingStore, pocketMoneyStore, authStore, jobsStore
const mockRouterPush = vi.fn()

// Use a getter so the live ES module binding in App.vue re-reads isDev on each render.
const envState = { isDev: false }
vi.mock('@/utils/env.js', () => ({
  get isDev() { return envState.isDev },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', meta: {} }),
  useRouter: () => ({ push: mockRouterPush }),
}))

vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => authStore,
}))
vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))
vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))
vi.mock('@/stores/pocketMoney.js', () => ({
  usePocketMoneyStore: () => pocketMoneyStore,
}))
vi.mock('@/stores/jobs.js', () => ({
  useJobsStore: () => jobsStore,
}))
vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))
vi.mock('@/composables/useServiceWorkerUpdate.js', () => ({
  useServiceWorkerUpdate: vi.fn(),
}))
vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: { props: ['uid', 'size'], template: '<span />' },
}))

import App from '@/App.vue'

const vuetify = createVuetify({ components, directives })

function mountApp() {
  setActivePinia(createPinia())
  return mount(App, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

function resetStores() {
  familyStore = reactive({
    familyId: null,
    currentUser: null,
    members: [],
    teardown: vi.fn(),
  })
  shoppingStore = reactive({ setup: vi.fn(), teardown: vi.fn() })
  pocketMoneyStore = reactive({ setup: vi.fn(), teardown: vi.fn() })
  jobsStore     = reactive({ setup: vi.fn(), teardown: vi.fn() })
  authStore = reactive({ user: null, signOut: vi.fn().mockResolvedValue(undefined) })
}

// ── DEV badge ─────────────────────────────────────────────────────────────────

describe('App — DEV badge', () => {
  beforeEach(resetStores)

  afterEach(() => {
    document.body.innerHTML = ''
    envState.isDev = false
  })

  it('shows a DEV chip when isDev is true', async () => {
    envState.isDev = true
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('DEV')
  })

  it('hides the DEV chip when isDev is false', async () => {
    envState.isDev = false
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('DEV')
  })
})

// ── store lifecycle ────────────────────────────────────────────────────────────

describe('App — store lifecycle', () => {
  beforeEach(resetStores)

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('calls shopping.setup and jobs.setup when familyId becomes non-null', async () => {
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(shoppingStore.setup).not.toHaveBeenCalled()
    expect(jobsStore.setup).not.toHaveBeenCalled()

    familyStore.familyId = 'fam-1'
    await wrapper.vm.$nextTick()
    expect(shoppingStore.setup).toHaveBeenCalledWith('fam-1')
    expect(jobsStore.setup).toHaveBeenCalledWith('fam-1')
  })

  it('calls shopping.teardown and jobs.teardown when familyId clears', async () => {
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()

    familyStore.familyId = 'fam-1'
    await wrapper.vm.$nextTick()
    expect(shoppingStore.setup).toHaveBeenCalledWith('fam-1')

    familyStore.familyId = null
    await wrapper.vm.$nextTick()
    expect(shoppingStore.teardown).toHaveBeenCalled()
    expect(jobsStore.teardown).toHaveBeenCalled()
  })

  it('calls pocketMoney.setup when currentUser and familyId are both available', async () => {
    familyStore.familyId = 'fam-1'
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(pocketMoneyStore.setup).not.toHaveBeenCalled()

    const user = { uid: 'parent-uid', role: 'parent' }
    familyStore.currentUser = user
    await wrapper.vm.$nextTick()
    expect(pocketMoneyStore.setup).toHaveBeenCalledWith('fam-1', user)
  })

  it('calls pocketMoney.teardown when currentUser clears', async () => {
    familyStore.familyId = 'fam-1'
    const user = { uid: 'parent-uid', role: 'parent' }
    familyStore.currentUser = user
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(pocketMoneyStore.setup).toHaveBeenCalledWith('fam-1', user)

    familyStore.currentUser = null
    await wrapper.vm.$nextTick()
    expect(pocketMoneyStore.teardown).toHaveBeenCalled()
  })

  it('does not call pocketMoney.setup when currentUser is set but familyId is null', async () => {
    const user = { uid: 'parent-uid', role: 'parent' }
    familyStore.currentUser = user
    familyStore.familyId = null
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(pocketMoneyStore.setup).not.toHaveBeenCalled()
  })
})

// ── navigation bar ─────────────────────────────────────────────────────────────

describe('App — navigation bar', () => {
  beforeEach(resetStores)

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the four nav items: Home, Shopping, Money, Jobs', () => {
    const wrapper = mountApp()
    expect(wrapper.text()).toContain('Home')
    expect(wrapper.text()).toContain('Shopping')
    expect(wrapper.text()).toContain('Money')
    expect(wrapper.text()).toContain('Jobs')
    expect(wrapper.text()).not.toContain('Meals')
  })

  it('renders the BaseCamp title in the app bar', () => {
    const wrapper = mountApp()
    expect(wrapper.text()).toContain('BaseCamp')
  })
})

// ── user avatar button ────────────────────────────────────────────────────────

describe('App — user avatar button', () => {
  beforeEach(resetStores)

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows a FamilyAvatar when currentUser is set', async () => {
    familyStore.currentUser = { uid: 'parent-uid', name: 'Alice', role: 'parent' }
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    // The avatar stub renders a <span /> (from our mock)
    expect(wrapper.find('.v-app-bar span').exists()).toBe(true)
  })

  it('shows a generic account icon when currentUser is null', async () => {
    familyStore.currentUser = null
    const wrapper = mountApp()
    await wrapper.vm.$nextTick()
    expect(wrapper.html()).toContain('mdi-account-circle')
  })
})
