<script setup>
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useShoppingStore } from '@/stores/shopping.js'
import { useFamilyStore } from '@/stores/family.js'
import ShoppingItem from './ShoppingItem.vue'

const store = useShoppingStore()
const familyStore = useFamilyStore()

const isParent = computed(() => familyStore.currentUser?.role === 'parent')

function buildGroups(items) {
  const sorted = [...items].sort((a, b) =>
    a.aisleOrder !== b.aisleOrder
      ? (a.aisleOrder ?? 3) - (b.aisleOrder ?? 3)
      : (a.sortOrder ?? Infinity) !== (b.sortOrder ?? Infinity)
        ? (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
        : a.name.localeCompare(b.name)
  )
  const groups = []
  let current = null
  for (const item of sorted) {
    if (!current || current.aisle !== item.aisle) {
      current = { aisle: item.aisle, aisleOrder: item.aisleOrder ?? 3, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

const groups = ref(buildGroups(store.items))
let pendingReorder = false

watch(
  () => store.items,
  (newItems) => {
    if (!pendingReorder) groups.value = buildGroups(newItems)
  },
)

function onDragStart() {
  pendingReorder = true
}

function onDragEnd() {
  const updates = []
  groups.value.forEach((group) => {
    group.items.forEach((item, idx) => {
      const update = { id: item.id, sortOrder: idx * 100 }
      if (item.aisle !== group.aisle) {
        update.aisle = group.aisle
        update.aisleOrder = group.aisleOrder
      }
      updates.push(update)
    })
  })
  store.reorderItems(updates)
  pendingReorder = false
}
</script>

<template>
  <v-list lines="two" class="py-0">
    <template v-for="group in groups" :key="group.aisle">
      <v-list-subheader class="aisle-header text-uppercase font-weight-bold">
        {{ group.aisle }}
      </v-list-subheader>

      <VueDraggable
        v-if="isParent"
        v-model="group.items"
        group="shopping-items"
        handle=".drag-handle"
        :animation="150"
        @start="onDragStart"
        @end="onDragEnd"
      >
        <ShoppingItem
          v-for="item in group.items"
          :key="item.id"
          :item="item"
          :show-drag-handle="true"
        />
      </VueDraggable>

      <template v-else>
        <ShoppingItem
          v-for="item in group.items"
          :key="item.id"
          :item="item"
        />
      </template>

      <v-divider />
    </template>
  </v-list>
</template>

<style scoped>
.aisle-header {
  background: rgb(var(--v-theme-surface));
  position: sticky;
  top: 0;
  z-index: 1;
  letter-spacing: 0.06em;
  font-size: 0.7rem;
}
</style>
