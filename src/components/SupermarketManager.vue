<script setup>
import { ref } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import AisleManager from './AisleManager.vue'

// Parent-only management of the family's supermarkets (issue #137 Part B).
// Add / rename / remove stores, and edit each store's independent aisle order
// via an embedded AisleManager. Rendered as the content of a bottom sheet.
const store = useShoppingStore()
const emit = defineEmits(['close'])

const newName = ref('')
const nameError = ref('')
const expandedId = ref(null)
const editingId = ref(null)
const editingName = ref('')
const deleteDialog = ref(false)
const toDelete = ref(null)

function addSupermarket() {
  const name = newName.value.trim()
  if (!name) {
    nameError.value = 'Enter a name'
    return
  }
  if (store.supermarkets.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    nameError.value = 'Already exists'
    return
  }
  store.addSupermarket(name)
  newName.value = ''
  nameError.value = ''
}

function toggleExpand(id) {
  expandedId.value = expandedId.value === id ? null : id
}

function startRename(sm) {
  editingId.value = sm.id
  editingName.value = sm.name
}

function saveRename() {
  // The field fires this on both Enter and blur; Enter removes the input (v-if),
  // whose unmount triggers a second blur call. Guard against the null-id pass so
  // we neither double-write nor call renameSupermarket with a null id.
  if (editingId.value == null) return
  const name = editingName.value.trim()
  if (name) store.renameSupermarket(editingId.value, name)
  editingId.value = null
}

function requestDelete(sm) {
  toDelete.value = sm
  deleteDialog.value = true
}

function confirmDelete() {
  if (toDelete.value) store.deleteSupermarket(toDelete.value.id)
  deleteDialog.value = false
  toDelete.value = null
}
</script>

<template>
  <v-card rounded="t-xl" class="pa-4 supermarket-manager-card">
    <div class="d-flex align-center mb-3">
      <span class="text-subtitle-1 font-weight-medium flex-grow-1">Manage supermarkets</span>
      <v-btn icon variant="text" size="small" @click="emit('close')">
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </div>

    <div v-if="store.supermarkets.length === 0" class="text-body-2 text-medium-emphasis mb-3">
      No supermarkets yet. Add one to organise items by store, each with its own aisle order.
    </div>

    <div
      v-for="sm in store.supermarkets"
      :key="sm.id"
      class="supermarket-row rounded mb-2"
    >
      <div class="d-flex align-center pa-2">
        <template v-if="editingId === sm.id">
          <v-text-field
            v-model="editingName"
            density="compact"
            variant="outlined"
            hide-details
            autofocus
            class="flex-grow-1 mr-2"
            @keyup.enter="saveRename"
            @blur="saveRename"
          />
          <v-btn icon variant="text" size="small" color="primary" @click="saveRename">
            <v-icon>mdi-check</v-icon>
          </v-btn>
        </template>
        <template v-else>
          <span class="flex-grow-1 font-weight-medium">{{ sm.name }}</span>
          <v-btn icon variant="text" size="small" aria-label="Rename" @click="startRename(sm)">
            <v-icon>mdi-pencil-outline</v-icon>
          </v-btn>
          <v-btn icon variant="text" size="small" :aria-label="expandedId === sm.id ? 'Hide aisles' : 'Edit aisles'" @click="toggleExpand(sm.id)">
            <v-icon>{{ expandedId === sm.id ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
          </v-btn>
          <v-btn icon variant="text" size="small" color="error" aria-label="Delete" @click="requestDelete(sm)">
            <v-icon>mdi-delete-outline</v-icon>
          </v-btn>
        </template>
      </div>
      <div v-if="expandedId === sm.id" class="px-2 pb-2">
        <div class="text-caption text-medium-emphasis mb-1">Aisle order for {{ sm.name }}</div>
        <AisleManager :supermarket="sm" />
      </div>
    </div>

    <div class="d-flex align-start gap-2 mt-3">
      <v-text-field
        v-model="newName"
        label="New supermarket"
        variant="outlined"
        density="compact"
        :error-messages="nameError"
        class="flex-grow-1"
        @keyup.enter="addSupermarket"
        @input="nameError = ''"
      />
      <v-btn
        color="primary"
        variant="tonal"
        class="mt-1"
        @click="addSupermarket"
      >
        Add
      </v-btn>
    </div>

    <!-- Delete confirmation. Deleting a store un-allocates any item that was
         only in it (no items are deleted). -->
    <v-dialog v-model="deleteDialog" max-width="360">
      <v-card>
        <v-card-title>Delete supermarket?</v-card-title>
        <v-card-text>
          "{{ toDelete?.name }}" will be removed. Items allocated only to it become
          unallocated (shown in every view). No items are deleted.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.supermarket-row {
  background: rgba(var(--v-theme-primary), 0.06);
}

/* dvh shrinks when the Android keyboard is shown, keeping the card visible
   above the keyboard (#109). */
.supermarket-manager-card {
  max-height: 90vh; /* fallback for browsers without dvh support */
  max-height: 90dvh;
  overflow-y: auto;
}
</style>
