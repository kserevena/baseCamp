<script setup>
import FamilyAvatar from './FamilyAvatar.vue'
import { useShoppingStore } from '@/stores/shopping.js'

const props = defineProps({
  item: { type: Object, required: true },
})

const store = useShoppingStore()
</script>

<template>
  <v-list-item
    :class="{ 'item-done': item.done }"
    min-height="56"
    class="px-2"
  >
    <template #prepend>
      <v-checkbox-btn
        :model-value="item.done"
        color="primary"
        class="mr-1"
        style="min-width: 44px;"
        @update:model-value="store.toggleDone(item.id)"
      />
    </template>

    <v-list-item-title :class="{ 'text-decoration-line-through text-medium-emphasis': item.done }">
      {{ item.name }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="item.qty">{{ item.qty }}</v-list-item-subtitle>

    <template #append>
      <div class="d-flex align-center gap-2">
        <v-chip
          v-if="item.fromMeal"
          size="x-small"
          color="deep-purple"
          variant="tonal"
          label
        >
          meal
        </v-chip>
        <FamilyAvatar :uid="item.addedBy" :size="28" />
      </div>
    </template>
  </v-list-item>
</template>

<style scoped>
.item-done {
  opacity: 0.55;
}
.gap-2 {
  gap: 8px;
}
</style>
