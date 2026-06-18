<script setup>
import { ref, computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useJobsStore } from '@/stores/jobs.js'
import { useFamilyStore } from '@/stores/family.js'
import { useUserRole } from '@/composables/useUserRole.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'

const props = defineProps({
  jobId: { type: String, required: true },
})

const jobsStore = useJobsStore()
const familyStore = useFamilyStore()
const { isParent } = useUserRole()

const newSubtaskTitle = ref('')
let pendingReorder = false

const subtasks = computed(() => jobsStore.subtasksFor(props.jobId))

function addSubtask() {
  const title = newSubtaskTitle.value.trim()
  if (!title) return
  jobsStore.addSubtask(props.jobId, title)
  newSubtaskTitle.value = ''
}

function onToggle(subtaskId) {
  jobsStore.toggleSubtask(subtaskId)
}

function onDragStart() {
  pendingReorder = true
}

function onDragEnd(evt) {
  pendingReorder = false
  const orderedIds = subtasks.value.map(s => s.id)
  jobsStore.reorderSubtasks(props.jobId, orderedIds)
}

function setAssignee(subtaskId, uid) {
  jobsStore.updateSubtask(subtaskId, { assignedTo: uid ?? null })
}

function onDeleteSubtask(subtaskId) {
  jobsStore.deleteSubtask(subtaskId)
}

const editingSubtaskId = ref(null)
const editingTitle = ref('')

function startEditSubtask(subtask) {
  editingSubtaskId.value = subtask.id
  editingTitle.value = subtask.title
}

function saveEditSubtask(subtaskId) {
  const title = editingTitle.value.trim()
  if (title) {
    jobsStore.updateSubtask(subtaskId, { title })
  }
  editingSubtaskId.value = null
  editingTitle.value = ''
}
</script>

<template>
  <div class="job-subtasks">
    <!-- Subtask list -->
    <VueDraggable
      v-if="isParent"
      v-model="jobsStore.subtasks"
      handle=".subtask-drag-handle"
      :animation="150"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <div
        v-for="subtask in subtasks"
        :key="subtask.id"
        class="subtask-row d-flex align-center py-1"
      >
        <v-icon
          class="subtask-drag-handle mr-1 text-medium-emphasis"
          size="18"
          style="cursor: grab"
        >
          mdi-drag
        </v-icon>

        <!-- Checkbox — enabled for ALL members -->
        <v-checkbox
          :model-value="subtask.done"
          density="compact"
          hide-details
          class="flex-shrink-0 mr-1"
          style="min-width: 36px"
          @update:model-value="onToggle(subtask.id)"
        />

        <!-- Title or edit field -->
        <template v-if="editingSubtaskId === subtask.id">
          <v-text-field
            v-model="editingTitle"
            density="compact"
            variant="outlined"
            hide-details
            class="flex-grow-1 mr-1"
            @keyup.enter="saveEditSubtask(subtask.id)"
            @blur="saveEditSubtask(subtask.id)"
          />
        </template>
        <template v-else>
          <span
            :class="['flex-grow-1 text-body-2', subtask.done ? 'text-decoration-line-through text-medium-emphasis' : '']"
            @click="isParent && startEditSubtask(subtask)"
          >
            {{ subtask.title }}
          </span>
        </template>

        <!-- Assignee (parent only) -->
        <v-menu v-if="isParent" location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              icon
              variant="text"
              size="x-small"
              class="ml-1"
              :title="subtask.assignedTo ? 'Change assignee' : 'Assign'"
            >
              <FamilyAvatar
                v-if="subtask.assignedTo"
                :uid="subtask.assignedTo"
                :size="24"
              />
              <v-icon v-else size="20" color="grey">mdi-account-plus-outline</v-icon>
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item
              v-for="member in familyStore.members"
              :key="member.uid"
              min-height="44"
              @click="setAssignee(subtask.id, member.uid)"
            >
              <template #prepend>
                <FamilyAvatar :uid="member.uid" :size="28" class="mr-2" />
              </template>
              <v-list-item-title>{{ member.name }}</v-list-item-title>
            </v-list-item>
            <v-divider v-if="subtask.assignedTo" />
            <v-list-item
              v-if="subtask.assignedTo"
              min-height="44"
              prepend-icon="mdi-account-remove-outline"
              title="Unassigned"
              @click="setAssignee(subtask.id, null)"
            />
          </v-list>
        </v-menu>

        <!-- Delete (parent only) -->
        <v-btn
          v-if="isParent"
          icon
          variant="text"
          size="x-small"
          color="error"
          class="ml-1"
          @click="onDeleteSubtask(subtask.id)"
        >
          <v-icon size="18">mdi-delete-outline</v-icon>
        </v-btn>
      </div>
    </VueDraggable>

    <!-- Non-parent: static list with checkbox only -->
    <div v-else>
      <div
        v-for="subtask in subtasks"
        :key="subtask.id"
        class="subtask-row d-flex align-center py-1"
      >
        <v-checkbox
          :model-value="subtask.done"
          density="compact"
          hide-details
          class="flex-shrink-0 mr-1"
          style="min-width: 36px"
          @update:model-value="onToggle(subtask.id)"
        />
        <span
          :class="['flex-grow-1 text-body-2', subtask.done ? 'text-decoration-line-through text-medium-emphasis' : '']"
        >
          {{ subtask.title }}
        </span>
        <FamilyAvatar
          v-if="subtask.assignedTo"
          :uid="subtask.assignedTo"
          :size="24"
          class="ml-1"
        />
      </div>
    </div>

    <!-- Add subtask field (parent only) -->
    <div v-if="isParent" class="d-flex align-start gap-2 mt-2">
      <v-text-field
        v-model="newSubtaskTitle"
        label="Add subtask"
        variant="outlined"
        density="compact"
        hide-details
        class="flex-grow-1"
        @keyup.enter="addSubtask"
      />
      <v-btn
        color="primary"
        variant="tonal"
        class="mt-0"
        min-height="40"
        @click="addSubtask"
      >
        Add
      </v-btn>
    </div>
  </div>
</template>
