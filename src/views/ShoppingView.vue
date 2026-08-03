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
    // Otherwise the abandoned suggestion's allocation would silently carry
    // over onto whatever new item the user ends up adding.
    itemAllSupermarkets.value = false
    itemSupermarketIds.value = []
  }
})

function selectSuggestion(item) {
  selectedDoneItem.value = item
  itemName.value = item.name
  itemQty.value = item.qty ?? ''
  itemAisle.value = item.aisle ?? store.activeAisles[0]?.name ?? ''
  // Restore the item's own supermarket allocation into the picker so it
  // reflects reality instead of showing openAdd's "unallocated" default.
  itemAllSupermarkets.value = item.allSupermarkets ?? false
  itemSupermarketIds.value = [...(item.supermarketIds ?? [])]
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
    const restored = store.restoreItem(selectedDoneItem.value.id, itemQty.value.trim(), itemAisle.value || null, allocation)
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
        <!-- Aisle + supermarket allocation share ONE scrollable region. It is
             the sheet's flex-grow child, so it absorbs whatever vertical space
             is left once the fields, the Re-add row and the buttons have taken
             theirs — no measuring, no budget. When the keyboard opens the card
             shrinks (dvh) and this region gives up the space; when it closes
             the region takes it back. See .chip-picker-section in <style>. -->
        <div class="chip-picker-section mb-3">
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
          <div v-if="store.supermarkets.length > 0">
            <div class="text-caption text-medium-emphasis mb-2">Available in</div>
            <div class="supermarket-alloc-chips d-flex flex-wrap gap-1">
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

        <div class="d-flex gap-2">
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
/* The Add item sheet fills the screen (less a strip showing the scrim, so it
   still reads as a sheet rather than a page) and shrinks to match when the
   keyboard opens.

   The height must live here, on Vuetify's .v-overlay__content wrapper, rather
   than on the card: the wrapper is a flex container whose own height is
   content-driven, so a dvh height set on the card alone is ignored and the
   sheet stays content-sized. The card then takes height:100% of this.

   This works *only* because index.html sets interactive-widget=resizes-content:
   under the browser default (resizes-visual) the on-screen keyboard shrinks the
   visual viewport but leaves the layout viewport — and therefore vh/dvh — at
   full height, so this rule would let the sheet extend underneath the keyboard.
   Do not remove that meta tag. dvh alone does NOT account for the keyboard;
   it accounts for retracting browser UI such as the address bar. */
.add-item-overlay {
  margin-bottom: var(--add-item-sheet-bottom, 0px);
  transition: margin-bottom 0.15s ease;
  height: 92vh; /* fallback for browsers without dvh support */
  height: 92dvh;
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
/* .chip-picker-section holds the Aisle + Available in pickers in a single
   shared scrolling region. It is the flex-grow child of .add-item-card, so
   it takes whatever height is left after the fixed-height parts of the sheet
   (title, two text fields, the optional Re-add row, the button row) and
   scrolls internally when the family has more aisles/supermarkets than fit.
   min-height: 0 is required — without it a flex child refuses to shrink
   below its content size and the card overflows instead of the region
   scrolling.

   Earlier versions of this fix (#162) instead capped this region at a
   hard-coded 236px budget, measured by hand and reduced at runtime by the
   Re-add row's live offsetHeight, purely to keep the sheet short enough that
   the keyboard never covered the Item name field. That is no longer
   necessary: the card is sized in dvh and the viewport itself now shrinks
   for the keyboard (see interactive-widget in index.html), so the sheet
   simply cannot extend under the keyboard and there is nothing to budget
   for. */
.add-item-card > .chip-picker-section {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
.aisle-chips,
.supermarket-alloc-chips {
  gap: 6px 8px;
}
/* Fills the .add-item-overlay wrapper, which carries the dvh height (see the
   unscoped block above for why the height cannot live here). */
.add-item-card {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden; /* the chip-picker-section is the only scrolling part */
}
/* Everything except the chip picker keeps its natural height, so the picker is
   the only thing that gives way as the card shrinks. Without this the text
   fields and the Cancel/Add row would shrink too and the buttons could be
   squashed out of reach. */
.add-item-card > * {
  flex: 0 0 auto;
}
/* The New list sheet has a single field and no variable-length content, so it
   stays content-sized and only needs the cap. */
.new-list-card {
  max-height: 92vh; /* fallback for browsers without dvh support */
  max-height: 92dvh;
  overflow-y: auto;
}
</style>
