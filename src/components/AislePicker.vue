<script setup>
import { useShoppingStore } from '@/stores/shopping.js'

defineProps({
  modelValue: { type: String, default: '' },
})
defineEmits(['update:modelValue'])

const store = useShoppingStore()
</script>

<template>
  <div class="aisle-chips d-flex flex-wrap gap-1">
    <v-chip
      v-for="aisle in store.activeAisles"
      :key="aisle.name"
      :color="modelValue === aisle.name ? 'primary' : undefined"
      :variant="modelValue === aisle.name ? 'flat' : 'tonal'"
      size="small"
      @click="$emit('update:modelValue', aisle.name)"
    >
      {{ aisle.name }}
    </v-chip>
  </div>
</template>
