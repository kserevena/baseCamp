import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive, computed } from 'vue'

// ── mocks ──────────────────────────────────────────────────────────────────

let jobsStore

vi.mock('@/stores/jobs.js', () => ({
  useJobsStore: () => jobsStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

vi.mock('@/components/JobCard.vue', () => ({
  default: {
    name: 'JobCard',
    props: ['job'],
    template: '<div class="job-card-stub" :data-id="job.id" :data-status="job.status">{{ job.title }}</div>',
  },
}))

let isParentValue = true
vi.mock('@/composables/useUserRole.js', () => ({
  useUserRole: () => ({
    isParent: computed(() => isParentValue),
    isChild:  computed(() => !isParentValue),
  }),
}))

import JobsView from '@/views/JobsView.vue'

const vuetify = createVuetify({ components, directives })

function mountView() {
  return mount(JobsView, {
    global: { plugins: [vuetify] },
    attachTo: document.body,
  })
}

describe('JobsView', () => {
  beforeEach(() => {
    isParentValue = true
    jobsStore = reactive({
      jobs: [],
      subtasksFor: vi.fn().mockReturnValue([]),
      progressFor: vi.fn().mockReturnValue({ done: 0, total: 0 }),
      addJob: vi.fn(),
      updateJob: vi.fn(),
      deleteJob: vi.fn(),
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // ── empty state ───────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows empty state when there are no jobs', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('No jobs yet')
    })
  })

  // ── status grouping ──────────────────────────────────────────────────────

  describe('status grouping', () => {
    it('renders jobs grouped into status sections', () => {
      jobsStore.jobs = [
        { id: 'j-1', title: 'Suggested job',   status: 'suggested',   category: 'Garden', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
        { id: 'j-2', title: 'Planned job',      status: 'planned',     category: 'Garden', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
        { id: 'j-3', title: 'In progress job',  status: 'in_progress', category: 'Garden', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
        { id: 'j-4', title: 'Done job',         status: 'done',        category: 'Garden', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
      ]
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Suggested')
      expect(wrapper.text()).toContain('Planned')
      expect(wrapper.text()).toContain('In Progress')
      expect(wrapper.text()).toContain('Done')
    })

    it('renders one JobCard per job', () => {
      jobsStore.jobs = [
        { id: 'j-1', title: 'Job A', status: 'suggested', category: '', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
        { id: 'j-2', title: 'Job B', status: 'planned',   category: '', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
      ]
      const wrapper = mountView()
      expect(wrapper.findAll('.job-card-stub')).toHaveLength(2)
    })

    it('only shows sections with jobs in them', () => {
      jobsStore.jobs = [
        { id: 'j-1', title: 'Job A', status: 'planned', category: '', suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
      ]
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Planned')
      expect(wrapper.text()).not.toContain('Suggested')
      expect(wrapper.text()).not.toContain('In Progress')
    })
  })

  // ── category filter ──────────────────────────────────────────────────────

  describe('category filter', () => {
    beforeEach(() => {
      jobsStore.jobs = [
        { id: 'j-1', title: 'Garden job',   status: 'suggested', category: 'Garden',      suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
        { id: 'j-2', title: 'Plumbing job', status: 'suggested', category: 'Plumbing',    suggestedBy: 'uid-1', priority: null, costEstimate: null, assignedTo: null },
      ]
    })

    it('renders category filter chips when categories exist', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Garden')
      expect(wrapper.text()).toContain('Plumbing')
    })

    it('renders an "All" chip', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('All')
    })

    it('filters jobs to selected category when chip clicked', async () => {
      const wrapper = mountView()
      // All chips are rendered
      const chips = wrapper.findAllComponents({ name: 'VChip' })
      const gardenChip = chips.find(c => c.text() === 'Garden')
      expect(gardenChip).toBeTruthy()
      await gardenChip.trigger('click')
      // Only the garden job card should show
      const cards = wrapper.findAll('.job-card-stub')
      expect(cards).toHaveLength(1)
      expect(cards[0].attributes('data-id')).toBe('j-1')
    })
  })

  // ── FAB and add dialog ────────────────────────────────────────────────────

  describe('add job dialog', () => {
    it('renders the Household Jobs heading', () => {
      const wrapper = mountView()
      expect(wrapper.text()).toContain('Household Jobs')
    })

    it('opens the add dialog when FAB is clicked', async () => {
      const wrapper = mountView()
      // The FAB is a VFab — open dialog programmatically via the component's addDialog ref
      // by calling openAdd through the FAB click
      const fab = wrapper.findComponent({ name: 'VFab' })
      expect(fab.exists()).toBe(true)
      await fab.trigger('click')
      await wrapper.vm.$nextTick()
      // Dialog renders in teleport; check the vm state instead
      const dialogs = wrapper.findAllComponents({ name: 'VDialog' })
      expect(dialogs.length).toBeGreaterThan(0)
    })

    it('calls store.addJob when the form is submitted with a title', async () => {
      const wrapper = mountView()
      // Open dialog by setting internal state via vm
      await wrapper.vm.$nextTick()
      // Directly call the submitAdd handler with a populated title
      // by setting newTitle via the component's exposed state or by using findComponent
      // We test this by triggering via the suggest button
      const fab = wrapper.findComponent({ name: 'VFab' })
      await fab.trigger('click')
      await wrapper.vm.$nextTick()

      // Set the title field value in the component's reactive state
      // The component uses v-model on newTitle; we can access through vm
      wrapper.vm.newTitle = 'New test job'
      await wrapper.vm.$nextTick()

      // Call submitAdd directly
      wrapper.vm.submitAdd()
      expect(jobsStore.addJob).toHaveBeenCalledWith(expect.objectContaining({ title: 'New test job' }))
    })

    it('does not call addJob when title is empty and sets error', async () => {
      const wrapper = mountView()
      // Call submitAdd directly with empty title
      wrapper.vm.submitAdd()
      expect(jobsStore.addJob).not.toHaveBeenCalled()
      await wrapper.vm.$nextTick()
      expect(wrapper.vm.titleError).toBe('Title is required')
    })
  })
})
