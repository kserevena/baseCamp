<script setup>
import FamilyAvatar from './FamilyAvatar.vue'
import { useShoppingStore } from '@/stores/shopping.js'
import { useUserRole } from '@/composables/useUserRole.js'

const props = defineProps({
  item: { type: Object, required: true },
  showDragHandle: { type: Boolean, default: false },
  showDelete: { type: Boolean, default: false },
  showEdit: { type: Boolean, default: false },
})

const emit = defineEmits(['delete', 'edit'])
const store = useShoppingStore()
const { isParent } = useUserRole()
</script>

<template>
  <v-list-item
    :class="{ 'item-done': item.done }"
    min-height="56"
    class="px-2"
    :style="showEdit ? 'cursor: pointer;' : ''"
    @click="showEdit && emit('edit')"
  >
    <template #prepend>
      <v-checkbox-btn
        :model-value="item.done"
        :disabled="!isParent"
        color="primary"
        class="mr-1"
        style="min-width: 44px;"
        @click.stop
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
        <v-btn
          v-if="showDelete"
          icon
          size="small"
          variant="plain"
          color="error"
          @click.stop="emit('delete')"
        >
          <v-icon>mdi-delete-outline</v-icon>
        </v-btn>
        <v-icon
          v-if="showDragHandle"
          class="drag-handle"
          color="medium-emphasis"
          style="min-width: 44px; cursor: grab;"
          @click.stop
        >mdi-drag</v-icon>
      </div>
    </template>
  </v-list-item>
</template>

<style scoped>
.item-done {
  opacity: 0.55;
}
</style>
