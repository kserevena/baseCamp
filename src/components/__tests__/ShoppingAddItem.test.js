import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let shoppingStore

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/constants/shopping.js', () => ({ ITEM_NAME_MAX_LENGTH: 80 }))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import ShoppingAddItem from '@/components/ShoppingAddItem.vue'

const vuetify = createVuetify({ components, directives })

function mountComp(props = {}) {
  return mount(ShoppingAddItem, {
    props: { modelValue: true, listId: 'list-1', ...props },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('ShoppingAddItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      items: [],
      activeAisles: [
        { name: 'Dairy', order: 1 },
        { name: 'Meat', order: 2 },
        { name: 'Dry goods', order: 3 },
      ],
      addItem: vi.fn(),
      restoreItem: vi.fn(() => false),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the add item heading', () => {
    mountComp()
    expect(document.body.textContent).toContain('Add item')
  })

  it('renders aisle chips from the store', () => {
    mountComp()
    expect(document.body.textContent).toContain('Dairy')
    expect(document.body.textContent).toContain('Meat')
    expect(document.body.textContent).toContain('Dry goods')
  })

  it('sets itemAisle to the first aisle when opened', async () => {
    const wrapper = mountComp({ modelValue: false })
    await wrapper.setProps({ modelValue: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.itemAisle).toBe('Dairy')
  })

  it('calls store.addItem with name, qty, and selected aisle on submit', async () => {
    const wrapper = mountComp()
    wrapper.vm.itemName = 'Eggs'
    wrapper.vm.itemQty = '12'
    wrapper.vm.itemAisle = 'Dairy'
    const addBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Add')
    await addBtn.click()
    expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '12', 'Dairy')
  })

  it('does not call addItem when name is blank', async () => {
    const wrapper = mountComp()
    wrapper.vm.itemName = '  '
    const addBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Add')
    await addBtn.click()
    expect(shoppingStore.addItem).not.toHaveBeenCalled()
  })

  it('emits update:modelValue false on Cancel', async () => {
    const wrapper = mountComp()
    const cancelBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Cancel')
    await cancelBtn.click()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('emits update:modelValue false after successful add', async () => {
    const wrapper = mountComp()
    wrapper.vm.itemName = 'Milk'
    const addBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Add')
    await addBtn.click()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  describe('keyboard-aware sheet positioning (issue #49)', () => {
    let mockVp

    beforeEach(() => {
      mockVp = {
        height: 851,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      Object.defineProperty(window, 'visualViewport', {
        value: mockVp, writable: true, configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: 851, writable: true, configurable: true,
      })
    })

    afterEach(() => {
      document.documentElement.style.removeProperty('--add-item-sheet-bottom')
    })

    it('registers a visualViewport resize listener when opened', async () => {
      const wrapper = mountComp({ modelValue: false })
      await wrapper.setProps({ modelValue: true })
      expect(mockVp.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('sets --add-item-sheet-bottom to 0px immediately on open when no keyboard', async () => {
      const wrapper = mountComp({ modelValue: false })
      await wrapper.setProps({ modelValue: true })
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
    })

    it('updates --add-item-sheet-bottom to keyboard height when viewport shrinks', async () => {
      const wrapper = mountComp({ modelValue: false })
      await wrapper.setProps({ modelValue: true })

      mockVp.height = 511
      const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
      resizeCb()

      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('340px')
    })

    it('does not throw when window.visualViewport is unavailable', async () => {
      Object.defineProperty(window, 'visualViewport', {
        value: null, writable: true, configurable: true,
      })
      const wrapper = mountComp({ modelValue: false })
      await expect(wrapper.setProps({ modelValue: true })).resolves.not.toThrow()
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
    })
  })
})
