import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive, computed } from 'vue'
import { JOB_STATUSES, JOB_STATUS_LABELS, JOB_PRIORITIES } from '@/constants/jobs.js'

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

async function expandCard(wrapper) {
  const btn = wrapper.findComponent({ name: 'VBtn' })
  await btn.trigger('click')
}

async function openEditDialog(wrapper) {
  await expandCard(wrapper)
  const editBtn = wrapper.findAllComponents({ name: 'VBtn' })
    .find(b => b.text() === 'Edit')
  await editBtn.trigger('click')
  await wrapper.vm.$nextTick()
}

// v-dialog content stays in the DOM (hidden) after closing, so we must check
// the v-model prop rather than DOM text presence to know whether it's open.
// Identify the edit dialog by its rendered title rather than array position,
// since a positional index would silently point at the wrong dialog if the
// template's dialog order ever changed. (VDialog's own wrapper.text() is
// always empty because its root element is a Teleport anchor, not the
// teleported content — but findComponent still reaches the real, relocated
// VCardTitle node via the component tree.)
function isEditDialogOpen(wrapper) {
  const dialog = wrapper.findAllComponents({ name: 'VDialog' }).find(d => {
    const title = d.findComponent({ name: 'VCardTitle' })
    return title.exists() && title.text() === 'Edit job'
  })
  return dialog?.props('modelValue')
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

  // ── edit dialog ──────────────────────────────────────────────────────────

  describe('edit dialog', () => {
    it('pre-fills title, description, category and cost from the job prop', async () => {
      const wrapper = mountCard(makeJob({
        title: 'Fix the fence',
        description: 'The back garden fence is broken.',
        category: 'Garden',
        costEstimate: 150,
      }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const titleField = textFields.find(f => f.props('label') === 'Title')
      const categoryField = textFields.find(f => f.props('label') === 'Category')
      const costField = textFields.find(f => f.props('label') === 'Cost estimate (£)')
      const descriptionField = wrapper.findComponent({ name: 'VTextarea' })
      expect(titleField.props('modelValue')).toBe('Fix the fence')
      expect(descriptionField.props('modelValue')).toBe('The back garden fence is broken.')
      expect(categoryField.props('modelValue')).toBe('Garden')
      expect(costField.props('modelValue')).toBe('150')
    })

    it('pre-fills blank strings for unset description, category and cost', async () => {
      const wrapper = mountCard(makeJob({ description: null, category: null, costEstimate: null }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const categoryField = textFields.find(f => f.props('label') === 'Category')
      const costField = textFields.find(f => f.props('label') === 'Cost estimate (£)')
      const descriptionField = wrapper.findComponent({ name: 'VTextarea' })
      expect(descriptionField.props('modelValue')).toBe('')
      expect(categoryField.props('modelValue')).toBe('')
      expect(costField.props('modelValue')).toBe('')
    })

    it('does not show category/cost fields for a non-parent editor', async () => {
      isParentValue = false
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountCard(makeJob({ suggestedBy: 'child-uid', status: 'suggested' }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      expect(textFields.find(f => f.props('label') === 'Category')).toBeFalsy()
      expect(textFields.find(f => f.props('label') === 'Cost estimate (£)')).toBeFalsy()
    })

    it('saves title/description plus parent-only category/costEstimate on Save', async () => {
      const wrapper = mountCard(makeJob({ title: 'Fix the fence' }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const titleField = textFields.find(f => f.props('label') === 'Title')
      const categoryField = textFields.find(f => f.props('label') === 'Category')
      const costField = textFields.find(f => f.props('label') === 'Cost estimate (£)')
      await titleField.find('input').setValue('Fix the gate')
      await categoryField.find('input').setValue('Outdoor')
      await costField.find('input').setValue('75.50')
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', {
        title: 'Fix the gate',
        description: 'The back garden fence is broken.',
        category: 'Outdoor',
        costEstimate: 75.5,
      })
    })

    it('closes the dialog after a successful save', async () => {
      const wrapper = mountCard()
      await openEditDialog(wrapper)
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(isEditDialogOpen(wrapper)).toBe(false)
    })

    it('sets costEstimate to null when the cost field is not a valid number', async () => {
      const wrapper = mountCard(makeJob({ costEstimate: 150 }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const costField = textFields.find(f => f.props('label') === 'Cost estimate (£)')
      await costField.find('input').setValue('')
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({
        costEstimate: null,
      }))
    })

    it('does not save and keeps the dialog open when title is blank', async () => {
      const wrapper = mountCard()
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const titleField = textFields.find(f => f.props('label') === 'Title')
      await titleField.find('input').setValue('   ')
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      expect(jobsStore.updateJob).not.toHaveBeenCalled()
      expect(isEditDialogOpen(wrapper)).toBe(true)
    })

    it('trims title and blanks an empty description to null on save', async () => {
      const wrapper = mountCard(makeJob({ title: 'Fix the fence', description: 'old' }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const titleField = textFields.find(f => f.props('label') === 'Title')
      await titleField.find('input').setValue('  Fix the gate  ')
      const descriptionField = wrapper.findComponent({ name: 'VTextarea' })
      await descriptionField.find('textarea').setValue('   ')
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', expect.objectContaining({
        title: 'Fix the gate',
        description: null,
      }))
    })

    it('does not call updateJob when Cancel is clicked, and closes the dialog', async () => {
      const wrapper = mountCard()
      await openEditDialog(wrapper)
      const cancelBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Cancel')
      await cancelBtn.trigger('click')
      await wrapper.vm.$nextTick()
      expect(jobsStore.updateJob).not.toHaveBeenCalled()
      expect(isEditDialogOpen(wrapper)).toBe(false)
    })

    it('lets a child who suggested the job edit title/description without category/cost', async () => {
      isParentValue = false
      familyStore.currentUser = { uid: 'child-uid', role: 'child' }
      const wrapper = mountCard(makeJob({ suggestedBy: 'child-uid', status: 'suggested', title: 'Tidy room' }))
      await openEditDialog(wrapper)
      const textFields = wrapper.findAllComponents({ name: 'VTextField' })
      const titleField = textFields.find(f => f.props('label') === 'Title')
      await titleField.find('input').setValue('Tidy bedroom')
      const saveBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text() === 'Save')
      await saveBtn.trigger('click')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', {
        title: 'Tidy bedroom',
        description: 'The back garden fence is broken.',
      })
    })
  })

  // ── status / priority controls ───────────────────────────────────────────

  describe('status and priority selects', () => {
    it('calls updateJob with the new status when the Status select changes', async () => {
      const wrapper = mountCard()
      await expandCard(wrapper)
      const selects = wrapper.findAllComponents({ name: 'VSelect' })
      const statusSelect = selects[0]
      await statusSelect.vm.$emit('update:modelValue', 'planned')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', { status: 'planned' })
    })

    it('calls updateJob with the new priority when the Priority select changes', async () => {
      const wrapper = mountCard()
      await expandCard(wrapper)
      const selects = wrapper.findAllComponents({ name: 'VSelect' })
      const prioritySelect = selects[1]
      await prioritySelect.vm.$emit('update:modelValue', 'low')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', { priority: 'low' })
    })

    it('sends priority null when "None" is selected', async () => {
      const wrapper = mountCard()
      await expandCard(wrapper)
      const selects = wrapper.findAllComponents({ name: 'VSelect' })
      const prioritySelect = selects[1]
      await prioritySelect.vm.$emit('update:modelValue', null)
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', { priority: null })
    })

    // The tests above hand-feed values straight to the update:model-value
    // handler, which never exercises the `:items` binding that builds the
    // dropdown options. These assert on the actual items prop so a mistake
    // in that mapping (wrong value field, missing "None" entry, etc.) fails.
    it('builds Status select items from JOB_STATUSES/JOB_STATUS_LABELS', async () => {
      const wrapper = mountCard()
      await expandCard(wrapper)
      const statusSelect = wrapper.findAllComponents({ name: 'VSelect' })[0]
      expect(statusSelect.props('items')).toEqual(
        JOB_STATUSES.map(s => ({ title: JOB_STATUS_LABELS[s], value: s }))
      )
    })

    it('builds Priority select items with a None option plus JOB_PRIORITIES', async () => {
      const wrapper = mountCard()
      await expandCard(wrapper)
      const prioritySelect = wrapper.findAllComponents({ name: 'VSelect' })[1]
      expect(prioritySelect.props('items')).toEqual([
        { title: 'None', value: null },
        ...JOB_PRIORITIES.map(p => ({ title: p.charAt(0).toUpperCase() + p.slice(1), value: p })),
      ])
    })
  })

  // ── assignee picker ──────────────────────────────────────────────────────

  describe('assignee picker', () => {
    it('lists every family member in the dropdown', async () => {
      const wrapper = mountCard(makeJob({ assignedTo: null }))
      await expandCard(wrapper)
      const assignBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Assign'))
      await assignBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const names = items.map(i => i.text())
      expect(names.some(t => t.includes('Dad'))).toBe(true)
      expect(names.some(t => t.includes('Ella'))).toBe(true)
    })

    it('calls updateJob with assignedTo when a member is selected', async () => {
      const wrapper = mountCard(makeJob({ assignedTo: null }))
      await expandCard(wrapper)
      const assignBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Assign'))
      await assignBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const ellaItem = items.find(i => i.text().includes('Ella'))
      await ellaItem.trigger('click')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', { assignedTo: 'child-uid' })
    })

    it('does not show an "Unassigned" option when the job has no assignee', async () => {
      const wrapper = mountCard(makeJob({ assignedTo: null }))
      await expandCard(wrapper)
      const assignBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Assign'))
      await assignBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      expect(items.some(i => i.text().includes('Unassigned'))).toBe(false)
    })

    it('shows an "Unassigned" option and calls updateJob with assignedTo null when clicked', async () => {
      const wrapper = mountCard(makeJob({ assignedTo: 'child-uid' }))
      await expandCard(wrapper)
      const assignBtn = wrapper.findAllComponents({ name: 'VBtn' })
        .find(b => b.text().includes('Assign'))
      await assignBtn.trigger('click')
      await wrapper.vm.$nextTick()
      const items = wrapper.findAllComponents({ name: 'VListItem' })
      const unassignItem = items.find(i => i.text().includes('Unassigned'))
      expect(unassignItem).toBeTruthy()
      await unassignItem.trigger('click')
      expect(jobsStore.updateJob).toHaveBeenCalledWith('job-1', { assignedTo: null })
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
