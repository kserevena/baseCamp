<script setup>
import { ref, computed } from 'vue'
import { useJobsStore } from '@/stores/jobs.js'
import { useUserRole } from '@/composables/useUserRole.js'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '@/constants/jobs.js'
import JobCard from '@/components/JobCard.vue'

const jobsStore = useJobsStore()
const { isParent } = useUserRole()

// ── category filter ─────────────────────────────────────────────────────────

const selectedCategory = ref(null)

const categories = computed(() => {
  const cats = new Set()
  for (const job of jobsStore.jobs) {
    if (job.category) cats.add(job.category)
  }
  return Array.from(cats).sort()
})

const filteredJobs = computed(() =>
  selectedCategory.value
    ? jobsStore.jobs.filter(j => j.category === selectedCategory.value)
    : jobsStore.jobs
)

// ── status sections ─────────────────────────────────────────────────────────

// Sections in spec order: Suggested → Planned → In Progress → Done
const sections = computed(() =>
  JOB_STATUSES.map(status => ({
    status,
    label: JOB_STATUS_LABELS[status],
    jobs: filteredJobs.value.filter(j => j.status === status),
  })).filter(s => s.jobs.length > 0)
)

const collapsedSections = ref(new Set())

function toggleSection(status) {
  if (collapsedSections.value.has(status)) {
    collapsedSections.value.delete(status)
  } else {
    collapsedSections.value.add(status)
  }
}

// ── add job dialog ──────────────────────────────────────────────────────────

const addDialog = ref(false)
const newTitle = ref('')
const newDescription = ref('')
const newCategory = ref('')
const titleError = ref('')

function openAdd() {
  newTitle.value = ''
  newDescription.value = ''
  newCategory.value = ''
  titleError.value = ''
  addDialog.value = true
}

function submitAdd() {
  const title = newTitle.value.trim()
  if (!title) {
    titleError.value = 'Title is required'
    return
  }
  jobsStore.addJob({
    title,
    description: newDescription.value.trim() || null,
    category: newCategory.value.trim(),
  })
  addDialog.value = false
}
</script>

<template>
  <div class="pa-3">
    <!-- ── header + category filter ── -->
    <div class="d-flex align-center mb-3">
      <span class="text-h6 font-weight-bold flex-grow-1">Household Jobs</span>
    </div>

    <!-- Category filter chips -->
    <div v-if="categories.length > 0" class="d-flex flex-wrap gap-1 mb-3">
      <v-chip
        :variant="selectedCategory === null ? 'flat' : 'tonal'"
        color="primary"
        size="small"
        min-height="32"
        @click="selectedCategory = null"
      >
        All
      </v-chip>
      <v-chip
        v-for="cat in categories"
        :key="cat"
        :variant="selectedCategory === cat ? 'flat' : 'tonal'"
        color="primary"
        size="small"
        min-height="32"
        @click="selectedCategory = cat"
      >
        {{ cat }}
      </v-chip>
    </div>

    <!-- ── empty state ── -->
    <div v-if="jobsStore.jobs.length === 0" class="text-center text-medium-emphasis py-8">
      <v-icon size="48" class="mb-2">mdi-clipboard-check-outline</v-icon>
      <p class="text-body-1">No jobs yet</p>
      <p class="text-body-2">Tap + to suggest the first job</p>
    </div>

    <div v-else-if="filteredJobs.length === 0" class="text-center text-medium-emphasis py-8">
      <p class="text-body-2">No jobs in this category</p>
    </div>

    <!-- ── status sections ── -->
    <div
      v-for="section in sections"
      :key="section.status"
      class="mb-3"
    >
      <!-- Section header -->
      <div
        class="d-flex align-center mb-1 cursor-pointer"
        :class="section.status === 'done' ? 'text-medium-emphasis' : ''"
        @click="toggleSection(section.status)"
      >
        <v-icon size="18" class="mr-1">
          {{ collapsedSections.has(section.status) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}
        </v-icon>
        <span class="text-subtitle-2 font-weight-medium">{{ section.label }}</span>
        <v-chip size="x-small" class="ml-1" variant="tonal" color="grey">
          {{ section.jobs.length }}
        </v-chip>
      </div>

      <!-- Job cards -->
      <div v-if="!collapsedSections.has(section.status)">
        <JobCard
          v-for="job in section.jobs"
          :key="job.id"
          :job="job"
        />
      </div>
    </div>

    <!-- ── FAB ── -->
    <v-fab
      icon="mdi-plus"
      color="primary"
      location="bottom end"
      fixed
      style="bottom: 72px"
      @click="openAdd"
    />

    <!-- ── Add job dialog ── -->
    <v-dialog v-model="addDialog" max-width="480">
      <v-card>
        <v-card-title>Suggest a job</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="newTitle"
            label="Title *"
            variant="outlined"
            density="compact"
            :error-messages="titleError"
            class="mb-2"
            autofocus
            @input="titleError = ''"
            @keyup.enter="submitAdd"
          />
          <v-textarea
            v-model="newDescription"
            label="Description (optional)"
            variant="outlined"
            density="compact"
            rows="2"
            auto-grow
            class="mb-2"
          />
          <v-text-field
            v-model="newCategory"
            label="Category (optional)"
            variant="outlined"
            density="compact"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="addDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="submitAdd">Suggest</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>
