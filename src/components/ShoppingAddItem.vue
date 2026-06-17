<script setup>
import { ref, computed, watch } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { ITEM_NAME_MAX_LENGTH } from '@/constants/shopping.js'

const props = defineProps({ modelValue: { type: Boolean, default: false } })
const emit = defineEmits(['update:modelValue'])

const store = useShoppingStore()

const itemName = ref('')
const itemQty = ref('')
const itemAisle = ref('')
const selectedDoneItem = ref(null)

const doneSuggestions = computed(() => {
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

// On Android, tapping an aisle chip dismisses the keyboard and the visual
// viewport snaps back to full height. Without intervention the Vuetify overlay
// content can end up partially below the screen edge during that snap.
//
// Fix: track the keyboard height via the Visual Viewport API and store it as
// --add-item-sheet-bottom on :root. The .add-item-overlay CSS rule uses this
// to apply a margin-bottom that lifts the sheet above the keyboard (#49).
function syncKbd() {
  const vv = window.visualViewport
  const h = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
  document.documentElement.style.setProperty('--add-item-sheet-bottom', `${h}px`)
}

watch(() => props.modelValue, (open) => {
  if (open) {
    itemName.value = ''
    itemQty.value = ''
    itemAisle.value = store.activeAisles[0]?.name ?? ''
    selectedDoneItem.value = null
    syncKbd()
    window.visualViewport?.addEventListener('resize', syncKbd)
  } else {
    selectedDoneItem.value = null
    window.visualViewport?.removeEventListener('resize', syncKbd)
    document.documentElement.style.setProperty('--add-item-sheet-bottom', '0px')
  }
})

function submit() {
  const name = itemName.value.trim().slice(0, ITEM_NAME_MAX_LENGTH)
  if (!name) return
  if (selectedDoneItem.value) {
    const restored = store.restoreItem(selectedDoneItem.value.id, itemQty.value.trim(), itemAisle.value || null)
    if (!restored) store.addItem(name, itemQty.value.trim(), itemAisle.value || null)
  } else {
    store.addItem(name, itemQty.value.trim(), itemAisle.value || null)
  }
  itemName.value = ''
  itemQty.value = ''
  selectedDoneItem.value = null
  emit('update:modelValue', false)
}
</script>

<template>
  <v-bottom-sheet
    :model-value="modelValue"
    max-width="600"
    content-class="add-item-overlay"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="t-xl" class="pa-4 add-item-card">
      <div class="text-subtitle-1 font-weight-medium mb-3">Add item</div>
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
      <div class="d-flex gap-2">
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="submit">Add</v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<!-- Unscoped: targets the Vuetify overlay content element which is teleported
     to <body> and therefore outside this component's scoped CSS reach. -->
<style>
.add-item-overlay {
  margin-bottom: var(--add-item-sheet-bottom, 0px);
  transition: margin-bottom 0.15s ease;
}
</style>

<style scoped>
/* dvh (dynamic viewport height) shrinks automatically when the Android virtual
   keyboard is shown, keeping the card fully visible above the keyboard (#49). */
.add-item-card {
  max-height: 90vh; /* fallback for browsers without dvh support */
  max-height: 90dvh;
  overflow-y: auto;
}
</style>
