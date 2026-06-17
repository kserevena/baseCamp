<script setup>
import { ref, computed } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { useFamilyStore } from '@/stores/family.js'
import { useUserRole } from '@/composables/useUserRole.js'
import ShoppingList from '@/components/ShoppingList.vue'
import AisleManager from '@/components/AisleManager.vue'
import ShoppingAddItem from '@/components/ShoppingAddItem.vue'
import ShoppingEditItem from '@/components/ShoppingEditItem.vue'
import ShoppingNewList from '@/components/ShoppingNewList.vue'

const store = useShoppingStore()
const family = useFamilyStore()
const { isParent } = useUserRole()

const hasLists = computed(() => store.lists.length > 0)

const storageKey = `shoppingHeadersVisible_${family.currentUser?.uid}`
const showHeaders = ref(localStorage.getItem(storageKey) !== 'false')

function toggleHeaders() {
  showHeaders.value = !showHeaders.value
  localStorage.setItem(storageKey, String(showHeaders.value))
}

const addItemSheet = ref(false)
const editItemSheet = ref(false)
const editingItem = ref(null)
const newListSheet = ref(false)
const aisleSheet = ref(false)
const deleteDialog = ref(false)

const listToDelete = computed(() => store.lists.find(l => l.id === store.activeListId) ?? null)

function openEdit(item) {
  editingItem.value = item
  editItemSheet.value = true
}

function confirmDelete() {
  store.deleteList()
  deleteDialog.value = false
}
</script>

<template>
  <div class="shopping-view">

    <!-- Lists exist: show items, FAB -->
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
          icon
          variant="text"
          size="small"
          class="flex-0-0"
          :color="showHeaders ? undefined : 'primary'"
          :aria-label="showHeaders ? 'Hide aisle headers' : 'Show aisle headers'"
          @click="toggleHeaders"
        >
          <v-icon>{{ showHeaders ? 'mdi-label-outline' : 'mdi-label-off-outline' }}</v-icon>
        </v-btn>
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
          @click="aisleSheet = true"
        >
          <v-icon>mdi-view-list-outline</v-icon>
        </v-btn>
        <v-btn
          v-if="isParent"
          icon
          variant="text"
          size="small"
          class="flex-0-0 ml-1"
          @click="newListSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <!-- List -->
      <ShoppingList :show-headers="showHeaders" @edit="openEdit" />

      <!-- Add item FAB (parent only) -->
      <v-btn
        v-if="isParent"
        icon
        color="primary"
        size="56"
        elevation="4"
        class="fab"
        @click="addItemSheet = true"
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
        @click="newListSheet = true"
      >
        New list
      </v-btn>
    </div>

    <ShoppingAddItem v-model="addItemSheet" />
    <ShoppingEditItem v-model="editItemSheet" :item="editingItem" />
    <ShoppingNewList v-model="newListSheet" />

    <!-- Manage aisles bottom sheet (parent only) -->
    <v-bottom-sheet v-model="aisleSheet" max-width="600">
      <AisleManager @close="aisleSheet = false" />
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
  /* Clear the fixed FAB (bottom: 80px + 56px tall) so the last list items
     stay visible and tappable above it (#19). */
  padding-bottom: calc(152px + env(safe-area-inset-bottom));
}
.fab {
  position: fixed;
  bottom: 80px;
  right: 20px;
  /* Sit above sticky aisle section headers (z-index: 1) so the button is
     never covered while scrolling (#35). */
  z-index: 5;
}
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
