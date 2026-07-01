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

  describe('shopping card', () => {
    it('renders the shopping list card', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Shopping list')
    })

    it('links the shopping card to /shopping', () => {
      const wrapper = mountView()
      const cards = wrapper.findAllComponents({ name: 'VCard' })
      const shoppingCard = cards.find(c => c.text().includes('Shopping list'))
      expect(shoppingCard.props('to')).toBe('/shopping')
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
