import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { reactive } from 'vue'

let jobsStore

vi.mock('@/stores/jobs.js', () => ({
  useJobsStore: () => jobsStore,
}))

vi.mock('@/firebase/config.js', () => ({ db: {} }))

import JobsPreview from '@/components/JobsPreview.vue'

const vuetify = createVuetify({ components, directives })

// Store stub: callers pass an already-ranked list of active jobs (done excluded),
// mirroring what the real activeJobsByPriority getter returns.
function makeStore(rankedJobs) {
  return reactive({ activeJobsByPriority: rankedJobs })
}

function mountPreview() {
  return mount(JobsPreview, {
    global: {
      plugins: [vuetify],
      stubs: { RouterLink: true },
    },
    attachTo: document.body,
  })
}

function job(id, priority = null, title = `Job ${id}`) {
  return { id, title, priority }
}

describe('JobsPreview', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('empty state (0 jobs)', () => {
    beforeEach(() => {
      jobsStore = makeStore([])
    })

    it('shows the "No jobs yet" placeholder', () => {
      const wrapper = mountPreview()
      expect(wrapper.text()).toContain('No jobs yet')
    })

    it('renders no priority chips', () => {
      const wrapper = mountPreview()
      expect(wrapper.findAllComponents({ name: 'VChip' })).toHaveLength(0)
    })

    it('still links the card to /jobs', () => {
      const wrapper = mountPreview()
      expect(wrapper.findComponent({ name: 'VCard' }).props('to')).toBe('/jobs')
    })
  })

  describe('with jobs', () => {
    it('renders a single job (1 job)', () => {
      jobsStore = makeStore([job('a', 'high', 'Fix fence')])
      const wrapper = mountPreview()
      expect(wrapper.text()).toContain('Fix fence')
      expect(wrapper.text()).not.toContain('No jobs yet')
    })

    it('renders two jobs (2 jobs)', () => {
      jobsStore = makeStore([job('a', 'high', 'Alpha'), job('b', 'low', 'Bravo')])
      const wrapper = mountPreview()
      expect(wrapper.text()).toContain('Alpha')
      expect(wrapper.text()).toContain('Bravo')
    })

    it('renders exactly three jobs (3 jobs, no overflow chip)', () => {
      jobsStore = makeStore([
        job('a', 'high', 'Alpha'),
        job('b', 'medium', 'Bravo'),
        job('c', 'low', 'Charlie'),
      ])
      const wrapper = mountPreview()
      expect(wrapper.text()).toContain('Alpha')
      expect(wrapper.text()).toContain('Bravo')
      expect(wrapper.text()).toContain('Charlie')
      // No "+N" overflow chip when exactly 3
      expect(wrapper.text()).not.toContain('+')
    })

    it('preserves the ranked order given by the store', () => {
      jobsStore = makeStore([
        job('a', 'high', 'First'),
        job('b', 'medium', 'Second'),
        job('c', 'low', 'Third'),
      ])
      const wrapper = mountPreview()
      const text = wrapper.text()
      expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'))
      expect(text.indexOf('Second')).toBeLessThan(text.indexOf('Third'))
    })

    it('caps the preview at 3 rows and shows a "+N" overflow chip (4+ jobs)', () => {
      jobsStore = makeStore([
        job('a', 'high', 'Alpha'),
        job('b', 'high', 'Bravo'),
        job('c', 'medium', 'Charlie'),
        job('d', 'low', 'Delta'),
        job('e', null, 'Echo'),
      ])
      const wrapper = mountPreview()
      expect(wrapper.text()).toContain('Alpha')
      expect(wrapper.text()).toContain('Charlie')
      // Fourth and fifth jobs are not rendered as rows
      expect(wrapper.text()).not.toContain('Delta')
      expect(wrapper.text()).not.toContain('Echo')
      // Overflow chip shows the remaining count (5 - 3 = 2)
      expect(wrapper.text()).toContain('+2')
    })

    it('renders a priority chip with the correct colour per job', () => {
      jobsStore = makeStore([
        job('a', 'high', 'Alpha'),
        job('b', 'medium', 'Bravo'),
        job('c', 'low', 'Charlie'),
      ])
      const wrapper = mountPreview()
      const chipColors = wrapper
        .findAllComponents({ name: 'VChip' })
        .map(c => c.props('color'))
      expect(chipColors).toContain('error')   // high
      expect(chipColors).toContain('warning') // medium
      expect(chipColors).toContain('success') // low
    })

    it('omits the priority chip for an unprioritised job', () => {
      jobsStore = makeStore([job('a', null, 'No priority')])
      const wrapper = mountPreview()
      expect(wrapper.text()).toContain('No priority')
      expect(wrapper.findAllComponents({ name: 'VChip' })).toHaveLength(0)
    })

    it('links the card to /jobs', () => {
      jobsStore = makeStore([job('a', 'high', 'Alpha')])
      const wrapper = mountPreview()
      expect(wrapper.findComponent({ name: 'VCard' }).props('to')).toBe('/jobs')
    })
  })
})
