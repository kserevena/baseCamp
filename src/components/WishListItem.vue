<script setup>
import { computed } from 'vue'
import FamilyAvatar from './FamilyAvatar.vue'
import { useWishListStore } from '@/stores/wishList.js'

const props = defineProps({
  item: { type: Object, required: true },
  // Whether the viewer may tick, edit, or delete this item (owner or parent).
  canWrite: { type: Boolean, default: false },
})

const emit = defineEmits(['edit', 'delete'])
const store = useWishListStore()

// Only shown on someone else's list — on your own list every avatar would be
// yours, which tells the reader nothing.
const showDoneBy = computed(() =>
  Boolean(props.item.done && props.item.doneBy && props.item.doneBy !== props.item.ownerUid)
)
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
        :disabled="!canWrite"
        color="primary"
        class="mr-1"
        style="min-width: 44px;"
        @click.stop
        @update:model-value="store.toggleDone(item.id)"
      />
    </template>

    <v-list-item-title
      class="text-wrap"
      :class="{ 'text-decoration-line-through text-medium-emphasis': item.done }"
    >
      {{ item.name }}
    </v-list-item-title>
    <v-list-item-subtitle v-if="item.note" class="text-wrap">{{ item.note }}</v-list-item-subtitle>

    <template #append>
      <div class="d-flex align-center gap-2">
        <v-btn
          v-if="item.link"
          icon
          size="small"
          variant="plain"
          :href="item.link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open link"
          @click.stop
        >
          <v-icon>mdi-open-in-new</v-icon>
        </v-btn>
        <FamilyAvatar v-if="showDoneBy" :uid="item.doneBy" :size="28" />
        <v-btn
          v-if="canWrite"
          icon
          size="small"
          variant="plain"
          color="medium-emphasis"
          aria-label="Edit item"
          @click.stop="emit('edit')"
        >
          <v-icon>mdi-pencil-outline</v-icon>
        </v-btn>
        <v-btn
          v-if="canWrite"
          icon
          size="small"
          variant="plain"
          color="error"
          aria-label="Delete item"
          @click.stop="emit('delete')"
        >
          <v-icon>mdi-delete-outline</v-icon>
        </v-btn>
      </div>
    </template>
  </v-list-item>
</template>

<style scoped>
.item-done {
  opacity: 0.55;
}
</style>
