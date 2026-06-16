import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { ref } from 'vue'

let shoppingStore
let isParentRef

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/composables/useUserRole.js', () => ({
  useUserRole: () => ({ isParent: isParentRef }),
}))

vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: {
    name: 'FamilyAvatar',
    props: ['uid', 'size'],
    template: '<div class="avatar-stub" :data-uid="uid" />',
  },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import ShoppingItem from '@/components/ShoppingItem.vue'

const vuetify = createVuetify({ components, directives })

function makeItem(overrides = {}) {
  return {
    id: 'item-1',
    name: 'Milk',
    qty: '2 pints',
    aisle: 'Dairy',
    done: false,
    addedBy: 'uid-1',
    fromMeal: null,
    ...overrides,
  }
}

function mountItem(item, props = {}) {
  return mount(ShoppingItem, {
    props: { item, ...props },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

function findDeleteBtn(wrapper) {
  return wrapper.findAllComponents({ name: 'VBtn' })
    .find(b => b.html().includes('mdi-delete-outline'))
}

describe('ShoppingItem', () => {
  beforeEach(() => {
    isParentRef = ref(true)
    shoppingStore = { toggleDone: vi.fn() }
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('content rendering', () => {
    it('renders the item name', () => {
      const wrapper = mountItem(makeItem({ name: 'Eggs' }))
      expect(wrapper.text()).toContain('Eggs')
    })

    it('renders the qty when present', () => {
      const wrapper = mountItem(makeItem({ qty: '6 pack' }))
      expect(wrapper.text()).toContain('6 pack')
    })

    it('does not render a subtitle when qty is empty', () => {
      const wrapper = mountItem(makeItem({ qty: '' }))
      const subtitle = wrapper.find('.v-list-item-subtitle')
      expect(subtitle.exists()).toBe(false)
    })

    it('renders the FamilyAvatar with the addedBy uid', () => {
      const wrapper = mountItem(makeItem({ addedBy: 'uid-42' }))
      const avatar = wrapper.find('.avatar-stub')
      expect(avatar.exists()).toBe(true)
      expect(avatar.attributes('data-uid')).toBe('uid-42')
    })
  })

  describe('done state', () => {
    it('adds line-through styling when item is done', () => {
      const wrapper = mountItem(makeItem({ done: true }))
      const title = wrapper.find('.v-list-item-title')
      expect(title.classes()).toContain('text-decoration-line-through')
    })

    it('does not add line-through styling when item is not done', () => {
      const wrapper = mountItem(makeItem({ done: false }))
      const title = wrapper.find('.v-list-item-title')
      expect(title.classes()).not.toContain('text-decoration-line-through')
    })

    it('applies reduced opacity class when item is done', () => {
      const wrapper = mountItem(makeItem({ done: true }))
      expect(wrapper.find('.item-done').exists()).toBe(true)
    })

    it('does not apply reduced opacity class when item is not done', () => {
      const wrapper = mountItem(makeItem({ done: false }))
      expect(wrapper.find('.item-done').exists()).toBe(false)
    })
  })

  describe('checkbox', () => {
    it('checkbox is enabled for parents', () => {
      isParentRef = ref(true)
      const wrapper = mountItem(makeItem())
      const checkbox = wrapper.findComponent({ name: 'VCheckboxBtn' })
      expect(checkbox.props('disabled')).toBe(false)
    })

    it('checkbox is disabled for children', () => {
      isParentRef = ref(false)
      const wrapper = mountItem(makeItem())
      const checkbox = wrapper.findComponent({ name: 'VCheckboxBtn' })
      expect(checkbox.props('disabled')).toBe(true)
    })

    it('calls toggleDone with the item id when checkbox value changes', async () => {
      const wrapper = mountItem(makeItem({ id: 'item-99' }))
      const checkbox = wrapper.findComponent({ name: 'VCheckboxBtn' })
      // Emit the update event from the child component (Vuetify checkbox doesn't click in jsdom)
      await checkbox.vm.$emit('update:modelValue', true)
      await wrapper.vm.$nextTick()
      expect(shoppingStore.toggleDone).toHaveBeenCalledWith('item-99')
    })

    it('emits toggle with the item when checkbox value changes', async () => {
      const item = makeItem({ id: 'item-99' })
      const wrapper = mountItem(item)
      const checkbox = wrapper.findComponent({ name: 'VCheckboxBtn' })
      await checkbox.vm.$emit('update:modelValue', true)
      await wrapper.vm.$nextTick()
      expect(wrapper.emitted('toggle')).toHaveLength(1)
      expect(wrapper.emitted('toggle')[0][0]).toEqual(item)
    })
  })

  describe('fromMeal chip', () => {
    it('shows the meal chip when fromMeal is set', () => {
      const wrapper = mountItem(makeItem({ fromMeal: 'meal-id-1' }))
      expect(wrapper.text()).toContain('meal')
    })

    it('hides the meal chip when fromMeal is null', () => {
      const wrapper = mountItem(makeItem({ fromMeal: null }))
      expect(wrapper.text()).not.toContain('meal')
    })
  })

  describe('delete button', () => {
    it('shows the delete button when showDelete is true', () => {
      const wrapper = mountItem(makeItem(), { showDelete: true })
      expect(findDeleteBtn(wrapper)).toBeTruthy()
    })

    it('hides the delete button when showDelete is false', () => {
      const wrapper = mountItem(makeItem(), { showDelete: false })
      expect(findDeleteBtn(wrapper)).toBeUndefined()
    })

    it('emits delete when the delete button is clicked', async () => {
      const wrapper = mountItem(makeItem(), { showDelete: true })
      await findDeleteBtn(wrapper).trigger('click')
      expect(wrapper.emitted('delete')).toHaveLength(1)
    })
  })

  describe('drag handle', () => {
    it('shows the drag handle icon when showDragHandle is true', () => {
      const wrapper = mountItem(makeItem(), { showDragHandle: true })
      expect(wrapper.find('.drag-handle').exists()).toBe(true)
    })

    it('hides the drag handle icon when showDragHandle is false', () => {
      const wrapper = mountItem(makeItem(), { showDragHandle: false })
      expect(wrapper.find('.drag-handle').exists()).toBe(false)
    })
  })

  describe('edit interaction', () => {
    it('emits edit when the list item is clicked and showEdit is true', async () => {
      const wrapper = mountItem(makeItem(), { showEdit: true })
      await wrapper.find('.v-list-item').trigger('click')
      expect(wrapper.emitted('edit')).toHaveLength(1)
    })

    it('does not emit edit when showEdit is false', async () => {
      const wrapper = mountItem(makeItem(), { showEdit: false })
      await wrapper.find('.v-list-item').trigger('click')
      expect(wrapper.emitted('edit')).toBeFalsy()
    })
  })
})
