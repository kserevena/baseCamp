import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive, computed } from 'vue'

// ── mocks ──────────────────────────────────────────────────────────────────

let familyStore, wishListStore, items

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/stores/wishList.js', () => ({
  useWishListStore: () => wishListStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

let isParentValue = false
vi.mock('@/composables/useUserRole.js', () => ({
  useUserRole: () => ({
    isParent: computed(() => isParentValue),
    isChild:  computed(() => !isParentValue),
  }),
}))

vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: { name: 'FamilyAvatar', props: ['uid', 'size'], template: '<span class="avatar-stub" :data-uid="uid" />' },
}))

vi.mock('@/components/WishListItem.vue', () => ({
  default: {
    name: 'WishListItem',
    props: ['item', 'canWrite'],
    template: '<div class="wish-item-stub" :data-id="item.id" :data-can-write="String(canWrite)">{{ item.name }}</div>',
  },
}))

import WishListView from '@/views/WishListView.vue'

const vuetify = createVuetify({ components, directives })

function makeItem(overrides = {}) {
  return {
    id: 'w-1', ownerUid: 'child-uid', name: 'Lego set', note: null, link: null,
    done: false, doneBy: null, addedBy: 'child-uid', createdAt: null, updatedAt: null,
    ...overrides,
  }
}

