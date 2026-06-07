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
    props: ['item', 'showDragHandle', 'showDelete', 'showEdit'],
    template: '<div class="shopping-item-stub">{{ item.name }}</div>',
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

function mountList() {
  return mount(ShoppingList, {
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
})
