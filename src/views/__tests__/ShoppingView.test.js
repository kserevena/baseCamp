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
    get selectedSupermarket() {
      return this.selectedSupermarketId
        ? this.supermarkets.find(s => s.id === this.selectedSupermarketId) ?? null
        : null
    },
    supermarketsLoaded: true,
    storeOnlyFilter: false,
    setStoreOnlyFilter: vi.fn((value) => { shoppingStore.storeOnlyFilter = value }),
    selectSupermarket: vi.fn((id) => { shoppingStore.selectedSupermarketId = id; shoppingStore.storeOnlyFilter = false }),
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
    // Issue: the chip row needed scrolling once a family had several stores.
    // With more than one supermarket, only the active selection is shown,
    // with a dropdown menu to switch.
    function findMenuActivator(wrapper) {
      return wrapper.find('.list-chips-menu').findComponent({ name: 'VChip' })
    }

    async function openMenu(wrapper) {
      await findMenuActivator(wrapper).trigger('click')
      await wrapper.vm.$nextTick()
    }

    it('shows a dropdown with only the active selection when more than one supermarket exists', () => {
      const wrapper = mountView()
      expect(wrapper.find('.list-chips-menu').exists()).toBe(true)
      const text = findMenuActivator(wrapper).text()
      expect(text).toContain('All items')
      expect(text).not.toContain('Tesco')
      expect(text).not.toContain('Lidl')
    })

    it('the dropdown activator shows the selected supermarket name', () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      const wrapper = mountView()
      expect(findMenuActivator(wrapper).text()).toContain('Tesco')
    })

    it('opening the dropdown and choosing a store calls selectSupermarket with its id', async () => {
      const wrapper = mountView()
      await openMenu(wrapper)
      const item = wrapper.findAllComponents({ name: 'VListItem' }).find(i => i.text().includes('Lidl'))
      await item.trigger('click')
      expect(shoppingStore.selectSupermarket).toHaveBeenCalledWith('sm-2')
    })

    it('opening the dropdown and choosing "All items" calls selectSupermarket with null', async () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      const wrapper = mountView()
      await openMenu(wrapper)
      const item = wrapper.findAllComponents({ name: 'VListItem' }).find(i => i.text().includes('All items'))
      await item.trigger('click')
      expect(shoppingStore.selectSupermarket).toHaveBeenCalledWith(null)
    })

    it('the dropdown menu marks the currently selected entry active', async () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      const wrapper = mountView()
      await openMenu(wrapper)
      const item = wrapper.findAllComponents({ name: 'VListItem' }).find(i => i.text().includes('Tesco'))
      expect(item.props('active')).toBe(true)
    })

    it('falls back to a plain chip row when only one supermarket exists', () => {
      shoppingStore = makeStore({ supermarkets: [{ id: 'sm-1', name: 'Tesco', aisles: [] }] })
      const wrapper = mountView()
      expect(wrapper.find('.list-chips-menu').exists()).toBe(false)
      const text = wrapper.find('.list-chips').text()
      expect(text).toContain('All items')
      expect(text).toContain('Tesco')
    })

    it('falls back to a plain chip row when no supermarkets exist', () => {
      shoppingStore = makeStore({ supermarkets: [] })
      const wrapper = mountView()
      expect(wrapper.find('.list-chips-menu').exists()).toBe(false)
      expect(wrapper.find('.list-chips').text()).toContain('All items')
    })

    it('the "All items" chip is active (primary) by default in the single-supermarket chip row', () => {
      shoppingStore = makeStore({ supermarkets: [{ id: 'sm-1', name: 'Tesco', aisles: [] }] })
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('All items'))
      expect(chip.props('color')).toBe('primary')
    })

    it('a store chip is inactive when not selected in the single-supermarket chip row', () => {
      shoppingStore = makeStore({ supermarkets: [{ id: 'sm-1', name: 'Tesco', aisles: [] }] })
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('Tesco'))
      expect(chip.props('color')).toBeUndefined()
    })

    it('clicking "All items" calls selectSupermarket with null in the single-supermarket chip row', async () => {
      shoppingStore = makeStore({ supermarkets: [{ id: 'sm-1', name: 'Tesco', aisles: [] }] })
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('All items'))
      await chip.trigger('click')
      expect(shoppingStore.selectSupermarket).toHaveBeenCalledWith(null)
    })

    it('clicking the store chip calls selectSupermarket with its id in the single-supermarket chip row', async () => {
      shoppingStore = makeStore({ supermarkets: [{ id: 'sm-1', name: 'Tesco', aisles: [] }] })
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('Tesco'))
      await chip.trigger('click')
      expect(shoppingStore.selectSupermarket).toHaveBeenCalledWith('sm-1')
    })

    it('the selected store chip becomes active (primary + checkmark) in the single-supermarket chip row', () => {
      shoppingStore = makeStore({
        supermarkets: [{ id: 'sm-1', name: 'Tesco', aisles: [] }],
        selectedSupermarketId: 'sm-1',
      })
      const wrapper = mountView()
      const chip = wrapper.findAllComponents({ name: 'VChip' }).find(c => c.text().includes('Tesco'))
      expect(chip.props('color')).toBe('primary')
      expect(chip.props('prependIcon')).toBe('mdi-check')
    })

    // Issue #137 Part C: hide "all supermarkets"/unallocated items while shopping one store
    function findFilterBtn(wrapper) {
      return wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => /mdi-filter(-outline)?/.test(b.html()))
    }
    function hasSolidFilterIcon(btn) {
      return /mdi-filter(?!-outline)/.test(btn.html())
    }

    it('the store-only filter button is hidden on "All items"', () => {
      const wrapper = mountView()
      expect(findFilterBtn(wrapper)).toBeUndefined()
    })

    it('the store-only filter button appears once a specific supermarket is selected', () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      const wrapper = mountView()
      const btn = findFilterBtn(wrapper)
      expect(btn).toBeTruthy()
      expect(btn.html()).toContain('mdi-filter-outline')
    })

    it('clicking the filter button toggles storeOnlyFilter', async () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      const wrapper = mountView()
      await findFilterBtn(wrapper).trigger('click')
      expect(shoppingStore.setStoreOnlyFilter).toHaveBeenCalledWith(true)
    })

    it('the filter button is highlighted (primary + solid icon) when active', () => {
      shoppingStore.selectedSupermarketId = 'sm-1'
      shoppingStore.storeOnlyFilter = true
      const wrapper = mountView()
      const btn = findFilterBtn(wrapper)
      expect(hasSolidFilterIcon(btn)).toBe(true)
      expect(btn.props('color')).toBe('primary')
    })

    // Issue #158 (superseded by the dropdown selector): every supermarket
    // must still be reachable, in full and unabbreviated, even with many
    // stores — now via the dropdown menu instead of a wrapping chip row.
    it('lists every supermarket in full, unabbreviated, even with many stores', async () => {
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
      await openMenu(wrapper)
      const itemTexts = wrapper.findAllComponents({ name: 'VListItem' }).map(i => i.text())
      expect(itemTexts).toContain('Sainsburys')
      expect(itemTexts).toContain('Marks & Spencer')
      expect(itemTexts).toContain('Morrisons')
      expect(itemTexts).toContain('Co-op')
      expect(itemTexts).toContain('Waitrose')
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
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy', { supermarketIds: [], allSupermarkets: false, priority: false })
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
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy', { supermarketIds: ['sm-1'], allSupermarkets: false, priority: false })
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
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy', { supermarketIds: [], allSupermarkets: true, priority: false })
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
        name: 'Milk', qty: '2', aisle: 'Dairy', supermarketIds: ['sm-2'], allSupermarkets: false, priority: false,
      })
    })
  })

  describe('priority toggle in the add/edit sheet', () => {
    it('defaults to false when adding a new item and can be turned on before saving', async () => {
      const wrapper = mountView()
      wrapper.vm.openAdd()
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemPriority).toBe(false)

      const priorityChip = [...document.body.querySelectorAll('.v-chip')].find(c => c.textContent.trim() === 'Priority')
      await priorityChip.click()
      expect(wrapper.vm.itemPriority).toBe(true)

      wrapper.vm.itemName = 'Milk'
      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Milk', '', 'Dairy', {
        supermarketIds: [], allSupermarkets: false, priority: true,
      })
    })

    it('prefills from the edited item and can be turned off before saving', async () => {
      const wrapper = mountView()
      wrapper.vm.openEdit({ id: 'i1', name: 'Milk', qty: '2', aisle: 'Dairy', supermarketIds: [], allSupermarkets: false, priority: true })
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemPriority).toBe(true)

      const priorityChip = [...document.body.querySelectorAll('.v-chip')].find(c => c.textContent.trim() === 'Priority')
      await priorityChip.click()
      expect(wrapper.vm.itemPriority).toBe(false)

      const saveBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()
      expect(shoppingStore.updateItem).toHaveBeenCalledWith('i1', {
        name: 'Milk', qty: '2', aisle: 'Dairy', supermarketIds: [], allSupermarkets: false, priority: false,
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
        { id: 'd1', name: 'Butter', qty: '250g', aisle: 'Meat', done: true, supermarketIds: ['sm-1'], allSupermarkets: false, priority: true },
      ]
    })

    it('offers a done item as a suggestion and populates fields on selection', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'but'
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.matchingSuggestions.map(i => i.id)).toContain('d1')

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemQty).toBe('250g')
      expect(wrapper.vm.itemAisle).toBe('Meat')
    })

    it('restores the selected done item\'s supermarket allocation into the picker', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemAllSupermarkets).toBe(false)
      expect(wrapper.vm.itemSupermarketIds).toEqual(['sm-1'])
    })

    it('defaults the picker to unallocated when the done item has no allocation', async () => {
      shoppingStore.items = [
        { id: 'd2', name: 'Bread', qty: '', aisle: 'Bakery', done: true },
      ]
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemAllSupermarkets).toBe(false)
      expect(wrapper.vm.itemSupermarketIds).toEqual([])
    })

    it('clears the picker when a selected suggestion is abandoned by editing the name', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemSupermarketIds).toEqual(['sm-1'])
      // The suggestion (d1) is priority-starred, so selecting it should have
      // carried that onto the form.
      expect(wrapper.vm.itemPriority).toBe(true)

      wrapper.vm.itemName = 'Bread'
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.selectedDoneItem).toBeNull()
      expect(wrapper.vm.itemAllSupermarkets).toBe(false)
      expect(wrapper.vm.itemSupermarketIds).toEqual([])
      // The abandoned suggestion's quantity, aisle, and priority must not carry
      // over either — here they restore to openAdd's defaults, since that's what
      // was in place before the suggestion was selected (see the next test for
      // the case where the user had already typed something of their own).
      expect(wrapper.vm.itemQty).toBe('')
      expect(wrapper.vm.itemAisle).toBe('Dairy')
      expect(wrapper.vm.itemPriority).toBe(false)

      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Bread', '', 'Dairy', {
        supermarketIds: [],
        allSupermarkets: false,
        priority: false,
      })
    })

    it('restores the user\'s own qty/aisle/allocation when a suggestion is abandoned', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      // The user had already filled in their own values before tapping the suggestion.
      wrapper.vm.itemQty = '2 loaves'
      wrapper.vm.itemAisle = 'Dry goods'
      wrapper.vm.toggleSupermarket('sm-2')
      wrapper.vm.itemPriority = true
      await wrapper.vm.$nextTick()

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemQty).toBe('250g')
      expect(wrapper.vm.itemAisle).toBe('Meat')
      expect(wrapper.vm.itemSupermarketIds).toEqual(['sm-1'])
      // The suggestion (d1) is priority-starred, so selecting it overwrites the
      // user's own priority choice — same as every other field it populates.
      expect(wrapper.vm.itemPriority).toBe(true)

      wrapper.vm.itemName = 'Bread'
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.selectedDoneItem).toBeNull()
      expect(wrapper.vm.itemQty).toBe('2 loaves')
      expect(wrapper.vm.itemAisle).toBe('Dry goods')
      expect(wrapper.vm.itemAllSupermarkets).toBe(false)
      expect(wrapper.vm.itemSupermarketIds).toEqual(['sm-2'])
      expect(wrapper.vm.itemPriority).toBe(true)
    })

    it('does not overwrite the original snapshot when switching directly between suggestions', async () => {
      shoppingStore.items = [
        { id: 'd1', name: 'Butter', qty: '250g', aisle: 'Meat', done: true, supermarketIds: ['sm-1'], allSupermarkets: false },
        { id: 'd2', name: 'Buns', qty: '6', aisle: 'Bakery', done: true, supermarketIds: ['sm-2'], allSupermarkets: false },
      ]
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemQty = '2 loaves'
      wrapper.vm.itemAisle = 'Dry goods'
      await wrapper.vm.$nextTick()

      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()
      wrapper.vm.selectSuggestion(shoppingStore.items[1])
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemQty).toBe('6')
      expect(wrapper.vm.itemAisle).toBe('Bakery')

      wrapper.vm.itemName = 'Bread'
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemQty).toBe('2 loaves')
      expect(wrapper.vm.itemAisle).toBe('Dry goods')
    })

    it('restores a selected done item instead of adding a new one, including its allocation', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'Butter'
      wrapper.vm.selectSuggestion(shoppingStore.items[0])
      await wrapper.vm.$nextTick()

      const addBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Add')
      await addBtn.click()
      expect(shoppingStore.restoreItem).toHaveBeenCalledWith('d1', '250g', 'Meat', {
        supermarketIds: ['sm-1'],
        allSupermarkets: false,
        priority: true,
      })
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

    it('does not resize the chip picker when the suggestion row appears', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      const section = () => document.body.querySelector('.chip-picker-section')
      expect(section().getAttribute('style')).toBeNull()

      wrapper.vm.itemName = 'but'
      await wrapper.vm.$nextTick()
      await wrapper.vm.$nextTick()

      // The suggestion row is showing, and the picker is still driven purely
      // by flex — no inline max-height budget recalculated from its height.
      expect(wrapper.vm.matchingSuggestions.length).toBeGreaterThan(0)
      expect(section().getAttribute('style')).toBeNull()
    })
  })

  describe('merged suggestions section', () => {
    beforeEach(() => {
      shoppingStore.items = [
        { id: 'a1', name: 'Butter', qty: '250g', aisle: 'Meat', done: false },
        { id: 'd1', name: 'Bread', qty: '', aisle: 'Bakery', done: true, supermarketIds: ['sm-1'], allSupermarkets: false },
      ]
    })

    it('lists both a not-done match and a done match under one section', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'b'
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.matchingSuggestions.map(i => i.id).sort()).toEqual(['a1', 'd1'])

      expect(document.body.textContent).toContain('Suggestions')
      expect(document.body.textContent).not.toContain('Re-add')
      expect(document.body.textContent).not.toContain('Already on list')
    })

    it('renders the not-done chip in warning colour and the done chip in primary colour', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'b'
      await wrapper.vm.$nextTick()

      const chips = wrapper.findAllComponents({ name: 'VChip' })
      const butterChip = chips.find(c => c.text() === 'Butter')
      const breadChip = chips.find(c => c.text() === 'Bread')
      expect(butterChip.props('color')).toBe('warning')
      expect(breadChip.props('color')).toBe('primary')
    })

    it('selecting the done chip populates fields for a re-add', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'b'
      await wrapper.vm.$nextTick()

      const chips = wrapper.findAllComponents({ name: 'VChip' })
      const breadChip = chips.find(c => c.text() === 'Bread')
      await breadChip.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.itemMode).toBe('add')
      expect(wrapper.vm.selectedDoneItem?.id).toBe('d1')
      expect(wrapper.vm.itemAisle).toBe('Bakery')
    })

    it('selecting the not-done chip switches into editing that existing item', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      wrapper.vm.itemName = 'b'
      await wrapper.vm.$nextTick()

      const chips = wrapper.findAllComponents({ name: 'VChip' })
      const butterChip = chips.find(c => c.text() === 'Butter')
      await butterChip.trigger('click')
      await wrapper.vm.$nextTick()

      // Butter (not-done) has nothing to restore — clicking it edits the
      // existing item in place instead of offering it as a re-add.
      expect(wrapper.vm.itemMode).toBe('edit')
      expect(wrapper.vm.editItem?.id).toBe('a1')
      expect(wrapper.vm.itemName).toBe('Butter')
      expect(wrapper.vm.itemAisle).toBe('Meat')
      expect(wrapper.vm.selectedDoneItem).toBeNull()
      expect(document.body.textContent).toContain('Edit item')

      const saveBtn = [...document.body.querySelectorAll('button')].find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()
      expect(shoppingStore.updateItem).toHaveBeenCalledWith('a1', {
        name: 'Butter', qty: '250g', aisle: 'Meat', supermarketIds: [], allSupermarkets: false, priority: false,
      })
      // The point of routing into edit mode is to update the existing
      // document in place — neither a fresh add nor a done-item restore
      // should fire alongside it, or the list would end up with a duplicate.
      expect(shoppingStore.addItem).not.toHaveBeenCalled()
      expect(shoppingStore.restoreItem).not.toHaveBeenCalled()
    })

    it('is empty with no typed name', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.matchingSuggestions).toEqual([])
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

  describe('export as PDF button', () => {
    it('renders the export button in the list selector', () => {
      const wrapper = mountView()
      const btn = wrapper.find('.list-selector').findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-file-pdf-box'))
      expect(btn).toBeDefined()
    })

    // Mirrors HomeView's shoppingSummary: once a family has supermarkets, the
    // list actually visible on screen is the selected supermarket, not the
    // underlying (never-shown) shoppingLists document name.
    it('uses the selected supermarket name, not the underlying list name, when supermarkets exist', async () => {
      shoppingStore.lists = [{ id: 'list-1', name: 'Old pre-migration name' }]
      shoppingStore.selectedSupermarketId = 'sm-2'
      shoppingStore.items = [{ id: 'i1', name: 'Milk', done: false }]
      const downloadShoppingListPdf = vi.fn()
      vi.doMock('@/utils/shoppingPdf.js', () => ({ downloadShoppingListPdf }))

      const wrapper = mountView()
      // exportPdf is async (it awaits the dynamic import) — call it directly
      // and await it so the mocked module has resolved before asserting.
      await wrapper.vm.exportPdf()

      expect(downloadShoppingListPdf).toHaveBeenCalledWith('Lidl', shoppingStore.items, shoppingStore.activeAisles)
    })

    it('uses "All items" when supermarkets exist but none is selected', async () => {
      shoppingStore.lists = [{ id: 'list-1', name: 'Old pre-migration name' }]
      shoppingStore.selectedSupermarketId = null
      shoppingStore.items = [{ id: 'i1', name: 'Milk', done: false }]
      const downloadShoppingListPdf = vi.fn()
      vi.doMock('@/utils/shoppingPdf.js', () => ({ downloadShoppingListPdf }))

      const wrapper = mountView()
      await wrapper.vm.exportPdf()

      expect(downloadShoppingListPdf).toHaveBeenCalledWith('All items', shoppingStore.items, shoppingStore.activeAisles)
    })

    it('falls back to the underlying list name when the family has no supermarkets yet', async () => {
      shoppingStore.lists = [{ id: 'list-1', name: 'Weekend Shop' }]
      shoppingStore.supermarkets = []
      shoppingStore.items = [{ id: 'i1', name: 'Milk', done: false }]
      const downloadShoppingListPdf = vi.fn()
      vi.doMock('@/utils/shoppingPdf.js', () => ({ downloadShoppingListPdf }))

      const wrapper = mountView()
      await wrapper.vm.exportPdf()

      expect(downloadShoppingListPdf).toHaveBeenCalledWith('Weekend Shop', shoppingStore.items, shoppingStore.activeAisles)
    })

    // The pdf util is dynamically imported, which is a genuine async gap
    // (real network/parse time, worse on slower devices). If the user
    // switches supermarket while that import is in flight, the export must
    // still reflect whichever store was selected at click time, not
    // whichever is selected once the import resolves.
    it('exports the supermarket that was selected when clicked, even if the selection changes before the import resolves', async () => {
      shoppingStore.selectedSupermarketId = 'sm-1' // Tesco
      shoppingStore.items = [{ id: 'i1', name: 'Milk', done: false }]
      const downloadShoppingListPdf = vi.fn()
      vi.doMock('@/utils/shoppingPdf.js', () => ({ downloadShoppingListPdf }))

      const wrapper = mountView()
      const exportPromise = wrapper.vm.exportPdf()
      // Flip the selected supermarket before the dynamic import resolves.
      shoppingStore.selectedSupermarketId = 'sm-2'
      await exportPromise

      expect(downloadShoppingListPdf).toHaveBeenCalledWith('Tesco', shoppingStore.items, shoppingStore.activeAisles)
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

  // ── Issue #162: keyboard-aware sheet sizing ─────────────────────────────
  //
  // IMPORTANT — what these tests can and cannot prove.
  //
  // They CANNOT prove the sheet behaves correctly with a real on-screen
  // keyboard, and no test in this suite can. A real Android keyboard shrinks
  // only the *visual* viewport, leaving the layout viewport (window.innerHeight,
  // vh, dvh) untouched; that divergence is the entire bug. Every way of faking
  // a keyboard in jsdom, Playwright or Chrome DevTools — resizing the window,
  // Emulation.setDeviceMetricsOverride — shrinks BOTH viewports together, which
  // removes the very discrepancy under test and makes broken code pass. Chrome
  // exposes no way to drive env(keyboard-inset-height) either. Assume any local
  // "keyboard test" is a false pass; this change must be verified on a physical
  // Android device.
  //
  // What they DO guard is the wiring that the device-verified behaviour rests
  // on, all of which is silently removable: the viewport meta tag that makes
  // dvh keyboard-aware in the first place, the dvh sizing on the card, and the
  // flex chain that lets the card shrink without hiding its buttons. Breaking
  // any one of those reintroduces the bug with no other visible symptom.
  describe('keyboard-aware sheet sizing (issue #162)', () => {
    let source

    beforeEach(async () => {
      source = await readFile(resolve(process.cwd(), 'src/views/ShoppingView.vue'), 'utf-8')
    })

    // Returns a rule's declarations with CSS comments removed. These rules carry
    // long comments that quote the very properties being asserted against (the
    // approaches they replaced), so matching raw text gives false results in
    // both directions.
    const declarationsOf = (selector) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return source
        .match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))[1]
        .replace(/\/\*[\s\S]*?\*\//g, '')
    }

    it('declares interactive-widget=resizes-content so the keyboard shrinks the layout viewport', async () => {
      const html = await readFile(resolve(process.cwd(), 'index.html'), 'utf-8')
      const viewport = html.match(/<meta\s+name="viewport"\s+content="([^"]*)"/)[1]
      // Without this the browser default (resizes-visual) leaves vh/dvh at full
      // height when the keyboard opens and .add-item-card extends underneath it.
      expect(viewport).toMatch(/interactive-widget=resizes-content/)
    })

    it('sizes the add-item sheet in dvh so it fills the screen and shrinks with the viewport', () => {
      // The height must be on the overlay wrapper, not the card: Vuetify's
      // .v-overlay__content is a flex container with a content-driven height,
      // so a dvh height on the card alone is ignored and the sheet stays
      // content-sized (measured in Chromium: 540px instead of 776px on an
      // 844px viewport). Asserting the location, not just the value, is what
      // makes this a real guard.
      const overlay = source.match(/\.add-item-overlay\s*\{([^}]*)\}/)[1]
      // height, not max-height: the sheet should fill the screen when no
      // keyboard is present, not merely be capped.
      expect(overlay).toMatch(/(^|[^-])height:\s*min\(\s*92dvh\s*,/)
      expect(overlay).toMatch(/(^|[^-])height:\s*92vh/) // fallback without dvh

      const card = source.match(/\.add-item-card\s*\{([^}]*)\}/)[1]
      expect(card).toMatch(/(^|[^-])height:\s*100%/)
      expect(card).toMatch(/flex-direction:\s*column/)
    })

    it('subtracts the keyboard height from the sheet height so the two never stack', () => {
      // On engines that ignore interactive-widget (WebKit; Chromium < 108, which
      // some Fire tablets still ship as Silk) dvh stays at full height while
      // useKeyboardAwareSheet keeps reporting the real keyboard height into
      // --add-item-sheet-bottom. Without this subtraction the fixed height and
      // the margin-bottom stack and push the sheet off the top of the screen —
      // measured at overlay top -268px on an 844px viewport with a 336px
      // keyboard, which is issue #162's original symptom and worse than the
      // content-sized card this replaced. With it, the sheet lands at top 0.
      const overlay = source.match(/\.add-item-overlay\s*\{([^}]*)\}/)[1]
      expect(overlay).toMatch(/margin-bottom:\s*var\(--add-item-sheet-bottom/)
      // The same variable must appear inside the height calculation, not only
      // as the margin — that pairing is what makes them compose rather than add.
      expect(overlay).toMatch(
        /height:\s*min\([^)]*92dvh[^;]*calc\(\s*100dvh\s*-\s*var\(--add-item-sheet-bottom,\s*0px\)\s*\)\s*\)/,
      )
    })

    it('lets only the chip picker absorb the height change, so the buttons stay reachable', () => {
      const rule = source.match(/\.add-item-card\s*>\s*\.chip-picker-section\s*\{([^}]*)\}/)[1]
      expect(rule).toMatch(/flex:\s*1 1 auto/)
      // Without min-height:0 a flex child won't shrink below its content and
      // the card overflows instead of the picker scrolling.
      expect(rule).toMatch(/min-height:\s*0/)

      const siblings = source.match(/\.add-item-card\s*>\s*\*\s*\{([^}]*)\}/)[1]
      expect(siblings).toMatch(/flex:\s*0 0 auto/)
    })

    it('keeps a scroll escape hatch on the card so the Add button is never trapped', () => {
      // The chip picker normally absorbs the height change, but below roughly
      // 320px of layout viewport (landscape with the keyboard up, split-screen)
      // it is already at 0 and the fixed-height fields and button row still
      // overflow. `overflow: hidden` clipped them and made Add unreachable —
      // measured at a 250px viewport, a real wheel gesture moved scrollTop 0px
      // and the button stayed off-screen. `auto` scrolls 86px and reaches it.
      // Strip CSS comments first — this rule's comment explains the
      // `overflow: hidden` it replaced, which would otherwise satisfy a naive
      // negative match against the raw text.
      const card = declarationsOf('.add-item-card')
      expect(card).toMatch(/overflow-y:\s*auto/)
      expect(card).not.toMatch(/overflow:\s*hidden/)
    })

    it('measures nothing in JS — the layout is declarative', () => {
      const script = source.match(/<script setup>([\s\S]*?)<\/script>/)[1]
      // The four approaches tried before this one all measured the DOM or the
      // viewport and corrected the layout imperatively; none survived contact
      // with a real device. Keep this file free of that pattern.
      expect(script).not.toMatch(/offsetHeight|scrollIntoView|scrollTop|getBoundingClientRect/)
      expect(script).not.toMatch(/CHIP_PICKER_(MAX|MIN)_HEIGHT|chipPickerMaxHeight/)
    })

    it('renders every aisle and supermarket without a height budget capping them', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      const section = document.body.querySelector('.chip-picker-section')
      const chipTexts = [...section.querySelectorAll('.v-chip')].map(c => c.textContent.trim())
      for (const aisle of shoppingStore.activeAisles) expect(chipTexts).toContain(aisle.name)
      for (const sm of shoppingStore.supermarkets) expect(chipTexts).toContain(sm.name)
      expect(section.getAttribute('style')).toBeNull()
    })
  })
})
