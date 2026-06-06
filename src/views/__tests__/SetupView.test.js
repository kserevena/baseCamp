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

const mockCreateFamily = vi.fn()
const mockJoinFamily = vi.fn()
vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => ({
    createFamily: mockCreateFamily,
    joinFamily: mockJoinFamily,
  }),
}))

let mockIsMinor = false
vi.mock('@/stores/auth.js', () => ({
  useAuthStore: () => ({ isMinor: mockIsMinor }),
}))

vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))

import SetupView from '@/views/SetupView.vue'

const vuetify = createVuetify({ components, directives })

function mountView({ isMinor = false } = {}) {
  mockIsMinor = isMinor
  setActivePinia(createPinia())
  return mount(SetupView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

// Vuetify v-btn renders as <button> — find by visible text
function findButtonByText(wrapper, text) {
  return wrapper.findAll('button').find(b => b.text().includes(text))
}

describe('SetupView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPush.mockResolvedValue(undefined)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows both Create family and Join family cards for adult accounts', () => {
    const wrapper = mountView({ isMinor: false })
    expect(findButtonByText(wrapper, 'Create family')).toBeDefined()
    expect(findButtonByText(wrapper, 'Join family')).toBeDefined()
  })

  it('does not show a role picker', () => {
    const wrapper = mountView()
    expect(wrapper.text()).not.toContain("I'm a parent")
    expect(wrapper.text()).not.toContain("I'm a child")
  })

  describe('child accounts (isMinor)', () => {
    it('hides the Create family card', () => {
      const wrapper = mountView({ isMinor: true })
      expect(findButtonByText(wrapper, 'Create family')).toBeUndefined()
    })

    it('still shows the Join family card', () => {
      const wrapper = mountView({ isMinor: true })
      expect(findButtonByText(wrapper, 'Join family')).toBeDefined()
    })

    it('shows child-appropriate subtitle', () => {
      const wrapper = mountView({ isMinor: true })
      expect(wrapper.text()).toContain('Ask a parent for an invite code')
    })

    it('shows standard subtitle for adult accounts', () => {
      const wrapper = mountView({ isMinor: false })
      expect(wrapper.text()).toContain('Set up your family to get started')
    })
  })

  describe('Create family section', () => {
    it('Create family button is disabled when name field is empty', () => {
      const wrapper = mountView()
      const btn = findButtonByText(wrapper, 'Create family')
      expect(btn.attributes('disabled')).toBeDefined()
    })

    it('Create family button is enabled when name field has content', async () => {
      const wrapper = mountView()
      const input = wrapper.findAll('input')[0]
      await input.setValue('The Smiths')
      await wrapper.vm.$nextTick()
      expect(findButtonByText(wrapper, 'Create family').attributes('disabled')).toBeUndefined()
    })

    it('calls createFamily with trimmed name on button click', async () => {
      mockCreateFamily.mockResolvedValue(undefined)
      const wrapper = mountView()
      await wrapper.findAll('input')[0].setValue('  The Smiths  ')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Create family').trigger('click')
      expect(mockCreateFamily).toHaveBeenCalledWith('The Smiths')
    })

    it('shows loading state on Create family button during createFamily call', async () => {
      let resolveCreate
      mockCreateFamily.mockReturnValue(new Promise(resolve => { resolveCreate = resolve }))
      const wrapper = mountView()
      await wrapper.findAll('input')[0].setValue('The Smiths')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Create family').trigger('click')
      await wrapper.vm.$nextTick()
      expect(findButtonByText(wrapper, 'Create family').classes()).toContain('v-btn--loading')
      resolveCreate()
    })

    it('navigates to / after createFamily succeeds', async () => {
      mockCreateFamily.mockResolvedValue(undefined)
      const wrapper = mountView()
      await wrapper.findAll('input')[0].setValue('The Smiths')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Create family').trigger('click')
      await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'))
    })

    it('shows error message when createFamily throws', async () => {
      mockCreateFamily.mockRejectedValue(new Error('Firestore error'))
      const wrapper = mountView()
      await wrapper.findAll('input')[0].setValue('The Smiths')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Create family').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Could not create family'))
    })

    it('does not navigate when createFamily throws', async () => {
      mockCreateFamily.mockRejectedValue(new Error('Firestore error'))
      const wrapper = mountView()
      await wrapper.findAll('input')[0].setValue('The Smiths')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Create family').trigger('click')
      await vi.waitFor(() => expect(mockCreateFamily).toHaveBeenCalled())
      expect(mockPush).not.toHaveBeenCalled()
    })
  })

  describe('Join family section', () => {
    it('Join family button is disabled when invite code is fewer than 8 chars', async () => {
      const wrapper = mountView()
      const input = wrapper.findAll('input')[1]
      await input.setValue('ABC')
      await wrapper.vm.$nextTick()
      expect(findButtonByText(wrapper, 'Join family').attributes('disabled')).toBeDefined()
    })

    it('Join family button is enabled when invite code is exactly 8 chars', async () => {
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('ABCD2345')
      await wrapper.vm.$nextTick()
      expect(findButtonByText(wrapper, 'Join family').attributes('disabled')).toBeUndefined()
    })

    it('calls joinFamily with uppercased code on button click', async () => {
      mockJoinFamily.mockResolvedValue(true)
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('abcd2345')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Join family').trigger('click')
      expect(mockJoinFamily).toHaveBeenCalledWith('ABCD2345')
    })

    it('shows loading state on Join family button during joinFamily call', async () => {
      let resolveJoin
      mockJoinFamily.mockReturnValue(new Promise(resolve => { resolveJoin = resolve }))
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('ABCD2345')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Join family').trigger('click')
      await wrapper.vm.$nextTick()
      expect(findButtonByText(wrapper, 'Join family').classes()).toContain('v-btn--loading')
      resolveJoin(true)
    })

    it('navigates to / after joinFamily returns true', async () => {
      mockJoinFamily.mockResolvedValue(true)
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('ABCD2345')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Join family').trigger('click')
      await vi.waitFor(() => expect(mockPush).toHaveBeenCalledWith('/'))
    })

    it('shows error when joinFamily returns false (code not found)', async () => {
      mockJoinFamily.mockResolvedValue(false)
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('XXXXXXXX')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Join family').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('No family found with that code'))
    })

    it('shows error when joinFamily throws', async () => {
      mockJoinFamily.mockRejectedValue(new Error('network error'))
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('ABCD2345')
      await wrapper.vm.$nextTick()
      await findButtonByText(wrapper, 'Join family').trigger('click')
      await vi.waitFor(() => expect(wrapper.text()).toContain('Could not join family'))
    })

    it('shows client-side validation error for code shorter than 8 chars', async () => {
      const wrapper = mountView()
      await wrapper.findAll('input')[1].setValue('ABC')
      await wrapper.vm.$nextTick()
      await wrapper.vm.joinFamily()
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('8-character')
      expect(mockJoinFamily).not.toHaveBeenCalled()
    })
  })
})
