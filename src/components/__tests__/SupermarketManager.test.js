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

vi.mock('@/components/AisleManager.vue', () => ({
  default: { props: ['supermarket'], template: '<div class="aisle-manager-stub">{{ supermarket.name }} aisles</div>' },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import SupermarketManager from '@/components/SupermarketManager.vue'

const vuetify = createVuetify({ components, directives })

function mountManager() {
  return mount(SupermarketManager, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('SupermarketManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      supermarkets: [
        { id: 'sm-1', name: 'Tesco', aisles: [] },
        { id: 'sm-2', name: 'Lidl', aisles: [] },
      ],
      addSupermarket: vi.fn(),
      renameSupermarket: vi.fn(),
      deleteSupermarket: vi.fn(),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('renders each supermarket name', () => {
    const wrapper = mountManager()
    expect(wrapper.text()).toContain('Tesco')
    expect(wrapper.text()).toContain('Lidl')
  })

  it('shows an empty-state message when there are no supermarkets', () => {
    shoppingStore.supermarkets = []
    const wrapper = mountManager()
    expect(wrapper.text()).toContain('No supermarkets yet')
  })

  it('emits close when the × button is clicked', async () => {
    const wrapper = mountManager()
    const closeBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-close'))
    await closeBtn.trigger('click')
    expect(wrapper.emitted('close')).toBeTruthy()
  })

  describe('add', () => {
    it('calls addSupermarket with a trimmed name', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input')
      await input.setValue('  Aldi  ')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      expect(shoppingStore.addSupermarket).toHaveBeenCalledWith('Aldi')
    })

    it('shows an error for a blank name', async () => {
      const wrapper = mountManager()
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Enter a name')
      expect(shoppingStore.addSupermarket).not.toHaveBeenCalled()
    })

    it('shows an error for a duplicate name (case-insensitive)', async () => {
      const wrapper = mountManager()
      const input = wrapper.find('input')
      await input.setValue('tesco')
      const addBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text() === 'Add')
      await addBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.text()).toContain('Already exists')
      expect(shoppingStore.addSupermarket).not.toHaveBeenCalled()
    })
  })

  describe('rename', () => {
    it('calls renameSupermarket when a name is edited and confirmed', async () => {
      const wrapper = mountManager()
      const pencil = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-pencil-outline'))
      await pencil.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.editingName = 'Costco'
      const check = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-check'))
      await check.trigger('click')
      expect(shoppingStore.renameSupermarket).toHaveBeenCalledWith('sm-1', 'Costco')
    })

    it('does not rename again with a null id when saveRename fires twice (Enter then blur)', async () => {
      const wrapper = mountManager()
      const pencil = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-pencil-outline'))
      await pencil.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.editingName = 'Costco'
      // First call (Enter) commits the rename and clears editingId; the second
      // call (blur, after the input unmounts) must be a no-op, not a null write.
      wrapper.vm.saveRename()
      wrapper.vm.saveRename()

      expect(shoppingStore.renameSupermarket).toHaveBeenCalledTimes(1)
      expect(shoppingStore.renameSupermarket).toHaveBeenCalledWith('sm-1', 'Costco')
    })
  })

  describe('expand aisles', () => {
    it('renders an embedded AisleManager for the expanded store', async () => {
      const wrapper = mountManager()
      const chevron = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-chevron-down'))
      await chevron.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Tesco aisles')
    })
  })

  describe('delete', () => {
    it('opens a confirmation dialog and calls deleteSupermarket on confirm', async () => {
      const wrapper = mountManager()
      const del = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-delete-outline'))
      await del.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Delete supermarket?')

      const confirm = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Delete')
      await confirm.click()
      expect(shoppingStore.deleteSupermarket).toHaveBeenCalledWith('sm-1')
    })

    it('does not call deleteSupermarket when cancelled', async () => {
      const wrapper = mountManager()
      const del = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-delete-outline'))
      await del.trigger('click')
      await wrapper.vm.$nextTick()
      const cancel = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Cancel')
      await cancel.click()
      expect(shoppingStore.deleteSupermarket).not.toHaveBeenCalled()
    })
  })
})
