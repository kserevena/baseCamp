<script setup>
import { computed } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'
import ShoppingItem from './ShoppingItem.vue'

const store = useShoppingStore()

const grouped = computed(() => {
  const sorted = [...store.items].sort((a, b) =>
    a.aisleOrder !== b.aisleOrder ? a.aisleOrder - b.aisleOrder : a.name.localeCompare(b.name)
  )
  const groups = []
  let current = null
  for (const item of sorted) {
    if (!current || current.aisle !== item.aisle) {
      current = { aisle: item.aisle, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
})
</script>

<template>
  <v-list lines="two" class="py-0">
    <template v-for="group in grouped" :key="group.aisle">
      <v-list-subheader class="aisle-header text-uppercase font-weight-bold">
        {{ group.aisle }}
      </v-list-subheader>
      <ShoppingItem
        v-for="item in group.items"
        :key="item.id"
        :item="item"
      />
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
