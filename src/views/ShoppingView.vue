<script setup>
import { ref, computed, watch } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { useFamilyStore } from '@/stores/family.js'
import { useUserRole } from '@/composables/useUserRole.js'
import { useKeyboardAwareSheet } from '@/composables/useKeyboardAwareSheet.js'
import { ITEM_NAME_MAX_LENGTH } from '@/constants/shopping.js'
import ShoppingList from '@/components/ShoppingList.vue'
import SupermarketManager from '@/components/SupermarketManager.vue'

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

// Auto-provision the family's default supermarket once a parent has loaded a
// list and no supermarket exists yet — the automatic, additive migration for
// existing families. The store guards against double-creation.
watch(
  () => [isParent.value, store.supermarketsLoaded, store.supermarkets.length, store.activeListId],
  () => {
    if (isParent.value && store.supermarketsLoaded && store.supermarkets.length === 0 && store.activeListId) {
      store.ensureDefaultSupermarket()
    }
  },
  { immediate: true },
)

// Single bottom sheet shared between "Add item" and "Edit item" — itemMode
// distinguishes the two; only the fields and submit behaviour differ.
const sheet = ref(false)
const itemMode = ref('add') // 'add' | 'edit'
const editItem = ref(null)
const itemName = ref('')
const itemQty = ref('')
const itemAisle = ref('')
const selectedDoneItem = ref(null)
// Item → supermarket allocation. Empty ids + allSupermarkets false = unallocated.
const itemAllSupermarkets = ref(false)
const itemSupermarketIds = ref([])

const allocationHint = computed(() => {
  if (itemAllSupermarkets.value) return 'Shown in every store'
  if (itemSupermarketIds.value.length === 0) return 'Unallocated — shown in every store'
  const names = store.supermarkets
    .filter(s => itemSupermarketIds.value.includes(s.id))
    .map(s => s.name)
  return `Shown in: ${names.join(', ')}`
})

function toggleAllSupermarkets() {
  itemAllSupermarkets.value = !itemAllSupermarkets.value
  if (itemAllSupermarkets.value) itemSupermarketIds.value = []
}

function toggleSupermarket(id) {
  itemAllSupermarkets.value = false
  itemSupermarketIds.value = itemSupermarketIds.value.includes(id)
    ? itemSupermarketIds.value.filter(x => x !== id)
    : [...itemSupermarketIds.value, id]
}

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
  // New items default to unallocated (visible everywhere).
  itemAllSupermarkets.value = false
  itemSupermarketIds.value = []
  sheet.value = true
}

function openEdit(item) {
  itemMode.value = 'edit'
  editItem.value = item
  itemName.value = item.name
  itemQty.value = item.qty ?? ''
  itemAisle.value = item.aisle ?? store.activeAisles[0]?.name ?? ''
  itemAllSupermarkets.value = item.allSupermarkets ?? false
  itemSupermarketIds.value = [...(item.supermarketIds ?? [])]
  sheet.value = true
}

