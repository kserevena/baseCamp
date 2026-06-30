<script setup>
import { ref, computed } from 'vue'
import { useJobsStore } from '@/stores/jobs.js'
import { useFamilyStore } from '@/stores/family.js'
import { useUserRole } from '@/composables/useUserRole.js'
import { JOB_STATUSES, JOB_STATUS_LABELS, JOB_PRIORITIES } from '@/constants/jobs.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'
import JobSubtasks from '@/components/JobSubtasks.vue'
import { formatGBP } from '@/utils/currency.js'

const props = defineProps({
  job: { type: Object, required: true },
})

const jobsStore = useJobsStore()
const familyStore = useFamilyStore()
const { isParent } = useUserRole()

const expanded = ref(false)
const editDialog = ref(false)
const deleteDialog = ref(false)

// Can this user edit only title/description (child who suggested it)?
const canChildEdit = computed(() =>
  !isParent.value &&
  props.job.suggestedBy === familyStore.currentUser?.uid &&
  props.job.status === 'suggested'
)

// Progress display
const progress = computed(() => jobsStore.progressFor(props.job.id))
const hasSubtasks = computed(() => progress.value.total > 0)

// Creator name for the expanded "Created by" line
const createdByName = computed(() =>
  familyStore.members.find(m => m.uid === props.job.suggestedBy)?.name ?? 'Unknown'
)

// Priority colours
const priorityColor = {
  high: 'error',
  medium: 'warning',
  low: 'success',
}

// Status colours
const statusColor = {
  suggested: 'blue-grey',
  planned: 'info',
  in_progress: 'primary',
  done: 'success',
}

// Edit form state
const editTitle = ref(props.job.title)
const editDescription = ref(props.job.description ?? '')
const editCategory = ref(props.job.category ?? '')
const editCost = ref(props.job.costEstimate != null ? String(props.job.costEstimate) : '')

function openEdit() {
  editTitle.value = props.job.title
  editDescription.value = props.job.description ?? ''
  editCategory.value = props.job.category ?? ''
  editCost.value = props.job.costEstimate != null ? String(props.job.costEstimate) : ''
  editDialog.value = true
}

function saveEdit() {
  if (!editTitle.value.trim()) return
  const fields = {
    title: editTitle.value.trim(),
    description: editDescription.value.trim() || null,
  }
  if (isParent.value) {
    fields.category = editCategory.value.trim()
    const cost = parseFloat(editCost.value)
    fields.costEstimate = Number.isFinite(cost) ? cost : null
  }
  jobsStore.updateJob(props.job.id, fields)
  editDialog.value = false
}

function onStatusChange(newStatus) {
  jobsStore.updateJob(props.job.id, { status: newStatus })
}

function onPriorityChange(newPriority) {
  jobsStore.updateJob(props.job.id, { priority: newPriority || null })
}

function onAssign(uid) {
  jobsStore.updateJob(props.job.id, { assignedTo: uid })
}

function onUnassign() {
  jobsStore.updateJob(props.job.id, { assignedTo: null })
}

function confirmDelete() {
  jobsStore.deleteJob(props.job.id)
  deleteDialog.value = false
}
</script>

