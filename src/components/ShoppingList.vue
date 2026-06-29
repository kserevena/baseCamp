<script setup>
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { useShoppingStore } from '@/stores/shopping.js'
import { useUserRole } from '@/composables/useUserRole.js'
import ShoppingItem from './ShoppingItem.vue'

const props = defineProps({
  showHeaders: { type: Boolean, default: true },
})

const store = useShoppingStore()
const { isParent } = useUserRole()
const emit = defineEmits(['edit'])

// Items without a sortOrder (null/undefined) sort after all explicitly ordered items,
// then fall back to alphabetical within that group.
const compareItems = (a, b) =>
  (a.sortOrder ?? Infinity) !== (b.sortOrder ?? Infinity)
    ? (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
    : a.name.localeCompare(b.name)

function buildGroups(items, aisles) {
  const activeItems = items.filter(i => !i.done)
  const groups = aisles.map(a => ({ aisle: a.name, aisleOrder: a.order, items: [] }))

  for (const item of activeItems) {
    let group = groups.find(g => g.aisle === item.aisle)
    if (!group) {
      group = { aisle: item.aisle, aisleOrder: item.aisleOrder ?? 99, items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }

  for (const group of groups) {
    group.items.sort(compareItems)
  }

  return groups
}

const doneItems = computed(() => store.items.filter(i => i.done))

const priorityItems = computed(() =>
  store.items.filter(i => !i.done && (i.priority ?? false)).sort(compareItems)
)

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

const undoSnackbar = ref(false)
const lastToggle = ref(null)

function onToggle(payload) {
  lastToggle.value = payload
  undoSnackbar.value = true
}

function undoToggle() {
  if (lastToggle.value) {
    store.restoreToggleState(lastToggle.value.id, lastToggle.value.previous)
  }
  undoSnackbar.value = false
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
    <template v-if="priorityItems.length > 0">
      <v-list-subheader v-if="showHeaders" class="aisle-header text-uppercase font-weight-bold priority-header">
        <v-icon size="small" color="warning" class="mr-1">mdi-star</v-icon>
        Priority
      </v-list-subheader>
      <ShoppingItem
        v-for="item in priorityItems"
        :key="item.id"
        :item="item"
        :show-priority="isParent"
        :show-delete="isParent"
        :show-edit="isParent"
        @delete="store.deleteItem(item.id)"
        @edit="emit('edit', item)"
        @toggle="onToggle"
        @toggle-priority="store.togglePriority(item.id)"
      />
      <v-divider />
    </template>

    <template v-for="group in groups" :key="group.aisle">
      <v-list-subheader v-if="showHeaders" class="aisle-header text-uppercase font-weight-bold">
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
          :show-priority="true"
          @delete="store.deleteItem(item.id)"
          @edit="emit('edit', item)"
          @toggle="onToggle"
          @toggle-priority="store.togglePriority(item.id)"
        />
      </VueDraggable>

      <template v-else>
        <ShoppingItem
          v-for="item in group.items"
          :key="item.id"
          :item="item"
          @toggle="onToggle"
        />
      </template>

      <v-divider />
    </template>

    <template v-if="doneItems.length > 0">
      <v-list-subheader v-if="showHeaders" class="aisle-header text-uppercase font-weight-bold done-header">
        Done ({{ doneItems.length }})
      </v-list-subheader>
      <div class="done-section">
        <ShoppingItem
          v-for="item in doneItems"
          :key="item.id"
          :item="item"
          :show-delete="isParent"
          :show-edit="isParent"
          @delete="store.deleteItem(item.id)"
          @edit="emit('edit', item)"
          @toggle="onToggle"
        />
      </div>
      <v-divider />
    </template>
  </v-list>

  <v-snackbar v-model="undoSnackbar" timeout="4000">
    {{ lastToggle?.done ? `"${lastToggle.name}" ticked` : `"${lastToggle?.name}" unticked` }}
    <template #actions>
      <v-btn color="primary" variant="text" @click="undoToggle">Undo</v-btn>
    </template>
  </v-snackbar>
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
.done-section {
  opacity: 0.5;
}
</style>
