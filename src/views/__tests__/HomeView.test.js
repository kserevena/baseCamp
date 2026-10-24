import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let familyStore
let shoppingStore
let jobsStore

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/stores/jobs.js', () => ({
  useJobsStore: () => jobsStore,
}))

vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: {
    name: 'FamilyAvatar',
    props: ['uid', 'size'],
    template: '<div class="avatar-stub" :data-uid="uid" />',
  },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

const routerPush = vi.fn()
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: routerPush }),
}))

import HomeView from '@/views/HomeView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(HomeView, {
    global: {
      plugins: [vuetify],
      stubs: { RouterLink: true },
    },
    attachTo: document.body,
  })
}

describe('HomeView', () => {
  beforeEach(() => {
    localStorage.clear()
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', name: 'Alice', role: 'parent' },
      members: [
        { uid: 'parent-uid', name: 'Alice', role: 'parent' },
        { uid: 'child-uid',  name: 'Bob',   role: 'child' },
      ],
    })
    shoppingStore = reactive({
      lists: [],
      items: [],
      activeListId: null,
      supermarkets: [],
      selectedSupermarket: null,
    })
    jobsStore = reactive({
      activeJobsByPriority: [],
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('greeting', () => {
    it('greets the current user by name', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Hello, Alice')
    })

    it('renders without crashing when currentUser is null', () => {
      familyStore.currentUser = null
      expect(() => mountView()).not.toThrow()
    })
  })

  describe('priority items card', () => {
    it('renders the priority items card', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Priority items')
    })

    it('links the shopping card to /shopping', () => {
      const wrapper = mountView()
      const cards = wrapper.findAllComponents({ name: 'VCard' })
      const shoppingCard = cards.find(c => c.text().includes('Priority items'))
      expect(shoppingCard.props('to')).toBe('/shopping')
    })

    // ── Issue #197: show priority items needing purchasing, not the list/supermarket name ──
    describe('priority items', () => {
      it('shows "No priority items" when there are none', () => {
        shoppingStore.items = [
          { id: 'i1', name: 'Milk', priority: false, done: false },
          { id: 'i2', name: 'Bread', priority: true, done: true },
        ]
        const wrapper = mountView()
        expect(wrapper.text()).toContain('No priority items')
      })

      it('lists unchecked priority items', () => {
        shoppingStore.items = [
          { id: 'i1', name: 'Milk', priority: true, done: false },
          { id: 'i2', name: 'Bread', priority: false, done: false },
          { id: 'i3', name: 'Eggs', priority: true, done: false },
          { id: 'i4', name: 'Butter', priority: true, done: true },
        ]
        const wrapper = mountView()
        expect(wrapper.text()).toContain('Milk')
        expect(wrapper.text()).toContain('Eggs')
        expect(wrapper.text()).not.toContain('Bread')
        expect(wrapper.text()).not.toContain('Butter')
        expect(wrapper.text()).not.toContain('No priority items')
      })

      it('treats a missing priority field as not priority', () => {
        shoppingStore.items = [{ id: 'i1', name: 'Milk', done: false }]
        const wrapper = mountView()
        expect(wrapper.text()).toContain('No priority items')
      })
    })
  })

  describe('quick add shopping item button', () => {
    const findBtn = (wrapper) => wrapper.find('[aria-label="Add shopping item"]')

    beforeEach(() => {
      routerPush.mockClear()
      shoppingStore.lists = [{ id: 'list-1', name: 'Shopping' }]
    })

    it('shows the button for a parent when a list exists', () => {
      const wrapper = mountView()
      expect(findBtn(wrapper).exists()).toBe(true)
      expect(findBtn(wrapper).find('.mdi-cart-plus').exists()).toBe(true)
    })

    it('navigates to the shopping page with the add query on click', async () => {
      const wrapper = mountView()
      await findBtn(wrapper).trigger('click')
      expect(routerPush).toHaveBeenCalledWith({ path: '/shopping', query: { add: '1' } })
    })

    // The card itself links to /shopping; the button's click must not reach
    // it, or the card would also navigate (without the query).
    it('does not let the click reach the card link', async () => {
      const wrapper = mountView()
      const cardClick = vi.fn()
      wrapper.find('.v-card').element.addEventListener('click', cardClick)
      const event = new MouseEvent('click', { bubbles: true, cancelable: true })
      findBtn(wrapper).element.dispatchEvent(event)
      expect(cardClick).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(true)
    })

    it('is hidden for children, who cannot add shopping items', () => {
      familyStore.currentUser = { uid: 'child-uid', name: 'Bob', role: 'child' }
      const wrapper = mountView()
      expect(findBtn(wrapper).exists()).toBe(false)
    })

    it('is hidden when there is no shopping list yet', () => {
      shoppingStore.lists = []
      const wrapper = mountView()
      expect(findBtn(wrapper).exists()).toBe(false)
    })
  })

  describe('jobs preview', () => {
    it('renders the household jobs preview section', () => {
      const wrapper = mountView()
      expect(wrapper.findComponent({ name: 'JobsPreview' }).exists()).toBe(true)
      expect(wrapper.text()).toContain('Household jobs')
    })

    it('links the jobs preview card to /jobs', () => {
      const wrapper = mountView()
      const cards = wrapper.findAllComponents({ name: 'VCard' })
      const jobsCard = cards.find(c => c.text().includes('Household jobs'))
      expect(jobsCard.props('to')).toBe('/jobs')
    })
  })

  describe('family avatars', () => {
    it('renders an avatar for each family member', () => {
      const wrapper = mountView()
      const avatars = wrapper.findAll('.avatar-stub')
      expect(avatars).toHaveLength(2)
    })

    it('passes the correct uid to each avatar', () => {
      const wrapper = mountView()
      const uids = wrapper.findAll('.avatar-stub').map(a => a.attributes('data-uid'))
      expect(uids).toContain('parent-uid')
      expect(uids).toContain('child-uid')
    })

    it('shows each member\'s name below their avatar', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Alice')
      expect(wrapper.text()).toContain('Bob')
    })

    it('renders the family section heading', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Family')
    })

    it('renders no avatars when the family has no members', () => {
      familyStore.members = []
      const wrapper = mountView()
      expect(wrapper.findAll('.avatar-stub')).toHaveLength(0)
    })
  })
})
