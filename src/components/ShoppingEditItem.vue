<script setup>
import { ref, computed, watch } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { ITEM_NAME_MAX_LENGTH } from '@/constants/shopping.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  item: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const store = useShoppingStore()

const itemName = ref('')
const itemQty = ref('')
const itemAisle = ref('')
const destListId = ref(null)

const otherLists = computed(() =>
  store.lists.filter(l => l.id !== store.activeListId)
)

watch(() => props.modelValue, (open) => {
  if (open && props.item) {
    itemName.value = props.item.name
    itemQty.value = props.item.qty ?? ''
    itemAisle.value = props.item.aisle ?? store.activeAisles[0]?.name ?? ''
    destListId.value = null
  }
})

function submit() {
  const name = itemName.value.trim().slice(0, ITEM_NAME_MAX_LENGTH)
  if (!name) return
  store.updateItem(props.item.id, {
    name,
    qty: itemQty.value.trim(),
    aisle: itemAisle.value,
  })
  emit('update:modelValue', false)
}

function moveOrCopy(action) {
  if (!destListId.value || !props.item) return
  store.moveOrCopyItem(props.item.id, destListId.value, action)
  emit('update:modelValue', false)
}
</script>

<template>
  <v-bottom-sheet
    :model-value="modelValue"
    max-width="600"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <v-card rounded="t-xl" class="pa-4 edit-item-card">
      <div class="text-subtitle-1 font-weight-medium mb-3">Edit item</div>
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
      <template v-if="otherLists.length > 0">
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
          <v-btn variant="tonal" color="secondary" size="small" @click="moveOrCopy('copy')">Copy</v-btn>
          <v-btn variant="tonal" color="secondary" size="small" @click="moveOrCopy('move')">Move</v-btn>
        </div>
      </template>
      <div class="d-flex gap-2">
        <v-btn variant="text" @click="emit('update:modelValue', false)">Cancel</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="submit">Save</v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>

<style scoped>
.edit-item-card {
  max-height: 90vh; /* fallback for browsers without dvh support */
  max-height: 90dvh;
  overflow-y: auto;
}
</style>