function submit() {
  const name = itemName.value.trim().slice(0, ITEM_NAME_MAX_LENGTH)
  if (!name) return
  const allocation = {
    supermarketIds: itemAllSupermarkets.value ? [] : itemSupermarketIds.value,
    allSupermarkets: itemAllSupermarkets.value,
  }
  if (itemMode.value === 'edit') {
    store.updateItem(editItem.value.id, {
      name,
      qty: itemQty.value.trim(),
      aisle: itemAisle.value,
      ...allocation,
    })
  } else if (selectedDoneItem.value) {
    const restored = store.restoreItem(selectedDoneItem.value.id, itemQty.value.trim(), itemAisle.value || null)
    if (!restored) store.addItem(name, itemQty.value.trim(), itemAisle.value || null, allocation)
  } else {
    store.addItem(name, itemQty.value.trim(), itemAisle.value || null, allocation)
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

const supermarketSheet = ref(false)

// Keep all bottom sheets that contain text inputs above the Android virtual
// keyboard. See useKeyboardAwareSheet for the full explanation.
useKeyboardAwareSheet(sheet, '--add-item-sheet-bottom')
useKeyboardAwareSheet(listSheet, '--list-sheet-bottom')
useKeyboardAwareSheet(supermarketSheet, '--supermarket-manager-sheet-bottom')

watch(sheet, (open) => { if (!open) selectedDoneItem.value = null })
</script>

<template>
  <div class="shopping-view">

    <!-- List exists: supermarket selector, items, FAB -->
    <template v-if="hasLists">
      <!-- Supermarket selector: "All items" (raw list) plus one chip per store -->
      <div class="list-selector px-2 pt-2">
        <div class="list-chips">
          <v-chip
            :color="store.selectedSupermarketId === null ? 'primary' : undefined"
            :variant="store.selectedSupermarketId === null ? 'flat' : 'tonal'"
            :prepend-icon="store.selectedSupermarketId === null ? 'mdi-check' : undefined"
            size="small"
            @click="store.selectSupermarket(null)"
          >
            All items
          </v-chip>
          <v-chip
            v-for="sm in store.supermarkets"
            :key="sm.id"
            :color="store.selectedSupermarketId === sm.id ? 'primary' : undefined"
            :variant="store.selectedSupermarketId === sm.id ? 'flat' : 'tonal'"
            :prepend-icon="store.selectedSupermarketId === sm.id ? 'mdi-check' : undefined"
            size="small"
            @click="store.selectSupermarket(sm.id)"
          >
            {{ sm.name }}
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
          class="flex-0-0 ml-1"
          aria-label="Manage supermarkets"
          @click="supermarketSheet = true"
        >
          <v-icon>mdi-storefront-outline</v-icon>
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

    <!-- No list yet: empty state -->
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
        Create shopping list
      </v-btn>
    </div>

    <!-- Add/edit item bottom sheet (shared between both flows).
         The card is a fixed header/scrollable body/fixed footer flex column
         (#162) rather than one uniformly-scrolling block: the two text
         fields (name, quantity) live in the header so the on-screen
         keyboard can never scroll them out of view — only the tap-only
         chip pickers below them scroll. -->
    <v-bottom-sheet v-model="sheet" max-width="600" content-class="add-item-overlay">
      <v-card rounded="t-xl" class="add-item-card">
        <div class="add-item-header pa-4 pb-0">
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
          <v-text-field
            v-model="itemQty"
            label="Quantity (optional)"
            variant="outlined"
            class="mb-2"
            @keyup.enter="submit"
          />
        </div>

        <div class="add-item-scroll px-4">
          <div v-if="doneSuggestions.length" class="mb-3">
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

          <!-- Supermarket allocation — only shown once the family has supermarkets -->
          <div v-if="store.supermarkets.length > 0" class="mb-3">
            <div class="text-caption text-medium-emphasis mb-2">Available in</div>
            <div class="d-flex flex-wrap gap-1">
              <v-chip
                :color="itemAllSupermarkets ? 'primary' : undefined"
                :variant="itemAllSupermarkets ? 'flat' : 'tonal'"
                size="small"
                @click="toggleAllSupermarkets"
              >
                All supermarkets
              </v-chip>
              <v-chip
                v-for="sm in store.supermarkets"
                :key="sm.id"
                :color="itemSupermarketIds.includes(sm.id) ? 'primary' : undefined"
                :variant="itemSupermarketIds.includes(sm.id) ? 'flat' : 'tonal'"
                size="small"
                @click="toggleSupermarket(sm.id)"
              >
                {{ sm.name }}
              </v-chip>
            </div>
            <div class="text-caption text-medium-emphasis mt-1">{{ allocationHint }}</div>
          </div>
        </div>

        <div class="add-item-footer pa-4 pt-2 d-flex gap-2">
          <v-btn variant="text" @click="sheet = false">Cancel</v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="submit">
            {{ itemMode === 'edit' ? 'Save' : 'Add' }}
          </v-btn>
        </div>
      </v-card>
    </v-bottom-sheet>

    <!-- New list bottom sheet (first-time onboarding of the single list) -->
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

    <!-- Manage supermarkets bottom sheet (parent only) -->
    <v-bottom-sheet v-model="supermarketSheet" max-width="600" content-class="supermarket-manager-overlay">
      <SupermarketManager @close="supermarketSheet = false" />
    </v-bottom-sheet>

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
.supermarket-manager-overlay {
  margin-bottom: var(--supermarket-manager-sheet-bottom, 0px);
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
  align-items: flex-start;
}
.list-chips {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px 8px;
  /* Cap the wrapped chip row at two lines so a family with many supermarkets
     doesn't push the list down indefinitely — extra rows scroll instead.
     max-height is a border-box height, so it must include the container's
     own padding: 2 x 26px "small" chip height + 6px row gap + 8px (4px top
     + 4px bottom) padding = 66px. A bare 58px (chip content only) leaves no
     room for the padding and triggers a scrollbar after just two lines. */
  max-height: 66px;
  overflow-y: auto;
  padding: 4px 0;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding-top: 100px;
}
/* dvh shrinks when the Android keyboard is shown, keeping the card visible
   above the keyboard. */
.new-list-card {
  max-height: 90vh; /* fallback for browsers without dvh support */
  max-height: 90dvh;
  overflow-y: auto;
}
/* Add/edit item card is a fixed header/scrollable body/fixed footer column
   rather than one uniformly-scrolling block (#162): the header (name/qty
   fields) and footer (buttons) are always visible above the keyboard;
   only the tap-only chip pickers in the middle scroll. The card itself
   does not scroll — overflow is hidden so only .add-item-scroll does. */
.add-item-card {
  max-height: 90vh; /* fallback for browsers without dvh support */
  max-height: 90dvh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.add-item-header,
.add-item-footer {
  flex: none;
}
.add-item-scroll {
  flex: 1 1 auto;
  min-height: 0; /* let this flex child shrink below its content height so it scrolls instead of the card */
  overflow-y: auto;
}
</style>
