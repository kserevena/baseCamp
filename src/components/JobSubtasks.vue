<script setup>
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useJobsStore, MAX_SUBTASK_NOTES_LENGTH } from '@/stores/jobs.js'
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

const subtasks = computed(() => jobsStore.subtasksFor(props.jobId))

// VueDraggable mutates its v-model array in place during a drag. Bind it to a
// local copy of THIS job's subtasks — never the store's full `subtasks` array,
// which spans every job, so a reorder can't scramble another job's items. Kept
// in sync with the store; onDragEnd persists the new order to Firestore.
const draggableSubtasks = ref([])
watch(subtasks, (list) => { draggableSubtasks.value = [...list] }, { immediate: true })

function addSubtask() {
  const title = newSubtaskTitle.value.trim()
  if (!title) return
  jobsStore.addSubtask(props.jobId, title)
  newSubtaskTitle.value = ''
}

function onToggle(subtaskId) {
  jobsStore.toggleSubtask(subtaskId)
}

function onDragEnd() {
  const orderedIds = draggableSubtasks.value.map(s => s.id)
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
const editingNotes = ref('')

function startEditSubtask(subtask) {
  editingSubtaskId.value = subtask.id
  editingTitle.value = subtask.title
  editingNotes.value = subtask.notes ?? ''
}

function saveEditSubtask(subtaskId) {
  const title = editingTitle.value.trim()
  // An emptied title is invalid and left unsaved (the stored title is unchanged),
  // but notes are always saved — clearing the title must not also discard a note.
  jobsStore.updateSubtask(subtaskId, {
    ...(title ? { title } : {}),
    notes: editingNotes.value.trim(),
  })
  editingSubtaskId.value = null
  editingTitle.value = ''
  editingNotes.value = ''
}

// Title and notes are edited together in one group; only save once focus leaves
// the whole group (not when tabbing from the title field into the notes field).
function onEditGroupFocusOut(event, subtaskId) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    saveEditSubtask(subtaskId)
  }
}
</script>

<template>
  <div class="job-subtasks">
    <!-- Subtask list -->
    <VueDraggable
      v-if="isParent"
      v-model="draggableSubtasks"
      handle=".subtask-drag-handle"
      :animation="150"
      @end="onDragEnd"
    >
      <div
        v-for="subtask in draggableSubtasks"
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

        <!-- Title/notes or edit fields -->
        <template v-if="editingSubtaskId === subtask.id">
          <div
            class="flex-grow-1 mr-1"
            @focusout="onEditGroupFocusOut($event, subtask.id)"
          >
            <v-text-field
              v-model="editingTitle"
              density="compact"
              variant="outlined"
              hide-details
              class="mb-1"
              @keyup.enter="saveEditSubtask(subtask.id)"
            />
            <v-textarea
              v-model="editingNotes"
              label="Notes (optional)"
              density="compact"
              variant="outlined"
              rows="2"
              auto-grow
              hide-details="auto"
              :maxlength="MAX_SUBTASK_NOTES_LENGTH"
              :counter="MAX_SUBTASK_NOTES_LENGTH"
            />
          </div>
        </template>
        <template v-else>
          <div
            class="subtask-title-group flex-grow-1 d-flex flex-column"
            @click="isParent && startEditSubtask(subtask)"
          >
            <span
              :class="['text-body-2', subtask.done ? 'text-decoration-line-through text-medium-emphasis' : '']"
            >
              {{ subtask.title }}
            </span>
            <span
              v-if="subtask.notes"
              class="text-caption text-medium-emphasis"
            >
              {{ subtask.notes }}
            </span>
          </div>
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
        <div class="flex-grow-1 d-flex flex-column">
          <span
            :class="['text-body-2', subtask.done ? 'text-decoration-line-through text-medium-emphasis' : '']"
          >
            {{ subtask.title }}
          </span>
          <span
            v-if="subtask.notes"
            class="text-caption text-medium-emphasis"
          >
            {{ subtask.notes }}
          </span>
        </div>
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
