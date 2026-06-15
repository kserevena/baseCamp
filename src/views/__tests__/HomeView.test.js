import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let familyStore
let mealsStore

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/stores/meals.js', () => ({
  useMealsStore: () => mealsStore,
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
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', name: 'Alice', role: 'parent' },
      members: [
        { uid: 'parent-uid', name: 'Alice', role: 'parent' },
        { uid: 'child-uid',  name: 'Bob',   role: 'child' },
      ],
    })
    mealsStore = reactive({
      meals: [],
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

  describe('meal poll card', () => {
    it('renders the meal poll card', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Meal poll')
    })

    it('links the meal card to /meals', () => {
      const wrapper = mountView()
      const cards = wrapper.findAllComponents({ name: 'VCard' })
      const mealCard = cards.find(c => c.text().includes('Meal poll'))
      expect(mealCard.props('to')).toBe('/meals')
    })

    it('shows the top meal name and vote count when meals exist', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Pasta', votes: ['uid-1', 'uid-2'] },
        { id: 'meal-2', name: 'Pizza', votes: ['uid-1'] },
      ]
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Pasta')
      expect(wrapper.text()).toContain('2 votes')
    })

    it('picks the meal with the most votes as topMeal', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Soup',  votes: ['uid-1'] },
        { id: 'meal-2', name: 'Steak', votes: ['uid-1', 'uid-2', 'uid-3'] },
        { id: 'meal-3', name: 'Salad', votes: [] },
      ]
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Steak')
      expect(wrapper.text()).not.toContain('Soup')
      expect(wrapper.text()).not.toContain('Salad')
    })

    it('does not show a top meal when there are no meals', () => {
      mealsStore.meals = []
      const wrapper = mountView()
      // Trophy icon not rendered when there are no meals
      expect(wrapper.html()).not.toContain('mdi-trophy')
    })

    it('handles meals with absent votes field without crashing', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Pasta' },
      ]
      expect(() => mountView()).not.toThrow()
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
