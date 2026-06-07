<script setup>
import { ref, computed } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { useFamilyStore } from '@/stores/family.js'
import ShoppingList from '@/components/ShoppingList.vue'

const store = useShoppingStore()
const family = useFamilyStore()

const isParent = computed(() => family.currentUser?.role === 'parent')
const hasLists = computed(() => store.lists.length > 0)

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

const listSheet = ref(false)
const newListName = ref('')

function submitList() {
  if (!newListName.value.trim()) return
  store.createList(newListName.value.trim())
  newListName.value = ''
  listSheet.value = false
}

const deleteDialog = ref(false)
const listToDelete = computed(() => store.lists.find(l => l.id === store.activeListId) ?? null)

function confirmDelete() {
  store.deleteList()
  deleteDialog.value = false
}
</script>

<template>
  <div class="shopping-view">

    <!-- Lists exist: show progress, items, FAB -->
    <template v-if="hasLists">
      <!-- List selector -->
      <div class="list-selector px-2 pt-2">
        <div class="list-chips">
          <v-chip
            v-for="list in store.lists"
            :key="list.id"
            :color="list.id === store.activeListId ? 'primary' : undefined"
            :variant="list.id === store.activeListId ? 'flat' : 'tonal'"
            :prepend-icon="list.id === store.activeListId ? 'mdi-check' : undefined"
            size="small"
            class="mr-2"
            @click="store.activateList(list.id)"
          >
            {{ list.name }}
          </v-chip>
        </div>
        <v-btn
          v-if="isParent"
          icon
          variant="text"
          size="small"
          color="error"
          class="flex-0-0"
          @click="deleteDialog = true"
        >
          <v-icon>mdi-delete-outline</v-icon>
        </v-btn>
        <v-btn
          v-if="isParent"
          icon
          variant="text"
          size="small"
          class="flex-0-0 ml-1"
          @click="listSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <!-- Progress bar -->
      <div class="px-4 pb-1">
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
    </template>

    <!-- No lists yet: empty state -->
    <div v-else class="empty-state">
      <v-icon size="64" color="medium-emphasis">mdi-cart-outline</v-icon>
      <p class="text-body-1 text-medium-emphasis mt-3">No shopping list yet</p>
      <v-btn
        v-if="isParent"
        color="primary"
        variant="flat"
        class="mt-4"
        @click="listSheet = true"
      >
        New list
      </v-btn>
    </div>

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

    <!-- New list bottom sheet -->
    <v-bottom-sheet v-model="listSheet" max-width="600">
      <v-card rounded="t-xl" class="pa-4">
        <div class="text-subtitle-1 font-weight-medium mb-3">New list</div>
        <v-text-field
          v-model="newListName"
          label="List name"
          variant="outlined"
          autofocus
          class="mb-3"
          @keyup.enter="submitList"
        />
        <div class="d-flex gap-2">
          <v-btn variant="text" @click="listSheet = false">Cancel</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="submitList">Create</v-btn>
        </div>
      </v-card>
    </v-bottom-sheet>

    <!-- Delete list confirmation dialog -->
    <v-dialog v-model="deleteDialog" max-width="400">
      <v-card>
        <v-card-title>Delete list?</v-card-title>
        <v-card-text>
          "{{ listToDelete?.name }}" will be permanently deleted.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deleteDialog = false">Cancel</v-btn>
          <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

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
.list-selector {
  display: flex;
  align-items: center;
}
.list-chips {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 4px 0;
}
.list-chips::-webkit-scrollbar {
  display: none;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 100px;
}
</style>
