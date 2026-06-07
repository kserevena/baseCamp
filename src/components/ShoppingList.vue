<script setup>
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useShoppingStore } from '@/stores/shopping.js'
import { useFamilyStore } from '@/stores/family.js'
import ShoppingItem from './ShoppingItem.vue'

const store = useShoppingStore()
const familyStore = useFamilyStore()
const emit = defineEmits(['edit'])

const isParent = computed(() => familyStore.currentUser?.role === 'parent')

function buildGroups(items, aisles) {
  const groups = aisles.map(a => ({ aisle: a.name, aisleOrder: a.order, items: [] }))

  for (const item of items) {
    let group = groups.find(g => g.aisle === item.aisle)
    if (!group) {
      group = { aisle: item.aisle, aisleOrder: item.aisleOrder ?? 99, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }

  for (const group of groups) {
    group.items.sort((a, b) =>
      (a.sortOrder ?? Infinity) !== (b.sortOrder ?? Infinity)
        ? (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
        : a.name.localeCompare(b.name)
    )
  }

  return groups
}

const groups = ref(buildGroups(store.items, store.activeAisles))
let pendingReorder = false

watch(
  [() => store.items, () => store.activeAisles],
  ([newItems, newAisles]) => {
    if (!pendingReorder) groups.value = buildGroups(newItems, newAisles)
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
          :show-delete="true"
          :show-edit="true"
          @delete="store.deleteItem(item.id)"
          @edit="emit('edit', item)"
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
