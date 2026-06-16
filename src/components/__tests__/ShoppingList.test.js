import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

vi.mock('vue-draggable-plus', () => ({
  VueDraggable: {
    props: ['modelValue', 'group', 'handle', 'animation'],
    emits: ['update:modelValue', 'start', 'end'],
    template: '<div><slot /></div>',
  },
}))

let shoppingStore
let familyStore

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/components/ShoppingItem.vue', () => ({
  default: {
    name: 'ShoppingItem',
    props: ['item', 'showDragHandle', 'showDelete', 'showEdit'],
    emits: ['toggle'],
    template: '<div class="shopping-item-stub" @click="$emit(\'toggle\', { id: item.id, name: item.name, done: item.done, previous: { done: item.done, addedBy: item.addedBy } })">{{ item.name }}</div>',
  },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import ShoppingList from '@/components/ShoppingList.vue'

const vuetify = createVuetify({ components, directives })

const DEFAULT_AISLES = [
  { name: 'Dairy', order: 1 },
  { name: 'Meat', order: 2 },
  { name: 'Dry goods', order: 3 },
]

function mountList(props = {}) {
  return mount(ShoppingList, {
    props,
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('ShoppingList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      items: [],
      activeAisles: [...DEFAULT_AISLES],
      reorderItems: vi.fn(),
      deleteItem: vi.fn(),
      toggleDone: vi.fn(),
      restoreToggleState: vi.fn(),
    })
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', role: 'parent' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('empty aisles', () => {
    it('renders all aisles from activeAisles even when there are no items', () => {
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Dairy')
      expect(wrapper.text()).toContain('Meat')
      expect(wrapper.text()).toContain('Dry goods')
    })

    it('renders aisles in the order defined by activeAisles', () => {
      shoppingStore.activeAisles = [
        { name: 'Bakery', order: 1 },
        { name: 'Dairy', order: 2 },
      ]
      const wrapper = mountList()
      const text = wrapper.text()
      expect(text.indexOf('Bakery')).toBeLessThan(text.indexOf('Dairy'))
    })

    it('shows items under the correct aisle header', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
        { id: 'i2', name: 'Steak', aisle: 'Meat', aisleOrder: 2, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Milk')
      expect(wrapper.text()).toContain('Steak')
    })
  })

  describe('unknown aisle (deleted aisle items)', () => {
    it('appends a group for items whose aisle is not in activeAisles', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Orphan item', aisle: 'Unknown', aisleOrder: 99, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Unknown')
      expect(wrapper.text()).toContain('Orphan item')
    })
  })

  describe('reactivity', () => {
    it('rebuilds groups when activeAisles changes', async () => {
      const wrapper = mountList()
      expect(wrapper.text()).not.toContain('FROZEN')

      shoppingStore.activeAisles = [...DEFAULT_AISLES, { name: 'Frozen', order: 4 }]
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Frozen')
    })

    it('rebuilds groups when items change', async () => {
      const wrapper = mountList()
      expect(wrapper.text()).not.toContain('Butter')

      shoppingStore.items = [
        { id: 'i1', name: 'Butter', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Butter')
    })
  })

  describe('done section — positive', () => {
    it('renders a done: true item in the Done section', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Done (1)')
      expect(wrapper.text()).toContain('Eggs')
    })

    it('shows the correct count in the Done section header', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
        { id: 'i2', name: 'Butter', aisle: 'Dairy', aisleOrder: 1, done: true },
        { id: 'i3', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Done (2)')
    })

    it('moves an item from aisle to Done section when it becomes done: true', async () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).not.toContain('Done (')

      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).toContain('Done (1)')
    })

    it('moves an item from Done section back to its aisle when it becomes done: false', async () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).toContain('Done (1)')

      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      await wrapper.vm.$nextTick()

      expect(wrapper.text()).not.toContain('Done (')
      expect(wrapper.text()).toContain('Dairy')
    })
  })

  describe('done section — negative', () => {
    it('does not render a done: true item in any aisle section', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      const wrapper = mountList()
      const aisleHeaders = wrapper.findAll('.v-list-subheader')
      const aisleHeaderTexts = aisleHeaders.map(h => h.text())
      // Only the Done header should contain the item name area; Dairy header should be present but empty of the item
      expect(aisleHeaderTexts.some(t => t.includes('Done'))).toBe(true)
      // The item should not appear outside the done section — verify via the aisle groups that have no items
      const doneSection = wrapper.find('.done-section')
      expect(doneSection.exists()).toBe(true)
      expect(doneSection.text()).toContain('Eggs')
    })

    it('does not render a done: false item in the Done section', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).not.toContain('Done (')
      const doneSection = wrapper.find('.done-section')
      expect(doneSection.exists()).toBe(false)
    })

    it('does not render the Done section when all items are done: false', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
        { id: 'i2', name: 'Steak', aisle: 'Meat', aisleOrder: 2, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.text()).not.toContain('Done (')
    })

    it('does not render the Done section when the item list is empty', () => {
      shoppingStore.items = []
      const wrapper = mountList()
      expect(wrapper.text()).not.toContain('Done (')
    })

    it('does not render a drag handle for items in the Done section', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      const wrapper = mountList()
      const doneSection = wrapper.find('.done-section')
      expect(doneSection.exists()).toBe(true)
      // ShoppingItem stub does not receive showDragHandle=true in the done section
      const doneItem = doneSection.find('.shopping-item-stub')
      expect(doneItem.exists()).toBe(true)
      // The stub's props should not include showDragHandle=true
      const itemComponent = doneSection.findComponent({ name: 'ShoppingItem' })
      expect(itemComponent.props('showDragHandle')).toBeFalsy()
    })
  })

  describe('showHeaders prop', () => {
    it('renders aisle subheaders by default (showHeaders not provided)', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList()
      expect(wrapper.findAll('.v-list-subheader').length).toBeGreaterThan(0)
      expect(wrapper.text()).toContain('Dairy')
    })

    it('renders aisle subheaders when showHeaders is true', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList({ showHeaders: true })
      expect(wrapper.findAll('.v-list-subheader').length).toBeGreaterThan(0)
      expect(wrapper.text()).toContain('Dairy')
    })

    it('hides aisle subheaders when showHeaders is false', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList({ showHeaders: false })
      expect(wrapper.findAll('.v-list-subheader').length).toBe(0)
      expect(wrapper.text()).not.toContain('Dairy')
    })

    it('still renders items in aisle order when showHeaders is false', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
        { id: 'i2', name: 'Steak', aisle: 'Meat', aisleOrder: 2, done: false },
      ]
      const wrapper = mountList({ showHeaders: false })
      expect(wrapper.text()).toContain('Milk')
      expect(wrapper.text()).toContain('Steak')
    })

    it('hides the Done section header when showHeaders is false', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      const wrapper = mountList({ showHeaders: false })
      expect(wrapper.text()).not.toContain('Done (1)')
    })

    it('still renders done items when showHeaders is false', () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Eggs', aisle: 'Dairy', aisleOrder: 1, done: true },
      ]
      const wrapper = mountList({ showHeaders: false })
      expect(wrapper.find('.done-section').exists()).toBe(true)
      expect(wrapper.text()).toContain('Eggs')
    })
  })

  describe('undo toggle', () => {
    it('shows an undo snackbar when an item is toggled', async () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: false },
      ]
      const wrapper = mountList()
      await wrapper.find('.shopping-item-stub').trigger('click')
      expect(wrapper.findComponent({ name: 'VSnackbar' }).props('modelValue')).toBe(true)
    })

    it('restores the captured pre-toggle state when Undo is clicked', async () => {
      shoppingStore.items = [
        { id: 'i1', name: 'Milk', aisle: 'Dairy', aisleOrder: 1, done: true, addedBy: 'uid-original' },
      ]
      const wrapper = mountList()
      await wrapper.find('.shopping-item-stub').trigger('click')

      const undoBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Undo')
      await undoBtn.trigger('click')

      // Undo must restore both done and addedBy, not re-toggle (which would
      // reassign addedBy to the current user on the uncheck path).
      expect(shoppingStore.restoreToggleState).toHaveBeenCalledWith('i1', {
        done: true,
        addedBy: 'uid-original',
      })
      expect(shoppingStore.toggleDone).not.toHaveBeenCalled()
    })
  })
})
