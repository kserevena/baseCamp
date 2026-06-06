import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { createPinia, setActivePinia } from 'pinia'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const mockSignInWithGoogle = vi.fn()
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ signInWithGoogle: mockSignInWithGoogle }),
}))

vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))

import LoginView from '@/views/LoginView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  setActivePinia(createPinia())
  return mount(LoginView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('LoginView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the BaseCamp title', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('BaseCamp')
  })

  it('renders the Sign in with Google button', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain('Sign in with Google')
  })

  it('clicking the button calls signInWithGoogle', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined)
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    expect(mockSignInWithGoogle).toHaveBeenCalledOnce()
  })

  it('navigates to / after successful sign-in', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined)
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'))
  })

  it('button is in loading state while sign-in is in-flight', async () => {
    let resolveSignIn
    mockSignInWithGoogle.mockReturnValue(new Promise(resolve => { resolveSignIn = resolve }))
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()
    // Vuetify adds v-btn--loading class when :loading is true
    expect(wrapper.find('button').classes()).toContain('v-btn--loading')
    resolveSignIn()
  })

  it('button is not loading after sign-in completes', async () => {
    mockSignInWithGoogle.mockResolvedValue(undefined)
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('button').classes()).not.toContain('v-btn--loading')
    })
  })

  it('shows error snackbar when sign-in throws a generic error', async () => {
    const err = new Error('network error')
    mockSignInWithGoogle.mockRejectedValue(err)
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => {
      // v-snackbar teleports to document.body
      expect(document.body.textContent).toContain('Sign-in failed. Please try again.')
    })
  })

  it('does not show error when popup is closed by user', async () => {
    const err = Object.assign(new Error(), { code: 'auth/popup-closed-by-user' })
    mockSignInWithGoogle.mockRejectedValue(err)
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Sign-in failed')
  })

  it('does not show error when popup request is cancelled', async () => {
    const err = Object.assign(new Error(), { code: 'auth/cancelled-popup-request' })
    mockSignInWithGoogle.mockRejectedValue(err)
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).not.toContain('Sign-in failed')
  })

  it('does not navigate when sign-in throws', async () => {
    mockSignInWithGoogle.mockRejectedValue(new Error('fail'))
    const wrapper = mountView()
    await wrapper.find('button').trigger('click')
    await vi.waitFor(() => expect(mockSignInWithGoogle).toHaveBeenCalled())
    expect(mockPush).not.toHaveBeenCalled()
  })
})
