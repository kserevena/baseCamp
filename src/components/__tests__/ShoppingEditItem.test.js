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

import ShoppingEditItem from '@/components/ShoppingEditItem.vue'

const vuetify = createVuetify({ components, directives })

const testItem = { id: 'item-1', name: 'Milk', qty: '2 pints', aisle: 'Dairy' }

function mountComp(props = {}) {
  return mount(ShoppingEditItem, {
    props: { modelValue: false, item: testItem, ...props },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

async function openSheet(wrapper) {
  await wrapper.setProps({ modelValue: true })
  await wrapper.vm.$nextTick()
}

describe('ShoppingEditItem', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      lists: [
        { id: 'list-1', name: 'Weekly shop' },
        { id: 'list-2', name: 'Party supplies' },
      ],
      activeListId: 'list-1',
      activeAisles: [
        { name: 'Dairy', order: 1 },
        { name: 'Meat', order: 2 },
      ],
      updateItem: vi.fn(),
      moveOrCopyItem: vi.fn(),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the edit item heading when open', async () => {
    const wrapper = mountComp()
    await openSheet(wrapper)
    expect(document.body.textContent).toContain('Edit item')
  })

  it('pre-populates name and qty from the item prop when sheet opens', async () => {
    const wrapper = mountComp()
    await openSheet(wrapper)
    expect(wrapper.vm.itemName).toBe('Milk')
    expect(wrapper.vm.itemQty).toBe('2 pints')
  })

  it('calls store.updateItem with trimmed name, qty, and aisle on Save', async () => {
    const wrapper = mountComp()
    await openSheet(wrapper)
    const saveBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Save')
    await saveBtn.click()
    expect(shoppingStore.updateItem).toHaveBeenCalledWith('item-1', {
      name: 'Milk',
      qty: '2 pints',
      aisle: 'Dairy',
    })
  })

  it('does not call updateItem when name is blank', async () => {
    const wrapper = mountComp({ item: { id: 'item-1', name: '  ', qty: '', aisle: '' } })
    await openSheet(wrapper)
    const saveBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Save')
    await saveBtn.click()
    expect(shoppingStore.updateItem).not.toHaveBeenCalled()
  })

  it('emits update:modelValue false after Save', async () => {
    const wrapper = mountComp()
    await openSheet(wrapper)
    const saveBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Save')
    await saveBtn.click()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('emits update:modelValue false on Cancel without calling updateItem', async () => {
    const wrapper = mountComp()
    await openSheet(wrapper)
    const cancelBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Cancel')
    await cancelBtn.click()
    expect(shoppingStore.updateItem).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('updates form fields when the sheet is reopened with a different item', async () => {
    const wrapper = mountComp()
    await openSheet(wrapper)
    await wrapper.setProps({ modelValue: false })
    await wrapper.setProps({ item: { id: 'item-2', name: 'Bread', qty: '1 loaf', aisle: 'Bakery' } })
    await wrapper.setProps({ modelValue: true })
    await wrapper.vm.$nextTick()
    expect(wrapper.vm.itemName).toBe('Bread')
    expect(wrapper.vm.itemQty).toBe('1 loaf')
  })
})
