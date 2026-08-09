import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let wishListStore

vi.mock('@/stores/wishList.js', () => ({
  useWishListStore: () => wishListStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: { name: 'FamilyAvatar', props: ['uid', 'size'], template: '<span class="avatar-stub" :data-uid="uid" />' },
}))

import WishListItem from '@/components/WishListItem.vue'

const vuetify = createVuetify({ components, directives })

function makeItem(overrides = {}) {
  return {
    id: 'w-1',
    ownerUid: 'child-uid',
    name: 'Lego set',
    note: null,
    link: null,
    done: false,
    doneBy: null,
    addedBy: 'child-uid',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  }
}

function mountItem(props = {}) {
  return mount(WishListItem, {
    props: { item: makeItem(), canWrite: true, ...props },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('WishListItem', () => {
  beforeEach(() => {
    wishListStore = reactive({ toggleDone: vi.fn() })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // ── rendering ─────────────────────────────────────────────────────────────

  it('renders the item name', () => {
    const wrapper = mountItem()
    expect(wrapper.text()).toContain('Lego set')
  })

  it('renders the note when present', () => {
    const wrapper = mountItem({ item: makeItem({ note: 'The blue one' }) })
    expect(wrapper.text()).toContain('The blue one')
  })

  it('strikes through and dims a ticked item', () => {
    const wrapper = mountItem({ item: makeItem({ done: true }) })
    expect(wrapper.find('.item-done').exists()).toBe(true)
    expect(wrapper.find('.text-decoration-line-through').exists()).toBe(true)
  })

  it('renders a link button only when the item has a link', () => {
    expect(mountItem().html()).not.toContain('mdi-open-in-new')
    const withLink = mountItem({ item: makeItem({ link: 'https://example.com' }) })
    expect(withLink.html()).toContain('mdi-open-in-new')
    expect(withLink.find('a[href="https://example.com"]').attributes('rel')).toContain('noopener')
  })

  describe('unsafe stored links', () => {
    // The view normalises on input, but an older client or an offline-cached
    // document may hold anything — never bind it to an href unchecked.
    it.each([
      ['javascript:alert(1)'],
      ['data:text/html,<script>alert(1)</script>'],
      ['mailto:someone@example.com'],
      ['amazon.co.uk/dp/B0123'],
    ])('does not render a link button for %s', (link) => {
      const wrapper = mountItem({ item: makeItem({ link }) })
      expect(wrapper.html()).not.toContain('mdi-open-in-new')
      expect(wrapper.find('a[href]').exists()).toBe(false)
    })
  })

  // ── who ticked it ─────────────────────────────────────────────────────────

  describe('doneBy avatar', () => {
    it('shows the avatar when someone else ticked the item', () => {
      const wrapper = mountItem({ item: makeItem({ done: true, doneBy: 'parent-uid' }) })
      expect(wrapper.find('.avatar-stub').attributes('data-uid')).toBe('parent-uid')
    })

    it('hides the avatar when the owner ticked their own item', () => {
      const wrapper = mountItem({ item: makeItem({ done: true, doneBy: 'child-uid' }) })
      expect(wrapper.find('.avatar-stub').exists()).toBe(false)
    })

    it('hides the avatar on an outstanding item', () => {
      const wrapper = mountItem({ item: makeItem({ done: false, doneBy: null }) })
      expect(wrapper.find('.avatar-stub').exists()).toBe(false)
    })
  })

  // ── write affordances ─────────────────────────────────────────────────────

  describe('when the viewer can write', () => {
    it('enables the checkbox and calls toggleDone', async () => {
      const wrapper = mountItem()
      const checkbox = wrapper.find('input[type="checkbox"]')
      expect(checkbox.attributes('disabled')).toBeUndefined()
      await checkbox.setValue(true)
      expect(wishListStore.toggleDone).toHaveBeenCalledWith('w-1')
    })

    it('emits edit and delete from the action buttons', async () => {
      const wrapper = mountItem()
      await wrapper.find('[aria-label="Edit item"]').trigger('click')
      await wrapper.find('[aria-label="Delete item"]').trigger('click')
      expect(wrapper.emitted('edit')).toHaveLength(1)
      expect(wrapper.emitted('delete')).toHaveLength(1)
    })
  })

  describe('when the viewer cannot write', () => {
    it('disables the checkbox', () => {
      const wrapper = mountItem({ canWrite: false })
      expect(wrapper.find('input[type="checkbox"]').attributes('disabled')).toBeDefined()
    })

    it('hides the edit and delete buttons', () => {
      const wrapper = mountItem({ canWrite: false })
      expect(wrapper.find('[aria-label="Edit item"]').exists()).toBe(false)
      expect(wrapper.find('[aria-label="Delete item"]').exists()).toBe(false)
    })

    it('still shows the link button', () => {
      const wrapper = mountItem({ canWrite: false, item: makeItem({ link: 'https://example.com' }) })
      expect(wrapper.html()).toContain('mdi-open-in-new')
    })
  })
})
