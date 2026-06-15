import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/components/MealVoting.vue', () => ({
  default: {
    name: 'MealVoting',
    template: '<div class="meal-voting-stub" />',
  },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import MealsView from '@/views/MealsView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(MealsView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('MealsView', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the "This week\'s meals" heading', () => {
    const wrapper = mountView()
    expect(wrapper.text()).toContain("This week's meals")
  })

  it('renders the MealVoting component', () => {
    const wrapper = mountView()
    expect(wrapper.find('.meal-voting-stub').exists()).toBe(true)
  })
})
