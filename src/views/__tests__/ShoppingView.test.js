import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let shoppingStore
let familyStore

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/components/ShoppingList.vue', () => ({
  default: { emits: ['edit'], template: '<div class="shopping-list-stub" />' },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import ShoppingView from '@/views/ShoppingView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(ShoppingView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

function listChips(wrapper) {
  // All VChip components inside the list-chips scroll container
  return wrapper.findAllComponents({ name: 'VChip' })
    .filter(c => ['Weekly shop', 'Party supplies'].some(n => c.text().includes(n)))
}

describe('ShoppingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      lists: [
        { id: 'list-1', name: 'Weekly shop' },
        { id: 'list-2', name: 'Party supplies' },
      ],
      items: [],
      activeListId: 'list-1',
      activateList: vi.fn((id) => { shoppingStore.activeListId = id }),
      addItem: vi.fn(),
      createList: vi.fn(),
      updateItem: vi.fn(),
    })
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', role: 'parent' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('list selector', () => {
    it('renders all list names as chips', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Weekly shop')
      expect(wrapper.text()).toContain('Party supplies')
    })

    it('active chip has primary colour', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const active = chips.find(c => c.text().includes('Weekly shop'))
      expect(active.props('color')).toBe('primary')
    })

    it('active chip uses flat variant', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const active = chips.find(c => c.text().includes('Weekly shop'))
      expect(active.props('variant')).toBe('flat')
    })

    it('active chip shows a checkmark icon', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const active = chips.find(c => c.text().includes('Weekly shop'))
      expect(active.props('prependIcon')).toBe('mdi-check')
    })

    it('inactive chip does not have primary colour', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const inactive = chips.find(c => c.text().includes('Party supplies'))
      expect(inactive.props('color')).toBeUndefined()
    })

    it('inactive chip uses tonal variant', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const inactive = chips.find(c => c.text().includes('Party supplies'))
      expect(inactive.props('variant')).toBe('tonal')
    })

    it('inactive chip has no checkmark icon', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const inactive = chips.find(c => c.text().includes('Party supplies'))
      expect(inactive.props('prependIcon')).toBeUndefined()
    })

    it('clicking a chip calls activateList with that list id', async () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const second = chips.find(c => c.text().includes('Party supplies'))
      await second.trigger('click')
      expect(shoppingStore.activateList).toHaveBeenCalledWith('list-2')
    })

    it('newly selected chip gains primary colour and checkmark', async () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const second = chips.find(c => c.text().includes('Party supplies'))
      await second.trigger('click')
      await wrapper.vm.$nextTick()

      const updated = listChips(wrapper)
      const nowActive = updated.find(c => c.text().includes('Party supplies'))
      expect(nowActive.props('color')).toBe('primary')
      expect(nowActive.props('prependIcon')).toBe('mdi-check')
    })

    it('previously selected chip loses primary colour and checkmark', async () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const second = chips.find(c => c.text().includes('Party supplies'))
      await second.trigger('click')
      await wrapper.vm.$nextTick()

      const updated = listChips(wrapper)
      const nowInactive = updated.find(c => c.text().includes('Weekly shop'))
      expect(nowInactive.props('color')).toBeUndefined()
      expect(nowInactive.props('prependIcon')).toBeUndefined()
    })
  })

  describe('empty state', () => {
    beforeEach(() => {
      shoppingStore.lists = []
      shoppingStore.activeListId = null
    })

    it('shows empty state message when there are no lists', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('No shopping list yet')
    })

    it('shows New list button to parents in the empty state', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('New list')
    })

    it('hides New list button from children in the empty state', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('New list')
    })
  })

  describe('new list', () => {
    it('shows the new list + icon button for parents when lists exist', () => {
      const wrapper = mountView()
      // The new-list btn lives inside .list-selector, not the add-item FAB
      const selector = wrapper.find('.list-selector')
      expect(selector.findComponent({ name: 'VBtn' }).exists()).toBe(true)
    })

    it('hides the new list + icon button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      expect(selector.findComponent({ name: 'VBtn' }).exists()).toBe(false)
    })
  })

  describe('delete list', () => {
    beforeEach(() => {
      shoppingStore.deleteList = vi.fn()
    })

    it('shows the delete button to parents', () => {
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      const deleteBtns = selector.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      expect(deleteBtns.length).toBe(1)
    })

    it('hides the delete button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      expect(deleteBtns.length).toBe(0)
    })

    it('opens the confirmation dialog when the delete button is clicked', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Delete list?')
    })

    it('shows the active list name in the confirmation dialog', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Weekly shop')
    })

    it('does not call deleteList when Cancel is clicked', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.deleteList).not.toHaveBeenCalled()
    })

    it('calls deleteList when Delete is confirmed', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()

      const confirmBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Delete')
      await confirmBtn.click()

      expect(shoppingStore.deleteList).toHaveBeenCalledOnce()
    })
  })

  describe('edit item sheet', () => {
    it('does not show the edit sheet initially', () => {
      mountView()
      expect(document.body.textContent).not.toContain('Edit item')
    })

    it('opens the edit sheet when ShoppingList emits edit', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Edit item')
    })

    it('pre-populates name and qty fields from the emitted item', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const inputs = [...document.body.querySelectorAll('input')]
      expect(inputs.some(i => i.value === 'Milk')).toBe(true)
      expect(inputs.some(i => i.value === '2 pints')).toBe(true)
    })

    it('calls store.updateItem with trimmed name and qty on Save', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const saveBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()

      expect(shoppingStore.updateItem).toHaveBeenCalledWith('item-1', {
        name: 'Milk',
        qty: '2 pints',
      })
    })

    it('closes the edit sheet after Save', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const saveBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()
      await wrapper.vm.$nextTick()

      // Sheet order in template: 0=add-item, 1=edit-item, 2=new-list
      // Vuetify unmounts slot content when closed, so find by index and check modelValue
      const sheets = wrapper.findAllComponents({ name: 'VBottomSheet' })
      expect(sheets[1].props('modelValue')).toBe(false)
    })

    it('does not call updateItem when name is blank', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: '  ', qty: '' })
      await wrapper.vm.$nextTick()

      const saveBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()

      expect(shoppingStore.updateItem).not.toHaveBeenCalled()
    })

    it('closes the edit sheet on Cancel without calling updateItem', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.updateItem).not.toHaveBeenCalled()
      // Sheet order in template: 0=add-item, 1=edit-item, 2=new-list
      const sheets = wrapper.findAllComponents({ name: 'VBottomSheet' })
      expect(sheets[1].props('modelValue')).toBe(false)
    })
  })
})
