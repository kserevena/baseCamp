import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

let shoppingStore
let familyStore

vi.mock('@/stores/shopping.js', () => ({
  useShoppingStore: () => shoppingStore,
}))

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/components/ShoppingList.vue', () => ({
  default: { props: ['showHeaders'], emits: ['edit'], template: '<div class="shopping-list-stub" />' },
}))

vi.mock('@/components/SupermarketManager.vue', () => ({
  default: { emits: ['close'], template: '<div class="supermarket-manager-stub" />' },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import ShoppingView from '@/views/ShoppingView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(ShoppingView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

function makeStore(overrides = {}) {
  return reactive({
    lists: [{ id: 'list-1', name: 'Shopping' }],
    items: [],
    get visibleItems() { return this.items },
    activeListId: 'list-1',
    activeAisles: [
      { name: 'Dairy', order: 1 },
      { name: 'Meat', order: 2 },
      { name: 'Dry goods', order: 3 },
    ],
    supermarkets: [
      { id: 'sm-1', name: 'Tesco', aisles: [] },
      { id: 'sm-2', name: 'Lidl', aisles: [] },
    ],
    selectedSupermarketId: null,
    supermarketsLoaded: true,
    selectSupermarket: vi.fn((id) => { shoppingStore.selectedSupermarketId = id }),
    ensureDefaultSupermarket: vi.fn(),
    addItem: vi.fn(),
    restoreItem: vi.fn().mockReturnValue(true),
    createList: vi.fn(),
    updateItem: vi.fn(),
    ...overrides,
  })
}

describe('ShoppingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = makeStore()
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', role: 'parent' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('supermarket selector', () => {
    it('renders an "All items" chip plus one chip per supermarket', () => {
      const wrapper = mountView()
      const text = wrapper.find('.list-selector').text()
      expect(text).toContain('All items')
      expect(text).toContain('Tesco')
      expect(text).toContain('Lidl')
    })

    it('the "All items" chip is active (primary) by default', () => {
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('All items'))
      expect(chip.props('color')).toBe('primary')
    })

    it('a store chip is inactive when not selected', () => {
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('Tesco'))
      expect(chip.props('color')).toBeUndefined()
    })

    it('clicking "All items" calls selectSupermarket with null', async () => {
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('All items'))
      await chip.trigger('click')
      expect(shoppingStore.selectSupermarket).toHaveBeenCalledWith(null)
    })

    it('clicking a store chip calls selectSupermarket with its id', async () => {
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('Lidl'))
      await chip.trigger('click')
      expect(shoppingStore.selectSupermarket).toHaveBeenCalledWith('sm-2')
    })

    it('the selected store chip becomes active (primary + checkmark)', () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('Tesco'))
      expect(chip.props('color')).toBe('primary')
      expect(chip.props('prependIcon')).toBe('mdi-check')
    })

    // Issue #158: chips must wrap onto multiple lines instead of truncating
    // in a single nowrap row.
    it('renders every supermarket chip in full, unabbreviated, even with many stores', () => {
      shoppingStore = makeStore({
        supermarkets: [
          { id: 'sm-1', name: 'Sainsburys', aisles: [] },
          { id: 'sm-2', name: 'Marks & Spencer', aisles: [] },
          { id: 'sm-3', name: 'Morrisons', aisles: [] },
          { id: 'sm-4', name: 'Co-op', aisles: [] },
          { id: 'sm-5', name: 'Waitrose', aisles: [] },
        ],
      })
      const wrapper = mountView()
      const chipTexts = wrapper.findAllComponents({ name: 'VChip' }).map(c => c.text())
      expect(chipTexts).toContain('Sainsburys')
      expect(chipTexts).toContain('Marks & Spencer')
      expect(chipTexts).toContain('Morrisons')
      expect(chipTexts).toContain('Co-op')
      expect(chipTexts).toContain('Waitrose')
    })

    // jsdom doesn't apply scoped SFC styles, so wrapping can't be asserted via
    // getComputedStyle here — read the source instead as a regression guard
    // against reverting to the old single-line, horizontally-scrolling row.
    it('the .list-chips rule wraps instead of scrolling on a single nowrap row', async () => {
      const source = await readFile(resolve(process.cwd(), 'src/views/ShoppingView.vue'), 'utf-8')
      const rule = source.match(/\.list-chips\s*\{([^}]*)\}/)[1]
      expect(rule).toMatch(/flex-wrap:\s*wrap/)
      expect(rule).not.toMatch(/overflow-x:\s*auto/)
    })
  })

  describe('empty state', () => {
    beforeEach(() => { shoppingStore.lists = [] })

    it('shows the empty-state message when there are no lists', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('No shopping list yet')
    })

    it('shows the create-list button to parents', () => {
      const wrapper = mountView()
      const btn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text().includes('Create shopping list'))
      expect(btn).toBeDefined()
    })

    it('hides the create-list button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const btn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text().includes('Create shopping list'))
      expect(btn).toBeUndefined()
    })
  })

  describe('manage supermarkets button', () => {
    it('shows the manage supermarkets button to parents', () => {
      const wrapper = mountView()
      const btn = wrapper.find('.list-selector').findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-storefront-outline'))
      expect(btn).toBeDefined()
    })

    it('hides the manage supermarkets button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const btn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-storefront-outline'))
      expect(btn).toBeUndefined()
    })

    it('clicking the button opens the supermarket manager sheet', async () => {
      const wrapper = mountView()
      const btn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-storefront-outline'))
      await btn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.querySelector('.supermarket-manager-stub')).not.toBeNull()
    })
  })

  describe('auto-provision default supermarket', () => {
    it('calls ensureDefaultSupermarket for a parent with a list and no supermarkets', () => {
      shoppingStore = makeStore({ supermarkets: [] })
      mountView()
      expect(shoppingStore.ensureDefaultSupermarket).toHaveBeenCalled()
    })

    it('does not call ensureDefaultSupermarket when supermarkets already exist', () => {
      mountView() // default store has two supermarkets
      expect(shoppingStore.ensureDefaultSupermarket).not.toHaveBeenCalled()
    })

    it('does not call ensureDefaultSupermarket for a child', () => {
      shoppingStore = makeStore({ supermarkets: [] })
      familyStore = reactive({ currentUser: { uid: 'child-uid', role: 'child' } })
      mountView()
      expect(shoppingStore.ensureDefaultSupermarket).not.toHaveBeenCalled()
    })

    it('does not provision before the supermarkets snapshot has loaded', () => {
      shoppingStore = makeStore({ supermarkets: [], supermarketsLoaded: false })
      mountView()
      expect(shoppingStore.ensureDefaultSupermarket).not.toHaveBeenCalled()
    })
  })

  describe('add item — aisle and allocation', () => {
    async function openAdd(wrapper) {
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
    }

    it('renders aisle chips after opening the add-item sheet', async () => {
      const wrapper = mountView()
      await openAdd(wrapper)
      expect(document.body.textContent).toContain('Dairy')
      expect(document.body.textContent).toContain('Meat')
    })

    it('renders allocation chips (All supermarkets + one per store)', async () => {
      const wrapper = mountView()
      await openAdd(wrapper)
      expect(document.body.textContent).toContain('All supermarkets')
      expect(document.body.textContent).toContain('Available in')
    })

    it('calls addItem with unallocated allocation by default', async () => {
      const wrapper = mountView()
      await openAdd(wrapper)
      wrapper.vm.itemName = 'Eggs'
      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy', { supermarketIds: [], allSupermarkets: false })
    })

    it('allocates to a specific store when its chip is selected', async () => {
      const wrapper = mountView()
      await openAdd(wrapper)
      wrapper.vm.itemName = 'Eggs'
      const tescoChip = wrapper.findAllComponents({ name: 'VChip' })
        .find(c => c.text() === 'Tesco' && c.html().includes('Tesco'))
      // Toggle allocation via the exposed handler to avoid ambiguity with selector chips
      wrapper.vm.toggleSupermarket('sm-1')
      await wrapper.vm.$nextTick()
      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy', { supermarketIds: ['sm-1'], allSupermarkets: false })
      expect(tescoChip).toBeDefined()
    })

    it('allocates to all supermarkets when the All supermarkets chip is selected', async () => {
      const wrapper = mountView()
      await openAdd(wrapper)
      wrapper.vm.itemName = 'Eggs'
      wrapper.vm.toggleAllSupermarkets()
      await wrapper.vm.$nextTick()
      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy', { supermarketIds: [], allSupermarkets: true })
    })

    it('selecting a specific store clears the all-supermarkets flag', async () => {
      const wrapper = mountView()
      await openAdd(wrapper)
      wrapper.vm.toggleAllSupermarkets()
      expect(wrapper.vm.itemAllSupermarkets).toBe(true)
      wrapper.vm.toggleSupermarket('sm-1')
      expect(wrapper.vm.itemAllSupermarkets).toBe(false)
      expect(wrapper.vm.itemSupermarketIds).toEqual(['sm-1'])
    })
  })

  describe('edit item — allocation prefilled', () => {
    it('prefills allocation from the edited item and saves it', async () => {
      const wrapper = mountView()
      wrapper.vm.openEdit({ id: 'i1', name: 'Milk', qty: '2', aisle: 'Dairy', supermarketIds: ['sm-2'], allSupermarkets: false })
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemSupermarketIds).toEqual(['sm-2'])
      expect(wrapper.vm.itemAllSupermarkets).toBe(false)

      const saveBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()
      expect(shoppingStore.updateItem).toHaveBeenCalledWith('i1', {
        name: 'Milk', qty: '2', aisle: 'Dairy', supermarketIds: ['sm-2'], allSupermarkets: false,
      })
    })
  })

  describe('create list (empty state)', () => {
    beforeEach(() => { shoppingStore.lists = [] })

    it('opens the new-list sheet and calls createList with a trimmed name', async () => {
      const wrapper = mountView()
      const openBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text().includes('Create shopping list'))
      await openBtn.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.newListName = '  Weekend shop '
      const createBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create')
      await createBtn.click()
      expect(shoppingStore.createList).toHaveBeenCalledWith('Weekend shop')
    })

    it('does not call createList for a blank name', async () => {
      const wrapper = mountView()
      const openBtn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.text().includes('Create shopping list'))
      await openBtn.trigger('click')
      await wrapper.vm.$nextTick()
      wrapper.vm.newListName = '   '
      const createBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Create')
      await createBtn.click()
      expect(shoppingStore.createList).not.toHaveBeenCalled()
    })
  })

  describe('re-add suggestions', () => {
    beforeEach(() => {
      shoppingStore.items = [
        { id: 'd1', name: 'Butter', qty: '250g', aisle: 'Dairy', done: true },
      ]
    })

    it('offers a done item as a suggestion and populates fields on selection', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'but'
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.doneSuggestions.map(i => i.id)).toContain('d1')

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemQty).toBe('250g')
      expect(wrapper.vm.itemAisle).toBe('Dairy')
    })

    it('restores a selected done item instead of adding a new one', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'Butter'
      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()

      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.restoreItem).toHaveBeenCalledWith('d1', '250g', 'Dairy')
      expect(shoppingStore.addItem).not.toHaveBeenCalled()
    })

    it('falls back to addItem when restore reports the item is gone', async () => {
      shoppingStore.restoreItem.mockReturnValue(false)
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'Butter'
      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()

      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.addItem).toHaveBeenCalled()
    })
  })

  describe('allocation hint text', () => {
    it('reads "Unallocated" with nothing selected', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.allocationHint).toContain('Unallocated')
    })

    it('reads "every store" when all supermarkets is chosen', async () => {
      const wrapper = mountView()
      wrapper.vm.toggleAllSupermarkets()
      expect(wrapper.vm.allocationHint).toBe('Shown in every store')
    })

    it('lists the chosen store names', async () => {
      const wrapper = mountView()
      wrapper.vm.toggleSupermarket('sm-1')
      expect(wrapper.vm.allocationHint).toBe('Shown in: Tesco')
    })
  })

  describe('headers toggle', () => {
    it('toggles aisle headers on and off', async () => {
      const wrapper = mountView()
      const btn = wrapper.find('.list-selector').findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline'))
      expect(btn).toBeDefined()
      await btn.trigger('click')
      await wrapper.vm.$nextTick()
      const off = wrapper.find('.list-selector').findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-off-outline'))
      expect(off).toBeDefined()
    })
  })

  // ── Issue #49: keyboard-aware sheet positioning ─────────────────────────
  // useKeyboardAwareSheet has its own dedicated unit test; here we verify the
  // view wires each sheet to a CSS variable and updates it on viewport resize.
  describe('keyboard-aware sheet positioning (issue #49)', () => {
    let mockVp

    beforeEach(() => {
      mockVp = {
        height: 851, offsetTop: 0,
        addEventListener: vi.fn(), removeEventListener: vi.fn(),
      }
      Object.defineProperty(window, 'visualViewport', { value: mockVp, writable: true, configurable: true })
      Object.defineProperty(window, 'innerHeight', { value: 851, writable: true, configurable: true })
    })

    afterEach(() => {
      document.documentElement.style.removeProperty('--add-item-sheet-bottom')
      document.documentElement.style.removeProperty('--supermarket-manager-sheet-bottom')
    })

    it('sets --add-item-sheet-bottom to 0px when the add-item sheet opens', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
    })

    it('updates --add-item-sheet-bottom to the keyboard height on viewport shrink', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      mockVp.height = 511
      const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
      resizeCb()
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('340px')
    })

    it('sets --supermarket-manager-sheet-bottom to 0px when the manage sheet opens', async () => {
      const wrapper = mountView()
      const btn = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.html().includes('mdi-storefront-outline'))
      await btn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.documentElement.style.getPropertyValue('--supermarket-manager-sheet-bottom')).toBe('0px')
    })
  })
})
