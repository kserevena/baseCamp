import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

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

vi.mock('@/components/AisleManager.vue', () => ({
  default: { emits: ['close'], template: '<div class="aisle-manager-stub" />' },
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

function listChips(wrapper) {
  // All VChip components inside the list-chips scroll container
  return wrapper.findAllComponents({ name: 'VChip' })
    .filter(c => ['Weekly shop', 'Party supplies'].some(n => c.text().includes(n)))
}

describe('ShoppingView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shoppingStore = reactive({
      lists: [
        { id: 'list-1', name: 'Weekly shop' },
        { id: 'list-2', name: 'Party supplies' },
      ],
      items: [],
      activeListId: 'list-1',
      activeAisles: [
        { name: 'Dairy', order: 1 },
        { name: 'Meat', order: 2 },
        { name: 'Dry goods', order: 3 },
      ],
      activateList: vi.fn((id) => { shoppingStore.activeListId = id }),
      addItem: vi.fn(),
      restoreItem: vi.fn().mockReturnValue(true),
      createList: vi.fn(),
      updateItem: vi.fn(),
      saveAisles: vi.fn(),
      deleteAisle: vi.fn(),
    })
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', role: 'parent' },
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('list selector', () => {
    it('renders all list names as chips', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Weekly shop')
      expect(wrapper.text()).toContain('Party supplies')
    })

    it('active chip has primary colour', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const active = chips.find(c => c.text().includes('Weekly shop'))
      expect(active.props('color')).toBe('primary')
    })

    it('active chip uses flat variant', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const active = chips.find(c => c.text().includes('Weekly shop'))
      expect(active.props('variant')).toBe('flat')
    })

    it('active chip shows a checkmark icon', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const active = chips.find(c => c.text().includes('Weekly shop'))
      expect(active.props('prependIcon')).toBe('mdi-check')
    })

    it('inactive chip does not have primary colour', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const inactive = chips.find(c => c.text().includes('Party supplies'))
      expect(inactive.props('color')).toBeUndefined()
    })

    it('inactive chip uses tonal variant', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const inactive = chips.find(c => c.text().includes('Party supplies'))
      expect(inactive.props('variant')).toBe('tonal')
    })

    it('inactive chip has no checkmark icon', () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const inactive = chips.find(c => c.text().includes('Party supplies'))
      expect(inactive.props('prependIcon')).toBeUndefined()
    })

    it('clicking a chip calls activateList with that list id', async () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const second = chips.find(c => c.text().includes('Party supplies'))
      await second.trigger('click')
      expect(shoppingStore.activateList).toHaveBeenCalledWith('list-2')
    })

    it('newly selected chip gains primary colour and checkmark', async () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const second = chips.find(c => c.text().includes('Party supplies'))
      await second.trigger('click')
      await wrapper.vm.$nextTick()

      const updated = listChips(wrapper)
      const nowActive = updated.find(c => c.text().includes('Party supplies'))
      expect(nowActive.props('color')).toBe('primary')
      expect(nowActive.props('prependIcon')).toBe('mdi-check')
    })

    it('previously selected chip loses primary colour and checkmark', async () => {
      const wrapper = mountView()
      const chips = listChips(wrapper)
      const second = chips.find(c => c.text().includes('Party supplies'))
      await second.trigger('click')
      await wrapper.vm.$nextTick()

      const updated = listChips(wrapper)
      const nowInactive = updated.find(c => c.text().includes('Weekly shop'))
      expect(nowInactive.props('color')).toBeUndefined()
      expect(nowInactive.props('prependIcon')).toBeUndefined()
    })
  })

  describe('empty state', () => {
    beforeEach(() => {
      shoppingStore.lists = []
      shoppingStore.activeListId = null
    })

    it('shows empty state message when there are no lists', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('No shopping list yet')
    })

    it('shows New list button to parents in the empty state', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('New list')
    })

    it('hides New list button from children in the empty state', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('New list')
    })
  })

  describe('new list', () => {
    it('shows the new list + icon button for parents when lists exist', () => {
      const wrapper = mountView()
      // The new-list btn lives inside .list-selector, not the add-item FAB
      const selector = wrapper.find('.list-selector')
      expect(selector.findComponent({ name: 'VBtn' }).exists()).toBe(true)
    })

    it('hides the new list + icon button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      const newListBtn = selector.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-plus'))
      expect(newListBtn).toBeUndefined()
    })
  })

  describe('delete list', () => {
    beforeEach(() => {
      shoppingStore.deleteList = vi.fn()
    })

    it('shows the delete button to parents', () => {
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      const deleteBtns = selector.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      expect(deleteBtns.length).toBe(1)
    })

    it('hides the delete button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const deleteBtns = wrapper.findAllComponents({ name: 'VBtn' })
        .filter(b => b.html().includes('mdi-delete-outline'))
      expect(deleteBtns.length).toBe(0)
    })

    it('opens the confirmation dialog when the delete button is clicked', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Delete list?')
    })

    it('shows the active list name in the confirmation dialog', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Weekly shop')
    })

    it('does not call deleteList when Cancel is clicked', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.deleteList).not.toHaveBeenCalled()
    })

    it('calls deleteList when Delete is confirmed', async () => {
      const wrapper = mountView()
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-delete-outline'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()

      const confirmBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Delete')
      await confirmBtn.click()

      expect(shoppingStore.deleteList).toHaveBeenCalledOnce()
    })
  })

  describe('manage aisles button', () => {
    it('shows the manage aisles button to parents', () => {
      const wrapper = mountView()
      const selector = wrapper.find('.list-selector')
      const aisleBtn = selector.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-view-list-outline'))
      expect(aisleBtn).toBeDefined()
    })

    it('hides the manage aisles button from children', () => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountView()
      const aisleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-view-list-outline'))
      expect(aisleBtn).toBeUndefined()
    })

    it('clicking the button opens the aisle manager sheet', async () => {
      const wrapper = mountView()
      const aisleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-view-list-outline'))
      await aisleBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const sheets = wrapper.findAllComponents({ name: 'VBottomSheet' })
      expect(sheets[2].props('modelValue')).toBe(true)
    })
  })

  describe('add item aisle picker', () => {
    it('renders aisle chips after opening the add-item sheet', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      expect(document.body.textContent).toContain('Dairy')
      expect(document.body.textContent).toContain('Meat')
      expect(document.body.textContent).toContain('Dry goods')
    })

    it('calls store.addItem with the default aisle on submit', async () => {
      const wrapper = mountView()
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      const inputs = [...document.body.querySelectorAll('input')]
      const nameInput = inputs.find(i => i.placeholder === '' || i.type !== 'hidden')
      if (nameInput) await nameInput.focus()

      // Directly set via component state and call submit
      wrapper.vm.itemName = 'Eggs'
      const addBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Add')
      await addBtn.click()

      expect(shoppingStore.addItem).toHaveBeenCalledWith('Eggs', '', 'Dairy')
    })
  })

  // ── Issue #49: keyboard-aware sheet positioning ─────────────────────────
  // The add-item sheet uses window.visualViewport to track keyboard height and
  // stores it as --add-item-sheet-bottom on :root. The .add-item-overlay CSS
  // rule uses that variable as margin-bottom to lift the sheet above the
  // keyboard while it is visible, and drops it back to 0px when the keyboard
  // dismisses. These tests verify the JS side of that contract.
  describe('keyboard-aware add-item sheet positioning (issue #49)', () => {
    let mockVp

    beforeEach(() => {
      // Full-screen viewport with no keyboard; innerHeight matches vp.height.
      mockVp = {
        height: 851,
        offsetTop: 0,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      Object.defineProperty(window, 'visualViewport', {
        value: mockVp, writable: true, configurable: true,
      })
      Object.defineProperty(window, 'innerHeight', {
        value: 851, writable: true, configurable: true,
      })
    })

    afterEach(() => {
      document.documentElement.style.removeProperty('--add-item-sheet-bottom')
    })

    async function openAddItemSheet(wrapper) {
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
    }

    it('registers a visualViewport resize listener when the sheet opens', async () => {
      const wrapper = mountView()
      await openAddItemSheet(wrapper)
      expect(mockVp.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('sets --add-item-sheet-bottom to 0px immediately on open when no keyboard is up', async () => {
      const wrapper = mountView()
      await openAddItemSheet(wrapper)
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
    })

    it('updates --add-item-sheet-bottom to the keyboard height when the viewport shrinks', async () => {
      const wrapper = mountView()
      await openAddItemSheet(wrapper)

      // Keyboard appears: visual viewport shrinks by 340 px
      mockVp.height = 511
      const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
      resizeCb()

      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('340px')
    })

    it('accounts for visualViewport.offsetTop in the keyboard height calculation', async () => {
      const wrapper = mountView()
      await openAddItemSheet(wrapper)

      // URL bar is visible (offsetTop=20) and keyboard is up; visible area = 491 px
      mockVp.height = 491
      mockVp.offsetTop = 20
      const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
      resizeCb()

      // keyboard = 851 - 491 - 20 = 340 px
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('340px')
    })

    it('clamps --add-item-sheet-bottom to 0px when the visual viewport is larger than the window', async () => {
      const wrapper = mountView()
      await openAddItemSheet(wrapper)

      mockVp.height = 900  // edge case: vv.height > innerHeight, no keyboard
      const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
      resizeCb()

      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
    })

    it('resets --add-item-sheet-bottom to 0px and removes the listener when the sheet closes', async () => {
      const wrapper = mountView()
      await openAddItemSheet(wrapper)

      // Keyboard appears
      mockVp.height = 511
      const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
      resizeCb()
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('340px')

      // User taps Cancel — sheet closes
      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
      expect(mockVp.removeEventListener).toHaveBeenCalledWith('resize', resizeCb)
    })

    it('does not throw and defaults to 0px when window.visualViewport is unavailable', async () => {
      Object.defineProperty(window, 'visualViewport', {
        value: null, writable: true, configurable: true,
      })
      const wrapper = mountView()
      await expect(openAddItemSheet(wrapper)).resolves.not.toThrow()
      expect(document.documentElement.style.getPropertyValue('--add-item-sheet-bottom')).toBe('0px')
    })
  })

  describe('done-item suggestions (issue #29)', () => {
    const doneItem = { id: 'done-1', name: 'Milk', qty: '2 pints', aisle: 'Dairy', done: true }
    const activeItem = { id: 'active-1', name: 'Bread', qty: '', aisle: 'Bakery', done: false }

    async function openSheet(wrapper) {
      const fab = wrapper.findAllComponents({ name: 'VBtn' }).find(b => b.classes('fab'))
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
    }

    it('shows no suggestion chips when name field is empty', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      expect(document.body.textContent).not.toContain('Re-add')
    })

    it('shows no suggestion chips when no done items match the typed text', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'xyz'
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).not.toContain('Re-add')
    })

    it('shows suggestion chips for done items matching the typed text', async () => {
      shoppingStore.items = [doneItem, activeItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'mil'
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Re-add')
      expect(document.body.textContent).toContain('Milk')
    })

    it('does not suggest active (not-done) items', async () => {
      shoppingStore.items = [activeItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'Bread'
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).not.toContain('Re-add')
    })

    it('matching is case-insensitive', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'MIL'
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Milk')
    })

    it('tapping a suggestion chip fills in name, qty, and selects the correct aisle', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'mil'
      await wrapper.vm.$nextTick()

      const suggestionChips = [...document.body.querySelectorAll('.v-chip')]
        .filter(c => c.textContent.trim() === 'Milk')
      expect(suggestionChips.length).toBeGreaterThan(0)
      await suggestionChips[0].click()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.itemName).toBe('Milk')
      expect(wrapper.vm.itemQty).toBe('2 pints')
      expect(wrapper.vm.itemAisle).toBe('Dairy')
    })

    it('submitting after selecting a suggestion calls restoreItem, not addItem', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'mil'
      await wrapper.vm.$nextTick()

      const suggestionChips = [...document.body.querySelectorAll('.v-chip')]
        .filter(c => c.textContent.trim() === 'Milk')
      await suggestionChips[0].click()
      await wrapper.vm.$nextTick()

      const addBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Add')
      await addBtn.click()

      expect(shoppingStore.restoreItem).toHaveBeenCalledWith('done-1', '2 pints', 'Dairy')
      expect(shoppingStore.addItem).not.toHaveBeenCalled()
    })

    it('falls back to addItem if restoreItem returns false (item deleted concurrently)', async () => {
      shoppingStore.items = [doneItem]
      shoppingStore.restoreItem.mockReturnValue(false)
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'mil'
      await wrapper.vm.$nextTick()

      const suggestionChips = [...document.body.querySelectorAll('.v-chip')]
        .filter(c => c.textContent.trim() === 'Milk')
      await suggestionChips[0].click()
      await wrapper.vm.$nextTick()

      const addBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Add')
      await addBtn.click()

      expect(shoppingStore.addItem).toHaveBeenCalledWith('Milk', '2 pints', 'Dairy')
    })

    it('clears selectedDoneItem and uses addItem when name is changed after chip selection', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'mil'
      await wrapper.vm.$nextTick()

      const suggestionChips = [...document.body.querySelectorAll('.v-chip')]
        .filter(c => c.textContent.trim() === 'Milk')
      await suggestionChips[0].click()
      await wrapper.vm.$nextTick()

      // User edits the name away from the suggestion
      wrapper.vm.itemName = 'Milk full fat'
      await wrapper.vm.$nextTick()

      const addBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Add')
      await addBtn.click()

      expect(shoppingStore.restoreItem).not.toHaveBeenCalled()
      expect(shoppingStore.addItem).toHaveBeenCalledWith('Milk full fat', expect.any(String), expect.anything())
    })

    it('resets selectedDoneItem when the sheet closes', async () => {
      shoppingStore.items = [doneItem]
      const wrapper = mountView()
      await openSheet(wrapper)
      wrapper.vm.itemName = 'mil'
      await wrapper.vm.$nextTick()

      const suggestionChips = [...document.body.querySelectorAll('.v-chip')]
        .filter(c => c.textContent.trim() === 'Milk')
      await suggestionChips[0].click()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.selectedDoneItem).not.toBeNull()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(wrapper.vm.selectedDoneItem).toBeNull()
    })
  })

  describe('toggle aisle headers (issue #65)', () => {
    const STORAGE_KEY = 'shoppingHeadersVisible_parent-uid'

    beforeEach(() => {
      localStorage.removeItem(STORAGE_KEY)
    })

    afterEach(() => {
      localStorage.removeItem(STORAGE_KEY)
    })

    it('shows the toggle header button when lists exist', () => {
      const wrapper = mountView()
      const toggleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline'))
      expect(toggleBtn).toBeDefined()
    })

    it('headers are shown by default (mdi-label-outline icon)', () => {
      const wrapper = mountView()
      const toggleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline'))
      expect(toggleBtn).toBeDefined()
    })

    it('passes showHeaders=true to ShoppingList by default', () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      expect(list.props('showHeaders')).toBe(true)
    })

    it('clicking the toggle hides headers and updates icon to mdi-label-off-outline', async () => {
      const wrapper = mountView()
      const toggleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline'))
      await toggleBtn.trigger('click')
      await wrapper.vm.$nextTick()

      const updatedBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-off-outline'))
      expect(updatedBtn).toBeDefined()
    })

    it('passes showHeaders=false to ShoppingList after toggling off', async () => {
      const wrapper = mountView()
      const toggleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline'))
      await toggleBtn.trigger('click')
      await wrapper.vm.$nextTick()

      const list = wrapper.findComponent({ name: 'ShoppingList' })
      expect(list.props('showHeaders')).toBe(false)
    })

    it('toggling twice restores showHeaders=true', async () => {
      const wrapper = mountView()
      const findToggle = () => wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline') || b.html().includes('mdi-label-off-outline'))

      await findToggle().trigger('click')
      await wrapper.vm.$nextTick()
      await findToggle().trigger('click')
      await wrapper.vm.$nextTick()

      const list = wrapper.findComponent({ name: 'ShoppingList' })
      expect(list.props('showHeaders')).toBe(true)
    })

    it('persists hidden state to localStorage with a per-user key', async () => {
      const wrapper = mountView()
      const toggleBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.html().includes('mdi-label-outline'))
      await toggleBtn.trigger('click')

      expect(localStorage.getItem(STORAGE_KEY)).toBe('false')
    })

    it('restores hidden state from localStorage on mount', () => {
      localStorage.setItem(STORAGE_KEY, 'false')
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      expect(list.props('showHeaders')).toBe(false)
    })
  })

  describe('edit item sheet', () => {
    it('does not show the edit sheet initially', () => {
      mountView()
      expect(document.body.textContent).not.toContain('Edit item')
    })

    it('opens the edit sheet when ShoppingList emits edit', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Edit item')
    })

    it('pre-populates name and qty fields from the emitted item', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const inputs = [...document.body.querySelectorAll('input')]
      expect(inputs.some(i => i.value === 'Milk')).toBe(true)
      expect(inputs.some(i => i.value === '2 pints')).toBe(true)
    })

    it('calls store.updateItem with trimmed name and qty on Save', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const saveBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()

      expect(shoppingStore.updateItem).toHaveBeenCalledWith('item-1', {
        name: 'Milk',
        qty: '2 pints',
        aisle: 'Dairy',
      })
    })

    it('closes the edit sheet after Save', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const saveBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()
      await wrapper.vm.$nextTick()

      // Sheet order in template: 0=item (add/edit shared), 1=new-list
      // Vuetify unmounts slot content when closed, so find by index and check modelValue
      const sheets = wrapper.findAllComponents({ name: 'VBottomSheet' })
      expect(sheets[0].props('modelValue')).toBe(false)
    })

    it('does not call updateItem when name is blank', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: '  ', qty: '' })
      await wrapper.vm.$nextTick()

      const saveBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Save')
      await saveBtn.click()

      expect(shoppingStore.updateItem).not.toHaveBeenCalled()
    })

    it('closes the edit sheet on Cancel without calling updateItem', async () => {
      const wrapper = mountView()
      const list = wrapper.findComponent({ name: 'ShoppingList' })
      await list.vm.$emit('edit', { id: 'item-1', name: 'Milk', qty: '2 pints' })
      await wrapper.vm.$nextTick()

      const cancelBtn = [...document.body.querySelectorAll('button')]
        .find(b => b.textContent.trim() === 'Cancel')
      await cancelBtn.click()
      await wrapper.vm.$nextTick()

      expect(shoppingStore.updateItem).not.toHaveBeenCalled()
      // Sheet order in template: 0=item (add/edit shared), 1=new-list
      const sheets = wrapper.findAllComponents({ name: 'VBottomSheet' })
      expect(sheets[0].props('modelValue')).toBe(false)
    })
  })
})
