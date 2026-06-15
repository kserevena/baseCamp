import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    name: 'VueDraggable',
    props: ['modelValue', 'handle', 'animation'],
    emits: ['update:modelValue', 'start', 'end'],
    template: '<div><slot /></div>',
  },
}))

let shoppingStore

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import AisleManager from '@/components/AisleManager.vue'

const vuetify = createVuetify({ components, directives })

function mountManager() {
  return mount(AisleManager, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('AisleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      activeAisles: [
        { name: 'Dairy', order: 1 },
        { name: 'Meat', order: 2 },
        { name: 'Dry goods', order: 3 },
      ],
      saveAisles: vi.fn().mockResolvedValue(undefined),
      deleteAisle: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('rendering', () => {
    it('renders all aisles from store.activeAisles', () => {
      const wrapper = mountManager()
      expect(wrapper.text()).toContain('Dairy')
      expect(wrapper.text()).toContain('Meat')
      expect(wrapper.text()).toContain('Dry goods')
    })

    it('renders a title', () => {
      const wrapper = mountManager()
      expect(wrapper.text()).toContain('Manage aisles')
    })
  })

  describe('add aisle', () => {
    it('appends a new aisle when a valid name is entered and Add is clicked', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input[type="text"], input:not([type])')
      await input.setValue('Frozen')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      expect(wrapper.text()).toContain('Frozen')
    })

    it('shows an error for a blank name', async () => {
      const wrapper = mountManager()
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Enter a name')
    })

    it('shows an error for a duplicate name', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input[type="text"], input:not([type])')
      await input.setValue('Dairy')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Aisle already exists')
    })

    it('clears the input field after successfully adding', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input[type="text"], input:not([type])')
      await input.setValue('Frozen')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(input.element.value).toBe('')
    })
  })

  describe('auto-save', () => {
    it('does not show a Save button', () => {
      const wrapper = mountManager()
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Save')
      expect(saveBtn).toBeUndefined()
    })

    it('does not show a Cancel button', () => {
      const wrapper = mountManager()
      const cancelBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Cancel')
      expect(cancelBtn).toBeUndefined()
    })

    it('emits close when the × button in the title bar is clicked', async () => {
      const wrapper = mountManager()
      const closeBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-close'))
      await closeBtn.trigger('click')
      expect(wrapper.emitted('close')).toBeTruthy()
      expect(shoppingStore.saveAisles).not.toHaveBeenCalled()
    })

    it('calls store.saveAisles immediately when an aisle is added', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input[type="text"], input:not([type])')
      await input.setValue('Frozen')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(shoppingStore.saveAisles).toHaveBeenCalledOnce()
      const [saved] = shoppingStore.saveAisles.mock.calls[0]
      expect(saved).toHaveLength(4)
      expect(saved[3]).toEqual({ name: 'Frozen', order: 40 })
    })

    it('calls store.saveAisles on drag end with normalised orders', async () => {
      const wrapper = mountManager()
      const draggable = wrapper.findComponent({ name: 'VueDraggable' })
      await draggable.vm.$emit('end')
      await wrapper.vm.$nextTick()
      expect(shoppingStore.saveAisles).toHaveBeenCalledOnce()
      const [saved] = shoppingStore.saveAisles.mock.calls[0]
      expect(saved).toHaveLength(3)
      expect(saved[0]).toEqual({ name: 'Dairy', order: 10 })
      expect(saved[1]).toEqual({ name: 'Meat', order: 20 })
      expect(saved[2]).toEqual({ name: 'Dry goods', order: 30 })
    })
  })

  describe('delete aisle', () => {
    it('opens a confirmation dialog when the delete button is clicked', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Delete aisle?')
    })

    it('shows the aisle name in the delete confirmation', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Dairy')
    })

    it('calls store.deleteAisle with the correct name on confirm', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()

      const confirmBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Delete')
      await confirmBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.deleteAisle).toHaveBeenCalledWith('Dairy')
    })

    it('does not call store.deleteAisle when cancel is clicked', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.deleteAisle).not.toHaveBeenCalled()
    })
  })
})
