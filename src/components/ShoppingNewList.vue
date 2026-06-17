<script setup>
import { ref } from 'vue'
import { useShoppingStore } from '@/stores/shopping.js'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const store = useShoppingStore()

const listName = ref('')

function createList() {
  if (!listName.value.trim()) return
  store.createList(listName.value.trim())
  listName.value = ''
  emit('update:modelValue', false)
}

function close() {
  emit('update:modelValue', false)
}
</script>

<template>
  <v-bottom-sheet :model-value="modelValue" max-width="600" @update:model-value="emit('update:modelValue', $event)">
    <v-card rounded="t-xl" class="pa-4">
      <div class="text-subtitle-1 font-weight-medium mb-3">New list</div>
      <v-text-field
        v-model="listName"
        label="List name"
        variant="outlined"
        autofocus
        class="mb-3"
        @keyup.enter="createList"
      />
      <div class="d-flex gap-2">
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-spacer />
        <v-btn color="primary" variant="flat" @click="createList">Create</v-btn>
      </div>
    </v-card>
  </v-bottom-sheet>
</template>
