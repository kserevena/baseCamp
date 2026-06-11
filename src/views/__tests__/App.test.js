import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createPinia, setActivePinia } from 'pinia'

// Use a getter so the live ES module binding in App.vue re-reads isDev on each render.
const envState = { isDev: false }
vi.mock('@/utils/env.js', () => ({
  get isDev() { return envState.isDev },
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/', meta: {} }),
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ user: null }),
}))
vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => ({ familyId: null, currentUser: null, teardown: vi.fn() }),
}))
vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => ({ setup: vi.fn(), teardown: vi.fn() }),
}))
vi.mock('@/stores/meals.js', () => ({
  useMealsStore: () => ({ setup: vi.fn(), teardown: vi.fn() }),
}))
vi.mock('@/stores/pocketMoney.js', () => ({
  usePocketMoneyStore: () => ({ setup: vi.fn(), teardown: vi.fn() }),
}))
vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))
vi.mock('@/composables/useServiceWorkerUpdate.js', () => ({
  useServiceWorkerUpdate: vi.fn(),
}))
vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: { template: '<span />' },
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

describe('App — DEV badge', () => {
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
