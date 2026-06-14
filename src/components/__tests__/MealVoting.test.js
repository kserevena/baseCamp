import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let mealsStore
let familyStore

vi.mock('@/stores/meals.js', () => ({
  useMealsStore: () => mealsStore,
}))

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: {
    name: 'FamilyAvatar',
    props: ['uid', 'size'],
    template: '<div class="avatar-stub" :data-uid="uid" />',
  },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import MealVoting from '@/components/MealVoting.vue'

const vuetify = createVuetify({ components, directives })

function mountComponent() {
  return mount(MealVoting, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('MealVoting', () => {
  beforeEach(() => {
    mealsStore = reactive({
      meals: [],
      toggleVote: vi.fn(),
    })
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', colour: '#FF0000' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('empty state', () => {
    it('renders no cards when the meals list is empty', () => {
      const wrapper = mountComponent()
      expect(wrapper.findAllComponents({ name: 'VCard' })).toHaveLength(0)
    })
  })

  describe('meal cards', () => {
    it('renders one card per meal', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Pasta', votes: [] },
        { id: 'meal-2', name: 'Pizza', votes: [] },
      ]
      const wrapper = mountComponent()
      expect(wrapper.findAllComponents({ name: 'VCard' })).toHaveLength(2)
    })

    it('renders the meal name in each card', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Spaghetti Bolognese', votes: [] },
      ]
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('Spaghetti Bolognese')
    })
  })

  describe('vote count', () => {
    it('shows "0 votes" when there are no votes', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: [] }]
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('0 votes')
    })

    it('shows singular "vote" when exactly 1 person has voted', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: ['uid-1'] }]
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('1 vote')
      expect(wrapper.text()).not.toContain('1 votes')
    })

    it('shows plural "votes" when more than 1 person has voted', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: ['uid-1', 'uid-2'] }]
      const wrapper = mountComponent()
      expect(wrapper.text()).toContain('2 votes')
    })
  })

  describe('vote button', () => {
    it('calls toggleVote with the meal id and current user uid when clicked', async () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: [] }]
      const wrapper = mountComponent()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(mealsStore.toggleVote).toHaveBeenCalledWith('meal-1', 'parent-uid')
    })

    it('uses the current user colour when the user has voted', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: ['parent-uid'] }]
      familyStore.currentUser = { uid: 'parent-uid', colour: '#ABCDEF' }
      const wrapper = mountComponent()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      // When voted, color prop equals the user's colour
      expect(btn.props('color')).toBe('#ABCDEF')
    })

    it('uses grey colour when the user has not voted', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: [] }]
      const wrapper = mountComponent()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      expect(btn.props('color')).toBe('grey-lighten-1')
    })

    it('uses flat variant when the user has voted', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: ['parent-uid'] }]
      const wrapper = mountComponent()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      expect(btn.props('variant')).toBe('flat')
    })

    it('uses tonal variant when the user has not voted', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: [] }]
      const wrapper = mountComponent()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      expect(btn.props('variant')).toBe('tonal')
    })
  })

  describe('voter avatars', () => {
    it('renders an avatar for each voter', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Pasta', votes: ['uid-1', 'uid-2', 'uid-3'] },
      ]
      const wrapper = mountComponent()
      const avatars = wrapper.findAll('.avatar-stub')
      expect(avatars).toHaveLength(3)
    })

    it('renders no avatars when there are no votes', () => {
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: [] }]
      const wrapper = mountComponent()
      expect(wrapper.findAll('.avatar-stub')).toHaveLength(0)
    })

    it('passes the voter uid to each avatar', () => {
      mealsStore.meals = [
        { id: 'meal-1', name: 'Pasta', votes: ['uid-A'] },
      ]
      const wrapper = mountComponent()
      const avatar = wrapper.find('.avatar-stub')
      expect(avatar.attributes('data-uid')).toBe('uid-A')
    })
  })

  describe('null currentUser', () => {
    it('renders without crashing when currentUser is null', () => {
      familyStore.currentUser = null
      mealsStore.meals = [{ id: 'meal-1', name: 'Pasta', votes: [] }]
      expect(() => mountComponent()).not.toThrow()
    })
  })
})
