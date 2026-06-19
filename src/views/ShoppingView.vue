<script setup>
import { ref, computed, watch } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { useFamilyStore } from '@/stores/family.js'
import { useUserRole } from '@/composables/useUserRole.js'
import { useKeyboardAwareSheet } from '@/composables/useKeyboardAwareSheet.js'
import { ITEM_NAME_MAX_LENGTH } from '@/constants/shopping.js'
import ShoppingList from '@/components/ShoppingList.vue'
import AisleManager from '@/components/AisleManager.vue'

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

// Single bottom sheet shared between "Add item" and "Edit item" — itemMode
// distinguishes the two; only the fields and submit behaviour differ.
const sheet = ref(false)
const itemMode = ref('add') // 'add' | 'edit'
const editItem = ref(null)
const itemName = ref('')
const itemQty = ref('')
const itemAisle = ref('')
const selectedDoneItem = ref(null)
const destListId = ref(null)

const otherLists = computed(() =>
  store.lists.filter(l => l.id !== store.activeListId)
)

const doneSuggestions = computed(() => {
  if (itemMode.value !== 'add') return []
  const q = itemName.value.trim().toLowerCase()
  if (!q) return []
  const seen = new Set()
  return store.items
    .filter(i => {
      if (!i.done || !i.name.toLowerCase().includes(q)) return false
      const key = i.name.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 5)
})

watch(itemName, (val) => {
  if (selectedDoneItem.value && val.trim() !== selectedDoneItem.value.name) {
    selectedDoneItem.value = null
  }
})

function selectSuggestion(item) {
  selectedDoneItem.value = item
  itemName.value = item.name
  itemQty.value = item.qty ?? ''
  itemAisle.value = item.aisle ?? store.activeAisles[0]?.name ?? ''
}

function openAdd() {
  itemMode.value = 'add'
  itemName.value = ''
  itemQty.value = ''
  itemAisle.value = store.activeAisles[0]?.name ?? ''
  selectedDoneItem.value = null
  destListId.value = null
  sheet.value = true
}

function moveOrCopy(action) {
  if (!destListId.value || !editItem.value) return
  store.moveOrCopyItem(editItem.value.id, destListId.value, action)
  sheet.value = false
}

function openEdit(item) {
  itemMode.value = 'edit'
  editItem.value = item
  itemName.value = item.name
  itemQty.value = item.qty ?? ''
  itemAisle.value = item.aisle ?? store.activeAisles[0]?.name ?? ''
  destListId.value = null
  sheet.value = true
}

function submit() {
  const name = itemName.value.trim().slice(0, ITEM_NAME_MAX_LENGTH)
  if (!name) return
  if (itemMode.value === 'edit') {
    store.updateItem(editItem.value.id, {
      name,
      qty: itemQty.value.trim(),
      aisle: itemAisle.value,
    })
  } else if (selectedDoneItem.value) {
    const restored = store.restoreItem(selectedDoneItem.value.id, itemQty.value.trim(), itemAisle.value || null)
    if (!restored) store.addItem(name, itemQty.value.trim(), itemAisle.value || null)
  } else {
    store.addItem(name, itemQty.value.trim(), itemAisle.value || null)
  }
  itemName.value = ''
  itemQty.value = ''
  selectedDoneItem.value = null
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

const aisleSheet = ref(false)

// Keep all three bottom sheets that contain text inputs above the Android
// virtual keyboard. See useKeyboardAwareSheet for the full explanation.
useKeyboardAwareSheet(sheet, '--add-item-sheet-bottom')
useKeyboardAwareSheet(listSheet, '--list-sheet-bottom')
useKeyboardAwareSheet(aisleSheet, '--aisle-manager-sheet-bottom')

watch(sheet, (open) => { if (!open) selectedDoneItem.value = null })
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
          @click="listSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <!-- List -->
      <ShoppingList :show-headers="showHeaders" @edit="openEdit" />

      <!-- Add item FAB -->
      <v-btn
        v-if="isParent"
        icon
        color="primary"
        size="56"
        elevation="4"
        class="fab"
        @click="openAdd"
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

    <!-- Add/edit item bottom sheet (shared between both flows) -->
    <v-bottom-sheet v-model="sheet" max-width="600" content-class="add-item-overlay">
      <v-card rounded="t-xl" class="pa-4 add-item-card">
        <div class="text-subtitle-1 font-weight-medium mb-3">
          {{ itemMode === 'edit' ? 'Edit item' : 'Add item' }}
        </div>
        <v-text-field
          v-model="itemName"
          label="Item name"
          variant="outlined"
          autofocus
          class="mb-2"
          :maxlength="ITEM_NAME_MAX_LENGTH"
          :counter="ITEM_NAME_MAX_LENGTH"
          @keyup.enter="submit"
        />
        <div v-if="doneSuggestions.length" class="mb-2">
          <div class="text-caption text-medium-emphasis mb-1">Re-add</div>
          <div class="d-flex flex-wrap gap-1">
            <v-chip
              v-for="item in doneSuggestions"
              :key="item.id"
              size="small"
              variant="tonal"
              color="primary"
              @click="selectSuggestion(item)"
            >
              {{ item.name }}
            </v-chip>
          </div>
        </div>
        <v-text-field
          v-model="itemQty"
          label="Quantity (optional)"
          variant="outlined"
          class="mb-2"
          @keyup.enter="submit"
        />
        <div class="mb-3">
          <div class="text-caption text-medium-emphasis mb-2">Aisle</div>
          <div class="aisle-chips d-flex flex-wrap gap-1">
            <v-chip
              v-for="aisle in store.activeAisles"
              :key="aisle.name"
              :color="itemAisle === aisle.name ? 'primary' : undefined"
              :variant="itemAisle === aisle.name ? 'flat' : 'tonal'"
              size="small"
              @click="itemAisle = aisle.name"
            >
              {{ aisle.name }}
            </v-chip>
          </div>
        </div>
        <!-- Move / copy to another list — only in edit mode when >1 list exists -->
        <template v-if="itemMode === 'edit' && otherLists.length > 0">
          <v-divider class="my-3" />
          <div class="text-caption text-medium-emphasis mb-2">Move or copy to list</div>
          <div class="d-flex flex-wrap gap-1 mb-3">
            <v-chip
              v-for="list in otherLists"
              :key="list.id"
              :color="destListId === list.id ? 'secondary' : undefined"
              :variant="destListId === list.id ? 'flat' : 'tonal'"
              size="small"
              @click="destListId = destListId === list.id ? null : list.id"
            >
              {{ list.name }}
            </v-chip>
          </div>
          <div v-if="destListId" class="d-flex gap-2 mb-3">
            <v-btn
              variant="tonal"
              color="secondary"
              size="small"
              @click="moveOrCopy('copy')"
            >
              Copy
            </v-btn>
            <v-btn
              variant="tonal"
              color="secondary"
              size="small"
              @click="moveOrCopy('move')"
            >
              Move
            </v-btn>
          </div>
        </template>

        <div class="d-flex gap-2">
          <v-btn variant="text" @click="sheet = false">Cancel</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="submit">
            {{ itemMode === 'edit' ? 'Save' : 'Add' }}
          </v-btn>
        </div>
      </v-card>
    </v-bottom-sheet>

    <!-- New list bottom sheet -->
    <v-bottom-sheet v-model="listSheet" max-width="600" content-class="list-sheet-overlay">
      <v-card rounded="t-xl" class="pa-4 new-list-card">
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

    <!-- Manage aisles bottom sheet (parent only) -->
    <v-bottom-sheet v-model="aisleSheet" max-width="600" content-class="aisle-manager-overlay">
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

<!-- Unscoped: targets Vuetify overlay content elements which are teleported
     to <body> and therefore outside this component's scoped CSS reach.
     Each CSS var is driven by useKeyboardAwareSheet (#49, #109). -->
<style>
.add-item-overlay {
  margin-bottom: var(--add-item-sheet-bottom, 0px);
  transition: margin-bottom 0.15s ease;
}
.list-sheet-overlay {
  margin-bottom: var(--list-sheet-bottom, 0px);
  transition: margin-bottom 0.15s ease;
}
.aisle-manager-overlay {
  margin-bottom: var(--aisle-manager-sheet-bottom, 0px);
  transition: margin-bottom 0.15s ease;
}
</style>

<style scoped>
.shopping-view {
  position: relative;
  min-height: calc(100vh - 64px);
  /* Clear the fixed FAB (bottom: 80px + 56px tall) so the last list items
     stay visible and tappable above it (#19). The .fab rule itself lives in
     utilities.css. */
  padding-bottom: calc(152px + env(safe-area-inset-bottom));
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
/* dvh shrinks when the Android keyboard is shown, keeping the cards visible
   above the keyboard. Both sheets that contain text inputs need this guard. */
.add-item-card,
.new-list-card {
  max-height: 90vh; /* fallback for browsers without dvh support */
  max-height: 90dvh;
  overflow-y: auto;
}
</style>
