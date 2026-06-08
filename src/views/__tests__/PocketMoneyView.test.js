import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive, ref, computed } from 'vue'

let pocketMoneyStore
let familyStore

vi.mock('@/stores/pocketMoney.js', () => ({
  usePocketMoneyStore: () => pocketMoneyStore,
}))

vi.mock('@/stores/family.js', () => ({
  useFamilyStore: () => familyStore,
}))

vi.mock('@/components/FamilyAvatar.vue', () => ({
  default: { props: ['uid', 'size'], template: '<div class="avatar-stub" />' },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import PocketMoneyView from '@/views/PocketMoneyView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(PocketMoneyView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

const child1 = { uid: 'child-uid',  name: 'Alice', role: 'child' }
const child2 = { uid: 'child2-uid', name: 'Bob',   role: 'child' }

function makeDisplayBalance(uid, value) {
  return computed(() => (id) => id === uid ? value : null)
}

describe('PocketMoneyView', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    pocketMoneyStore = reactive({
      snapshots: [],
      transactions: [],
      transactionsUid: null,
      loading: false,
      displayBalance: computed(() => (_uid) => null),
      flushPendingPayments: vi.fn().mockResolvedValue(undefined),
      saveConfig: vi.fn().mockResolvedValue(undefined),
      recordWithdrawal: vi.fn().mockResolvedValue(undefined),
      loadTransactions: vi.fn().mockResolvedValue(undefined),
      pendingPaymentDates: vi.fn().mockReturnValue([]),
    })

    familyStore = reactive({
      currentUser: { uid: 'parent-uid', role: 'parent' },
      members: [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        child1,
        child2,
      ],
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  // ── Parent view ────────────────────────────────────────────────────────────

  describe('parent view', () => {
    it('shows both children in the list', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Alice')
      expect(wrapper.text()).toContain('Bob')
    })

    it('shows "Not set up" for a child with no snapshot', () => {
      const wrapper = mountView()
      // displayBalance returns null for all → "Not set up"
      expect(wrapper.text()).toContain('Not set up')
    })

    it('shows the formatted balance when snapshot exists', () => {
      pocketMoneyStore.displayBalance = computed(() => (uid) =>
        uid === 'child-uid' ? 12.5 : null
      )
      const wrapper = mountView()
      expect(wrapper.text()).toContain('£12.50')
    })

    it('shows "No children" message when family has no children', () => {
      familyStore.members = [{ uid: 'parent-uid', name: 'Parent', role: 'parent' }]
      const wrapper = mountView()
      expect(wrapper.text()).toContain('No children')
    })

    it('calls flushPendingPayments when a child row is tapped', async () => {
      const wrapper = mountView()
      // Find the list item for Alice and click it
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      expect(pocketMoneyStore.flushPendingPayments).toHaveBeenCalledWith('child-uid')
    })

    it('does not show withdrawal or settings buttons by default (detail sheet closed)', () => {
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('Record withdrawal')
      expect(wrapper.text()).not.toContain('Settings')
    })

    it('shows settings and withdrawal buttons inside the detail sheet after opening', async () => {
      const wrapper = mountView()
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()
      expect(document.body.textContent).toContain('Settings')
      expect(document.body.textContent).toContain('Record withdrawal')
    })

    it('shows "Starting amount" field in settings when no snapshot exists (first setup)', async () => {
      pocketMoneyStore.snapshots = []
      const wrapper = mountView()

      // Open detail sheet
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()

      // Open settings dialog
      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const settingsBtn = btns.find(b => b.text().includes('Settings'))
      await settingsBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(document.body.textContent).toContain('Starting amount')
    })

    it('hides "Starting amount" field when snapshot already exists', async () => {
      pocketMoneyStore.snapshots = [
        { uid: 'child-uid', weeklyAmount: 5, paymentDay: 5, balance: 10 },
      ]
      const wrapper = mountView()

      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()

      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const settingsBtn = btns.find(b => b.text().includes('Settings'))
      await settingsBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(document.body.textContent).not.toContain('Starting amount')
    })

    it('calls saveConfig with correct args when settings are saved', async () => {
      pocketMoneyStore.snapshots = []
      const wrapper = mountView()

      // Open detail sheet then settings dialog
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()
      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const settingsBtn = btns.find(b => b.text().includes('Settings'))
      await settingsBtn.trigger('click')
      await wrapper.vm.$nextTick()

      // Fill in fields
      const fields = wrapper.findAllComponents({ name: 'VTextField' })
      const weeklyField = fields.find(f => f.props('label')?.includes('Weekly'))
      if (weeklyField) await weeklyField.setValue('5')

      // Click Save
      const dialogBtns = wrapper.findAllComponents({ name: 'VBtn' })
      const saveBtn = dialogBtns.find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(pocketMoneyStore.saveConfig).toHaveBeenCalledWith(
        'child-uid',
        expect.objectContaining({ weeklyAmount: 5 }),
      )
    })

    it('shows error alert when saveConfig throws', async () => {
      pocketMoneyStore.saveConfig = vi.fn().mockRejectedValue(new Error('PERMISSION_DENIED'))
      pocketMoneyStore.snapshots = []
      const wrapper = mountView()

      // Open detail sheet then settings dialog
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()
      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const settingsBtn = btns.find(b => b.text().includes('Settings'))
      await settingsBtn.trigger('click')
      await wrapper.vm.$nextTick()

      // Click Save
      const dialogBtns = wrapper.findAllComponents({ name: 'VBtn' })
      const saveBtn = dialogBtns.find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(document.body.textContent).toContain('Failed to save. Try again.')
    })

    it('calls recordWithdrawal when withdrawal is confirmed', async () => {
      pocketMoneyStore.displayBalance = computed(() => (uid) =>
        uid === 'child-uid' ? 20 : null
      )
      pocketMoneyStore.snapshots = [
        { uid: 'child-uid', weeklyAmount: 5, paymentDay: 5, balance: 20 },
      ]
      const wrapper = mountView()

      // Open detail then withdrawal dialog
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()
      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const withdrawBtn = btns.find(b => b.text().includes('withdrawal'))
      await withdrawBtn.trigger('click')
      await wrapper.vm.$nextTick()

      // Set amount
      const fields = wrapper.findAllComponents({ name: 'VTextField' })
      const amountField = fields.find(f => f.props('label')?.includes('Amount'))
      if (amountField) await amountField.setValue('5')

      // Confirm
      const dialogBtns = wrapper.findAllComponents({ name: 'VBtn' })
      const confirmBtn = dialogBtns.find(b => b.text() === 'Confirm')
      await confirmBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(pocketMoneyStore.recordWithdrawal).toHaveBeenCalledWith(
        'child-uid',
        expect.objectContaining({ amount: 5 }),
      )
    })

    it('calls loadTransactions when View history is tapped', async () => {
      const wrapper = mountView()

      // Open detail sheet
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const aliceItem = items.find(i => i.text().includes('Alice'))
      await aliceItem.trigger('click')
      await wrapper.vm.$nextTick()

      // Click history button
      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const historyBtn = btns.find(b => b.text().includes('history'))
      await historyBtn.trigger('click')
      await wrapper.vm.$nextTick()

      expect(pocketMoneyStore.loadTransactions).toHaveBeenCalledWith('child-uid')
    })
  })

  // ── Child view ─────────────────────────────────────────────────────────────

  describe('child view', () => {
    beforeEach(() => {
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      familyStore.members = [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        child1,
      ]
      pocketMoneyStore.snapshots = [
        { uid: 'child-uid', weeklyAmount: 5, paymentDay: 5, balance: 10,
          lastUpdated: { toDate: () => new Date('2025-01-01') } },
      ]
      pocketMoneyStore.displayBalance = computed(() => (uid) =>
        uid === 'child-uid' ? 10 : null
      )
    })

    it('shows the child\'s own balance', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('£10.00')
    })

    it('does not show other children\'s names', () => {
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('Bob')
    })

    it('does not show Record withdrawal button', () => {
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('Record withdrawal')
    })

    it('does not show Settings button', () => {
      const wrapper = mountView()
      expect(wrapper.text()).not.toContain('Settings')
    })

    it('does NOT call flushPendingPayments', () => {
      mountView()
      expect(pocketMoneyStore.flushPendingPayments).not.toHaveBeenCalled()
    })

    it('calls loadTransactions when View history is tapped', async () => {
      const wrapper = mountView()
      const btns = wrapper.findAllComponents({ name: 'VBtn' })
      const historyBtn = btns.find(b => b.text().includes('history'))
      await historyBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(pocketMoneyStore.loadTransactions).toHaveBeenCalledWith('child-uid')
    })

    it('shows a pending chip when childPendingAmount > 0', () => {
      pocketMoneyStore.pendingPaymentDates.mockReturnValue([new Date(), new Date()])
      const wrapper = mountView()
      expect(wrapper.text()).toContain('pending')
    })
  })
})
