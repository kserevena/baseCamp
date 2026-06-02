<script setup>
import { ref, computed } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import ShoppingList from '@/components/ShoppingList.vue'

const store = useShoppingStore()

const doneCount = computed(() => store.items.filter(i => i.done).length)
const totalCount = computed(() => store.items.length)
const progressPct = computed(() => totalCount.value ? (doneCount.value / totalCount.value) * 100 : 0)

const sheet = ref(false)
const newName = ref('')
const newQty = ref('')

function submit() {
  if (!newName.value.trim()) return
  store.addItem(newName.value.trim(), newQty.value.trim())
  newName.value = ''
  newQty.value = ''
  sheet.value = false
}
</script>

<template>
  <div class="shopping-view">
    <!-- Progress bar -->
    <div class="px-4 pt-3 pb-1">
      <div class="d-flex justify-space-between align-center mb-1">
        <span class="text-caption text-medium-emphasis">
          {{ doneCount }} of {{ totalCount }} items
        </span>
        <span class="text-caption font-weight-medium" style="color: #1D9E75">
          {{ Math.round(progressPct) }}%
        </span>
      </div>
      <v-progress-linear
        :model-value="progressPct"
        color="primary"
        rounded
        height="8"
      />
    </div>

    <!-- List -->
    <ShoppingList />

    <!-- Add item FAB -->
    <v-btn
      icon
      color="primary"
      size="56"
      elevation="4"
      class="fab"
      @click="sheet = true"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>

    <!-- Add item bottom sheet -->
    <v-bottom-sheet v-model="sheet" max-width="600">
      <v-card rounded="t-xl" class="pa-4">
        <div class="text-subtitle-1 font-weight-medium mb-3">Add item</div>
        <v-text-field
          v-model="newName"
          label="Item name"
          variant="outlined"
          autofocus
          class="mb-2"
          @keyup.enter="submit"
        />
        <v-text-field
          v-model="newQty"
          label="Quantity (optional)"
          variant="outlined"
          class="mb-3"
          @keyup.enter="submit"
        />
        <div class="d-flex gap-2">
          <v-btn variant="text" @click="sheet = false">Cancel</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="submit">Add</v-btn>
        </div>
      </v-card>
    </v-bottom-sheet>
  </div>
</template>

<style scoped>
.shopping-view {
  position: relative;
  min-height: calc(100vh - 64px);
}
.fab {
  position: fixed;
  bottom: 80px;
  right: 20px;
}
.gap-2 { gap: 8px; }
</style>