function mountView() {
  return mount(WishListView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('WishListView', () => {
  beforeEach(() => {
    isParentValue = false
    items = []
    familyStore = reactive({
      familyId: 'fam-1',
      currentUser: { uid: 'child-uid', name: 'Ben', role: 'child' },
      members: [
        { uid: 'parent-uid', name: 'Alice', role: 'parent', colour: '#378ADD' },
        { uid: 'child-uid',  name: 'Ben',   role: 'child',  colour: '#1D9E75' },
      ],
    })
    wishListStore = reactive({
      items,
      itemsFor: (uid) => items
        .filter(i => i.ownerUid === uid)
        .sort((a, b) => Number(a.done) - Number(b.done)),
      activeCountFor: (uid) => items.filter(i => i.ownerUid === uid && !i.done).length,
      addItem: vi.fn(),
      updateItem: vi.fn(),
      deleteItem: vi.fn(),
      toggleDone: vi.fn(),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // ── member selector ───────────────────────────────────────────────────────

  describe('member selector', () => {
    it('renders one entry per family member', () => {
      const wrapper = mountView()
      expect(wrapper.findAll('.member-picker')).toHaveLength(2)
      expect(wrapper.text()).toContain('Alice')
      expect(wrapper.text()).toContain('Ben')
    })

    it('defaults to the current user\'s own list', () => {
      const wrapper = mountView()
      const selected = wrapper.findAll('.member-picker').filter(el => el.classes('member-selected'))
      expect(selected).toHaveLength(1)
      expect(selected[0].text()).toContain('Ben')
    })

    it('selects the current user once the members snapshot arrives', async () => {
      familyStore.currentUser = null
      const wrapper = mountView()
      familyStore.currentUser = { uid: 'child-uid', name: 'Ben', role: 'child' }
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.selectedUid).toBe('child-uid')
    })

    it('switches the visible list when another member is tapped', async () => {
      items.push(makeItem({ id: 'w-mine', ownerUid: 'child-uid', name: 'Lego set' }))
      items.push(makeItem({ id: 'w-theirs', ownerUid: 'parent-uid', name: 'Cordless drill' }))
      const wrapper = mountView()
      expect(wrapper.findAll('.wish-item-stub')).toHaveLength(1)

      const alice = wrapper.findAll('.member-picker').find(el => el.text().includes('Alice'))
      await alice.trigger('click')
      const shown = wrapper.findAll('.wish-item-stub')
      expect(shown).toHaveLength(1)
      expect(shown[0].attributes('data-id')).toBe('w-theirs')
    })

    it('falls back to your own list when the viewed member leaves the family', async () => {
      const wrapper = mountView()
      const alice = wrapper.findAll('.member-picker').find(el => el.text().includes('Alice'))
      await alice.trigger('click')
      expect(wrapper.vm.selectedUid).toBe('parent-uid')

      familyStore.members = familyStore.members.filter(m => m.uid !== 'parent-uid')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.selectedUid).toBe('child-uid')
    })
  })

  // ── sections ──────────────────────────────────────────────────────────────

  describe('item sections', () => {
    it('shows an empty state for your own empty list', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Nothing on your wish list yet')
    })

    it('names the member in the empty state for someone else\'s list', async () => {
      const wrapper = mountView()
      const alice = wrapper.findAll('.member-picker').find(el => el.text().includes('Alice'))
      await alice.trigger('click')
      expect(wrapper.text()).toContain("Alice hasn't added anything yet")
    })

    it('renders outstanding items and collapses ticked ones behind a header', async () => {
      items.push(makeItem({ id: 'w-active', name: 'Lego set', done: false }))
      items.push(makeItem({ id: 'w-done', name: 'Football', done: true }))
      const wrapper = mountView()

      expect(wrapper.findAll('.wish-item-stub')).toHaveLength(1)
      expect(wrapper.text()).toContain('Ticked off')

      await wrapper.find('.cursor-pointer').trigger('click')
      const shown = wrapper.findAll('.wish-item-stub').map(el => el.attributes('data-id'))
      expect(shown).toEqual(['w-active', 'w-done'])
    })

    it('hides the ticked-off section when nothing is ticked', () => {
      items.push(makeItem({ id: 'w-active', done: false }))
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('Ticked off')
    })
  })

  // ── write permissions ─────────────────────────────────────────────────────

  describe('write permissions', () => {
    it('lets a child write to their own list', () => {
      items.push(makeItem({ id: 'w-1' }))
      const wrapper = mountView()
      expect(wrapper.find('.fab').exists()).toBe(true)
      expect(wrapper.find('.wish-item-stub').attributes('data-can-write')).toBe('true')
    })

    it('makes another member\'s list read-only for a child', async () => {
      items.push(makeItem({ id: 'w-theirs', ownerUid: 'parent-uid' }))
      const wrapper = mountView()
      const alice = wrapper.findAll('.member-picker').find(el => el.text().includes('Alice'))
      await alice.trigger('click')
      expect(wrapper.find('.fab').exists()).toBe(false)
      expect(wrapper.find('.wish-item-stub').attributes('data-can-write')).toBe('false')
    })

    it('lets a parent write to another member\'s list', async () => {
      isParentValue = true
      familyStore.currentUser = { uid: 'parent-uid', name: 'Alice', role: 'parent' }
      items.push(makeItem({ id: 'w-theirs', ownerUid: 'child-uid' }))
      const wrapper = mountView()
      const ben = wrapper.findAll('.member-picker').find(el => el.text().includes('Ben'))
      await ben.trigger('click')
      expect(wrapper.find('.fab').exists()).toBe(true)
      expect(wrapper.find('.wish-item-stub').attributes('data-can-write')).toBe('true')
    })
  })

  // ── add / edit dialog ─────────────────────────────────────────────────────

  describe('add and edit', () => {
    it('adds an item to the selected member\'s list', async () => {
      const wrapper = mountView()
      await wrapper.find('.fab').trigger('click')
      wrapper.vm.formName = 'New bike'
      wrapper.vm.formNote = 'Blue'
      wrapper.vm.formLink = 'https://example.com'
      wrapper.vm.submitItem()
      expect(wrapperStoreCall(wrapper)).toEqual({
        ownerUid: 'child-uid', name: 'New bike', note: 'Blue', link: 'https://example.com',
      })
    })

    it('trims blank note and link to null', async () => {
      const wrapper = mountView()
      await wrapper.find('.fab').trigger('click')
      wrapper.vm.formName = '  New bike  '
      wrapper.vm.submitItem()
      expect(wrapperStoreCall(wrapper)).toEqual({
        ownerUid: 'child-uid', name: 'New bike', note: null, link: null,
      })
    })

    it('rejects an empty name and shows an error', () => {
      const wrapper = mountView()
      wrapper.vm.formName = '   '
      wrapper.vm.submitItem()
      expect(wishListStore.addItem).not.toHaveBeenCalled()
      expect(wrapper.vm.nameError).toBe('Name is required')
    })

    it('rejects a name longer than the 80-character rules cap', () => {
      const wrapper = mountView()
      wrapper.vm.formName = 'x'.repeat(81)
      wrapper.vm.submitItem()
      expect(wishListStore.addItem).not.toHaveBeenCalled()
      expect(wrapper.vm.nameError).toContain('80 characters or fewer')
    })

    it('updates instead of adding when editing an existing item', async () => {
      items.push(makeItem({ id: 'w-1', name: 'Lego set', note: 'Old note' }))
      const wrapper = mountView()
      wrapper.vm.openEdit(items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.formName).toBe('Lego set')
      expect(wrapper.vm.formNote).toBe('Old note')

      wrapper.vm.formName = 'Lego Technic set'
      wrapper.vm.submitItem()
      expect(wishListStore.addItem).not.toHaveBeenCalled()
      expect(wishListStore.updateItem).toHaveBeenCalledWith('w-1', {
        name: 'Lego Technic set', note: 'Old note', link: null,
      })
    })

    it('closes the dialog after a successful submit', async () => {
      const wrapper = mountView()
      await wrapper.find('.fab').trigger('click')
      expect(wrapper.vm.itemDialog).toBe(true)
      wrapper.vm.formName = 'New bike'
      wrapper.vm.submitItem()
      expect(wrapper.vm.itemDialog).toBe(false)
    })
  })
})

// Convenience — the single addItem payload the view produced.
function wrapperStoreCall(wrapper) {
  expect(wrapper.vm).toBeTruthy()
  expect(wishListStore.addItem).toHaveBeenCalledTimes(1)
  return wishListStore.addItem.mock.calls[0][0]
}
