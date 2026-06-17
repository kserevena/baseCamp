import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let shoppingStore

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import ShoppingNewList from '@/components/ShoppingNewList.vue'

const vuetify = createVuetify({ components, directives })

function mountComp(props = {}) {
  return mount(ShoppingNewList, {
    props: { modelValue: true, ...props },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('ShoppingNewList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      createList: vi.fn(),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders the new list heading', () => {
    mountComp()
    expect(document.body.textContent).toContain('New list')
  })

  it('calls store.createList with the list name on Create', async () => {
    const wrapper = mountComp()
    wrapper.vm.listName = 'Birthday shop'
    const createBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Create')
    await createBtn.click()
    expect(shoppingStore.createList).toHaveBeenCalledWith('Birthday shop')
  })

  it('does not call createList when name is blank', async () => {
    mountComp()
    const createBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Create')
    await createBtn.click()
    expect(shoppingStore.createList).not.toHaveBeenCalled()
  })

  it('emits update:modelValue false after Create', async () => {
    const wrapper = mountComp()
    wrapper.vm.listName = 'My list'
    const createBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Create')
    await createBtn.click()
    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('emits update:modelValue false on Cancel without calling createList', async () => {
    const wrapper = mountComp()
    const cancelBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Cancel')
    await cancelBtn.click()
    expect(shoppingStore.createList).not.toHaveBeenCalled()
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false])
  })

  it('resets the list name after creating', async () => {
    const wrapper = mountComp()
    wrapper.vm.listName = 'Temp'
    const createBtn = [...document.body.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'Create')
    await createBtn.click()
    expect(wrapper.vm.listName).toBe('')
  })
})
