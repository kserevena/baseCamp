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

const SUPERMARKET = {
  id: 'sm-1',
  name: 'Tesco',
  aisles: [
    { name: 'Dairy', order: 1 },
    { name: 'Meat', order: 2 },
    { name: 'Dry goods', order: 3 },
  ],
}

function mountManager(supermarket = SUPERMARKET) {
  return mount(AisleManager, {
    props: { supermarket },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('AisleManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      saveSupermarketAisles: vi.fn().mockResolvedValue(undefined),
      deleteSupermarketAisle: vi.fn().mockResolvedValue(undefined),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('rendering', () => {
    it('renders all aisles from the supermarket prop', () => {
      const wrapper = mountManager()
      expect(wrapper.text()).toContain('Dairy')
      expect(wrapper.text()).toContain('Meat')
      expect(wrapper.text()).toContain('Dry goods')
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

    it('calls store.saveSupermarketAisles with the supermarket id when an aisle is added', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input[type="text"], input:not([type])')
      await input.setValue('Frozen')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(shoppingStore.saveSupermarketAisles).toHaveBeenCalledOnce()
      const [id, saved] = shoppingStore.saveSupermarketAisles.mock.calls[0]
      expect(id).toBe('sm-1')
      expect(saved).toHaveLength(4)
      expect(saved[3]).toEqual({ name: 'Frozen', order: 40 })
    })

    it('calls store.saveSupermarketAisles on drag end with normalised orders', async () => {
      const wrapper = mountManager()
      const draggable = wrapper.findComponent({ name: 'VueDraggable' })
      await draggable.vm.$emit('end')
      await wrapper.vm.$nextTick()
      expect(shoppingStore.saveSupermarketAisles).toHaveBeenCalledOnce()
      const [id, saved] = shoppingStore.saveSupermarketAisles.mock.calls[0]
      expect(id).toBe('sm-1')
      expect(saved).toEqual([
        { name: 'Dairy', order: 10 },
        { name: 'Meat', order: 20 },
        { name: 'Dry goods', order: 30 },
      ])
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

    it('shows the aisle name and store name in the delete confirmation', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Dairy')
      expect(document.body.textContent).toContain('Tesco')
    })

    it('calls store.deleteSupermarketAisle with the store id and aisle name on confirm', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()

      const confirmBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Delete')
      await confirmBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.deleteSupermarketAisle).toHaveBeenCalledWith('sm-1', 'Dairy')
    })

    it('does not call store.deleteSupermarketAisle when cancel is clicked', async () => {
      const wrapper = mountManager()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      await deleteBtns[0].trigger('click')
      await wrapper.vm.$nextTick()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.deleteSupermarketAisle).not.toHaveBeenCalled()
    })
  })
})
