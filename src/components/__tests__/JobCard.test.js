import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive, computed } from 'vue'

// ── store mocks ────────────────────────────────────────────────────────────

let jobsStore
let familyStore

vi.mock('@/stores/jobs.js', () => ({
  useJobsStore: () => jobsStore,
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

vi.mock('@/components/JobSubtasks.vue', () => ({
  default: {
    name: 'JobSubtasks',
    props: ['jobId'],
    template: '<div class="job-subtasks-stub" />',
  },
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

// Simulate useUserRole by mocking the composable
let isParentValue = true
vi.mock('@/composables/useUserRole.js', () => ({
  useUserRole: () => ({
    isParent: computed(() => isParentValue),
    isChild:  computed(() => !isParentValue),
  }),
}))

import JobCard from '@/components/JobCard.vue'

const vuetify = createVuetify({ components, directives })

function makeJob(overrides = {}) {
  return {
    id: 'job-1',
    title: 'Fix the fence',
    description: 'The back garden fence is broken.',
    category: 'Garden',
    status: 'suggested',
    priority: 'high',
    costEstimate: 150,
    suggestedBy: 'parent-uid',
    assignedTo: null,
    ...overrides,
  }
}

function mountCard(job = makeJob()) {
  return mount(JobCard, {
    props: { job },
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('JobCard', () => {
  beforeEach(() => {
    isParentValue = true
    jobsStore = reactive({
      subtasksFor: vi.fn().mockReturnValue([]),
      progressFor: vi.fn().mockReturnValue({ done: 0, total: 0 }),
      updateJob:   vi.fn(),
      deleteJob:   vi.fn(),
      addSubtask:  vi.fn(),
      toggleSubtask: vi.fn(),
      subtasks: [],
    })
    familyStore = reactive({
      currentUser: { uid: 'parent-uid', role: 'parent' },
      members: [
        { uid: 'parent-uid', name: 'Dad', colour: '#378ADD' },
        { uid: 'child-uid',  name: 'Ella', colour: '#D4537E' },
      ],
      memberName: (uid) => familyStore.members.find(m => m.uid === uid)?.name ?? 'Unknown',
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // ── collapsed view ────────────────────────────────────────────────────────

  describe('collapsed view', () => {
    it('renders the job title', () => {
      const wrapper = mountCard()
      expect(wrapper.text()).toContain('Fix the fence')
    })

    it('renders the category chip', () => {
      const wrapper = mountCard()
      expect(wrapper.text()).toContain('Garden')
    })

    it('renders the priority badge', () => {
      const wrapper = mountCard()
      expect(wrapper.text()).toContain('high')
    })

    it('renders cost estimate chip when set', () => {
      const wrapper = mountCard()
      // formatGBP(150) → £150.00
      expect(wrapper.text()).toContain('150')
    })

    it('does not render cost estimate chip when null', () => {
      const wrapper = mountCard(makeJob({ costEstimate: null }))
      expect(wrapper.text()).not.toContain('£')
    })

    it('renders progress chip when subtasks exist', () => {
      jobsStore.progressFor.mockReturnValue({ done: 2, total: 5 })
      const wrapper = mountCard()
      expect(wrapper.text()).toContain('2')
      expect(wrapper.text()).toContain('5')
    })

    it('does not render progress chip when no subtasks', () => {
      jobsStore.progressFor.mockReturnValue({ done: 0, total: 0 })
      const wrapper = mountCard()
      // no progress chip with "/ 0" pattern
      expect(wrapper.text()).not.toContain('0 / 0')
    })

    it('does not render the creator avatar in the collapsed view', () => {
      const wrapper = mountCard(makeJob({ suggestedBy: 'parent-uid', assignedTo: 'child-uid' }))
      // Collapsed (not expanded): only the assignee avatar should be present,
      // never the creator/suggester.
      const avatars = wrapper.findAll('.avatar-stub[data-uid]')
      const uids = avatars.map(a => a.attributes('data-uid'))
      expect(uids).not.toContain('parent-uid')
    })

    it('renders assignee avatar when assignedTo is set', () => {
      const wrapper = mountCard(makeJob({ assignedTo: 'child-uid' }))
      const avatars = wrapper.findAll('.avatar-stub')
      const assigneeAvatar = avatars.find(a => a.attributes('data-uid') === 'child-uid')
      expect(assigneeAvatar).toBeTruthy()
    })

    it('renders an Unassigned placeholder when assignedTo is null', () => {
      const wrapper = mountCard(makeJob({ assignedTo: null, suggestedBy: 'parent-uid' }))
      // No FamilyAvatar in the collapsed avatar slot, but a placeholder is shown
      const avatars = wrapper.findAll('.avatar-stub[data-uid]')
      expect(avatars).toHaveLength(0)
      expect(wrapper.find('[title="Unassigned"]').exists()).toBe(true)
    })
  })

  // ── expand / collapse ────────────────────────────────────────────────────

  describe('expand / collapse', () => {
    it('renders JobSubtasks when expanded', async () => {
      const wrapper = mountCard()
      // Not expanded initially
      expect(wrapper.find('.job-subtasks-stub').exists()).toBe(false)
      // Click the expand button
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.find('.job-subtasks-stub').exists()).toBe(true)
    })

    it('hides description when collapsed', () => {
      const wrapper = mountCard()
      expect(wrapper.text()).not.toContain('The back garden fence is broken.')
    })

    it('shows description when expanded', async () => {
      const wrapper = mountCard()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).toContain('The back garden fence is broken.')
    })

    it('hides the "Created by" line when collapsed', () => {
      const wrapper = mountCard(makeJob({ suggestedBy: 'parent-uid' }))
      expect(wrapper.text()).not.toContain('Created by')
    })

    it('shows "Created by" with the creator name and avatar when expanded', async () => {
      const wrapper = mountCard(makeJob({ suggestedBy: 'parent-uid' }))
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).toContain('Created by')
      expect(wrapper.text()).toContain('Dad')
      // Creator's FamilyAvatar is rendered in the expanded body
      const avatars = wrapper.findAll('.avatar-stub[data-uid]')
      expect(avatars.some(a => a.attributes('data-uid') === 'parent-uid')).toBe(true)
    })
  })

  // ── parent controls ──────────────────────────────────────────────────────

  describe('parent-only controls', () => {
    it('renders Edit and Delete buttons for parents when expanded', async () => {
      isParentValue = true
      const wrapper = mountCard()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).toContain('Edit')
      expect(wrapper.text()).toContain('Delete')
    })

    it('opens a confirmation dialog before deleting (does not delete immediately)', async () => {
      isParentValue = true
      const wrapper = mountCard()
      const expandBtn = wrapper.findComponent({ name: 'VBtn' })
      await expandBtn.trigger('click')
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Delete'))
      expect(deleteBtn).toBeTruthy()
      await deleteBtn.trigger('click')
      // Clicking Delete only opens the dialog — deleteJob must NOT have run yet
      expect(jobsStore.deleteJob).not.toHaveBeenCalled()
    })

    it('calls deleteJob when the delete is confirmed in the dialog', async () => {
      isParentValue = true
      const wrapper = mountCard()
      const expandBtn = wrapper.findComponent({ name: 'VBtn' })
      await expandBtn.trigger('click')
      // Open the confirmation dialog
      const deleteBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Delete'))
      await deleteBtn.trigger('click')
      await wrapper.vm.$nextTick()
      // Confirm — the dialog's flat error "Delete" button
      const confirmBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Delete') && b.props('variant') === 'flat')
      expect(confirmBtn).toBeTruthy()
      await confirmBtn.trigger('click')
      expect(jobsStore.deleteJob).toHaveBeenCalledWith('job-1')
    })
  })

  // ── child view ───────────────────────────────────────────────────────────

  describe('child view (non-parent)', () => {
    beforeEach(() => {
      isParentValue = false
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
    })

    it('does not show Delete button for children', async () => {
      const wrapper = mountCard()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).not.toContain('Delete')
    })

    it('does not show status or priority selects for children', async () => {
      const wrapper = mountCard()
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.findAllComponents({ name: 'VSelect' })).toHaveLength(0)
    })

    it('shows edit button for child who suggested their own still-suggested job', async () => {
      const wrapper = mountCard(makeJob({ suggestedBy: 'child-uid', status: 'suggested' }))
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).toContain('Edit')
    })

    it('does not show edit button for child on another user\'s job', async () => {
      const wrapper = mountCard(makeJob({ suggestedBy: 'parent-uid', status: 'suggested' }))
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).not.toContain('Edit')
    })

    it('does not show edit button for child on their own non-suggested job', async () => {
      const wrapper = mountCard(makeJob({ suggestedBy: 'child-uid', status: 'planned' }))
      const btn = wrapper.findComponent({ name: 'VBtn' })
      await btn.trigger('click')
      expect(wrapper.text()).not.toContain('Edit')
    })
  })
})
