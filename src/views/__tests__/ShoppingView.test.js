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

vi.mock('@/components/AisleManager.vue', () => ({
  default: { emits: ['close'], template: '<div class="aisle-manager-stub" />' },
}))

vi.mock('@/components/ShoppingAddItem.vue', () => ({
  default: { props: ['modelValue', 'listId'], emits: ['update:modelValue'], template: '<div class="shopping-add-item-stub" />' },
}))

vi.mock('@/components/ShoppingEditItem.vue', () => ({
  default: { props: ['modelValue', 'item', 'listId'], emits: ['update:modelValue'], template: '<div class="shopping-edit-item-stub" />' },
}))

vi.mock('@/components/ShoppingNewList.vue', () => ({
  default: { props: ['modelValue'], emits: ['update:modelValue'], template: '<div class="shopping-new-list-stub" />' },
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
      activeAisles: [
        { name: 'Dairy', order: 1 },
        { name: 'Meat', order: 2 },
        { name: 'Dry goods', order: 3 },
      ],
      activateList: vi.fn((id) => { shoppingStore.activeListId = id }),
      addItem: vi.fn(),
      createList: vi.fn(),
      updateItem: vi.fn(),
      saveAisles: vi.fn(),
      deleteAisle: vi.fn(),
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
      const newListBtns = selector.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-plus'))
      expect(newListBtns.length).toBe(1)
    })

    it('hides the new list + icon button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      const newListBtns = selector.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-plus'))
      expect(newListBtns.length).toBe(0)
    })

    it('clicking the new list button opens ShoppingNewList', async () => {
      const wrapper = mountView()
      // Find the mdi-plus button in the list-selector (not the FAB)
      const selector = wrapper.find('.list-selector')
      const newListBtn = selector.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-plus'))
      await newListBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const newListComp = wrapper.findComponent({ name: 'ShoppingNewList' })
      expect(newListComp.props('modelValue')).toBe(true)
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

  describe('manage aisles button', () => {
    it('shows the manage aisles button to parents', () => {
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      const aisleBtn = selector.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-view-list-outline'))
      expect(aisleBtn).toBeDefined()
    })

    it('hides the manage aisles button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const aisleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-view-list-outline'))
      expect(aisleBtn).toBeUndefined()
    })

    it('clicking the button opens the aisle manager sheet', async () => {
      const wrapper = mountView()
      const aisleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-view-list-outline'))
      await aisleBtn.trigger('click')
      await wrapper.vm.$nextTick()
      // Only one VBottomSheet is directly in ShoppingView (for AisleManager)
      const sheets = wrapper.findAllComponents({ name: 'VBottomSheet' })
      expect(sheets[0].props('modelValue')).toBe(true)
    })
  })

  describe('add item FAB', () => {
    it('is shown to parents', () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      expect(fab).toBeDefined()
    })

    it('is hidden from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      expect(fab).toBeUndefined()
    })

    it('clicking the FAB opens ShoppingAddItem', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
      const addItemComp = wrapper.findComponent({ name: 'ShoppingAddItem' })
      expect(addItemComp.props('modelValue')).toBe(true)
    })
  })

  describe('edit item', () => {
    it('ShoppingList edit event opens ShoppingEditItem with the item', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      const item = { id: 'item-1', name: 'Milk', qty: '2 pints' }
      await list.vm.$emit('edit', item)
      await wrapper.vm.$nextTick()
      const editComp = wrapper.findComponent({ name: 'ShoppingEditItem' })
      expect(editComp.props('modelValue')).toBe(true)
      expect(editComp.props('item')).toEqual(item)
    })
  })
})