<template>
  <v-card
    :class="['mb-2', job.status === 'done' ? 'opacity-60' : '']"
    variant="outlined"
    rounded="lg"
  >
    <!-- ── collapsed header ── -->
    <v-card-text class="pa-3 pb-2">
      <div class="d-flex align-start gap-2">
        <!-- Expand toggle -->
        <v-btn
          icon
          variant="text"
          size="small"
          class="flex-shrink-0 mt-n1"
          @click="expanded = !expanded"
        >
          <v-icon>{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>

        <!-- Title area -->
        <div class="flex-grow-1 min-width-0">
          <div class="d-flex align-center flex-wrap gap-1 mb-1">
            <span class="text-body-1 font-weight-medium">{{ job.title }}</span>
          </div>
          <div class="d-flex align-center flex-wrap gap-1">
            <!-- Category chip -->
            <v-chip
              v-if="job.category"
              size="x-small"
              variant="tonal"
              color="primary"
            >
              {{ job.category }}
            </v-chip>
            <!-- Priority badge -->
            <v-chip
              v-if="job.priority"
              size="x-small"
              :color="priorityColor[job.priority] ?? 'grey'"
              variant="tonal"
            >
              {{ job.priority }}
            </v-chip>
            <!-- Cost estimate -->
            <v-chip
              v-if="job.costEstimate != null"
              size="x-small"
              color="teal"
              variant="tonal"
              prepend-icon="mdi-currency-gbp"
            >
              {{ formatGBP(job.costEstimate) }}
            </v-chip>
            <!-- Progress -->
            <v-chip
              v-if="hasSubtasks"
              size="x-small"
              color="grey"
              variant="tonal"
              prepend-icon="mdi-checkbox-marked-outline"
            >
              {{ progress.done }} / {{ progress.total }}
            </v-chip>
          </div>
        </div>

        <!-- Assignee only (creator is shown in the expanded view) -->
        <div class="d-flex align-center gap-1 flex-shrink-0">
          <FamilyAvatar
            v-if="job.assignedTo"
            :uid="job.assignedTo"
            :size="28"
            class="flex-shrink-0"
          />
          <v-avatar
            v-else
            :size="28"
            color="grey-lighten-1"
            class="flex-shrink-0"
            title="Unassigned"
          >
            <v-icon size="18">mdi-account-question-outline</v-icon>
          </v-avatar>
        </div>
      </div>
    </v-card-text>

    <!-- ── expanded body ── -->
    <template v-if="expanded">
      <v-divider />
      <v-card-text class="pa-3 pt-2">
        <!-- Description -->
        <p
          v-if="job.description"
          class="text-body-2 text-medium-emphasis mb-3"
        >
          {{ job.description }}
        </p>

        <!-- Created by -->
        <div
          v-if="job.suggestedBy"
          class="d-flex align-center gap-2 mb-3"
        >
          <span class="text-caption text-medium-emphasis">Created by</span>
          <FamilyAvatar :uid="job.suggestedBy" :size="22" />
          <span class="text-body-2">{{ createdByName }}</span>
        </div>

        <!-- Subtasks -->
        <JobSubtasks :job-id="job.id" />

        <!-- Parent-only controls -->
        <div v-if="isParent" class="mt-3">
          <v-divider class="mb-3" />
          <div class="d-flex flex-wrap gap-2 align-center">
            <!-- Status -->
            <v-select
              :model-value="job.status"
              :items="JOB_STATUSES.map(s => ({ title: JOB_STATUS_LABELS[s], value: s }))"
              label="Status"
              variant="outlined"
              density="compact"
              hide-details
              style="min-width: 130px; max-width: 160px"
              @update:model-value="onStatusChange"
            />
            <!-- Priority -->
            <v-select
              :model-value="job.priority"
              :items="[{ title: 'None', value: null }, ...JOB_PRIORITIES.map(p => ({ title: p.charAt(0).toUpperCase() + p.slice(1), value: p }))]"
              label="Priority"
              variant="outlined"
              density="compact"
              hide-details
              style="min-width: 110px; max-width: 130px"
              @update:model-value="onPriorityChange"
            />
            <!-- Assignee picker -->
            <v-menu location="bottom start">
              <template #activator="{ props: menuProps }">
                <v-btn
                  v-bind="menuProps"
                  variant="outlined"
                  size="small"
                  min-height="40"
                  prepend-icon="mdi-account-arrow-right-outline"
                >
                  <template v-if="job.assignedTo">
                    <FamilyAvatar :uid="job.assignedTo" :size="22" class="mr-1" />
                    Assigned
                  </template>
                  <template v-else>Assign</template>
                </v-btn>
              </template>
              <v-list density="compact">
                <v-list-item
                  v-for="member in familyStore.members"
                  :key="member.uid"
                  min-height="44"
                  @click="onAssign(member.uid)"
                >
                  <template #prepend>
                    <FamilyAvatar :uid="member.uid" :size="28" class="mr-2" />
                  </template>
                  <v-list-item-title>{{ member.name }}</v-list-item-title>
                </v-list-item>
                <v-divider v-if="job.assignedTo" />
                <v-list-item
                  v-if="job.assignedTo"
                  min-height="44"
                  prepend-icon="mdi-account-remove-outline"
                  title="Unassigned"
                  @click="onUnassign"
                />
              </v-list>
            </v-menu>
          </div>
          <div class="d-flex gap-2 mt-2">
            <!-- Edit -->
            <v-btn
              variant="tonal"
              size="small"
              min-height="40"
              prepend-icon="mdi-pencil-outline"
              @click="openEdit"
            >
              Edit
            </v-btn>
            <!-- Delete -->
            <v-btn
              variant="tonal"
              color="error"
              size="small"
              min-height="40"
              prepend-icon="mdi-delete-outline"
              @click="deleteDialog = true"
            >
              Delete
            </v-btn>
          </div>
        </div>

        <!-- Child-edit: only title/description on own suggested job -->
        <div v-else-if="canChildEdit" class="mt-3">
          <v-divider class="mb-3" />
          <v-btn
            variant="tonal"
            size="small"
            min-height="40"
            prepend-icon="mdi-pencil-outline"
            @click="openEdit"
          >
            Edit
          </v-btn>
        </div>
      </v-card-text>
    </template>
  </v-card>

  <!-- ── edit dialog ── -->
  <v-dialog v-model="editDialog" max-width="480">
    <v-card>
      <v-card-title>Edit job</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="editTitle"
          label="Title"
          variant="outlined"
          density="compact"
          class="mb-2"
        />
        <v-textarea
          v-model="editDescription"
          label="Description (optional)"
          variant="outlined"
          density="compact"
          rows="2"
          auto-grow
          class="mb-2"
        />
        <template v-if="isParent">
          <v-text-field
            v-model="editCategory"
            label="Category"
            variant="outlined"
            density="compact"
            class="mb-2"
          />
          <v-text-field
            v-model="editCost"
            label="Cost estimate (£)"
            variant="outlined"
            density="compact"
            type="number"
            min="0"
            step="0.01"
          />
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="editDialog = false">Cancel</v-btn>
        <v-btn color="primary" variant="flat" @click="saveEdit">Save</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- ── delete confirmation dialog ── -->
  <v-dialog v-model="deleteDialog" max-width="400">
    <v-card>
      <v-card-title>Delete job?</v-card-title>
      <v-card-text>
        "{{ job.title }}" and its subtasks will be permanently deleted.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
