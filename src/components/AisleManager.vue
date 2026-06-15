<script setup>
import { ref, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useShoppingStore } from '@/stores/shopping.js'

const store = useShoppingStore()

const localAisles = ref([])
const newAisleName = ref('')
const nameError = ref('')
const deleteDialog = ref(false)
const aisleToDelete = ref(null)
let pendingReorder = false

watch(
  () => store.activeAisles,
  (aisles) => {
    if (!pendingReorder) localAisles.value = aisles.map(a => ({ ...a }))
  },
  { immediate: true },
)

function normalised() {
  return localAisles.value.map((a, i) => ({ name: a.name, order: (i + 1) * 10 }))
}

function onDragStart() {
  pendingReorder = true
}

function onDragEnd() {
  pendingReorder = false
  store.saveAisles(normalised())
}

function addAisle() {
  const name = newAisleName.value.trim()
  if (!name) {
    nameError.value = 'Enter a name'
    return
  }
  if (localAisles.value.some(a => a.name.toLowerCase() === name.toLowerCase())) {
    nameError.value = 'Aisle already exists'
    return
  }
  const maxOrder = localAisles.value.reduce((m, a) => Math.max(m, a.order), 0)
  localAisles.value.push({ name, order: maxOrder + 10 })
  newAisleName.value = ''
  nameError.value = ''
  store.saveAisles(normalised())
}

function requestDelete(aisle) {
  aisleToDelete.value = aisle
  deleteDialog.value = true
}

async function confirmDelete() {
  if (!aisleToDelete.value) return
  await store.deleteAisle(aisleToDelete.value.name)
  localAisles.value = localAisles.value.filter(a => a.name !== aisleToDelete.value.name)
  deleteDialog.value = false
  aisleToDelete.value = null
}
</script>

<template>
  <v-card rounded="t-xl" class="pa-4">
    <div class="text-subtitle-1 font-weight-medium mb-3">Manage aisles</div>

    <VueDraggable
      v-model="localAisles"
      handle=".drag-handle"
      :animation="150"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <div
        v-for="aisle in localAisles"
        :key="aisle.name"
        class="aisle-row d-flex align-center pa-2 rounded mb-1"
      >
        <v-icon class="drag-handle mr-2 text-medium-emphasis" style="cursor: grab">
          mdi-drag
        </v-icon>
        <span class="flex-grow-1">{{ aisle.name }}</span>
        <v-btn
          icon
          variant="text"
          size="small"
          color="error"
          @click="requestDelete(aisle)"
        >
          <v-icon>mdi-delete-outline</v-icon>
        </v-btn>
      </div>
    </VueDraggable>

    <div class="d-flex align-start gap-2 mt-3">
      <v-text-field
        v-model="newAisleName"
        label="New aisle"
        variant="outlined"
        density="compact"
        :error-messages="nameError"
        class="flex-grow-1"
        @keyup.enter="addAisle"
        @input="nameError = ''"
      />
      <v-btn
        color="primary"
        variant="tonal"
        class="mt-1"
        @click="addAisle"
      >
        Add
      </v-btn>
    </div>

  </v-card>

  <!-- Delete confirmation -->
  <v-dialog v-model="deleteDialog" max-width="360">
    <v-card>
      <v-card-title>Delete aisle?</v-card-title>
      <v-card-text>
        "{{ aisleToDelete?.name }}" will be removed. Items in this aisle will be moved to Unknown.
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
        <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<style scoped>
.aisle-row {
  background: rgba(var(--v-theme-primary), 0.12);
}
</style>
