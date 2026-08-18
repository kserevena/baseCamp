<script setup>
import { computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { useShoppingStore } from '@/stores/shopping.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'
import JobsPreview from '@/components/JobsPreview.vue'

const family = useFamilyStore()
const shopping = useShoppingStore()

// Issue #197: the last-viewed list/supermarket name isn't actionable — show
// the priority items that still need buying instead. Priority is list-wide
// (not per-supermarket), so this reads shopping.items directly rather than
// the supermarket-filtered visibleItems.
const priorityItems = computed(() =>
  shopping.items.filter(i => (i.priority ?? false) && !i.done)
)
</script>

<template>
  <div class="pa-4 d-flex flex-column gap-4">
    <div class="text-h5 font-weight-bold mt-2">
      Hello, {{ family.currentUser?.name }}
    </div>

    <!-- Shopping summary -->
    <v-card rounded="lg" elevation="1" :to="'/shopping'">
      <v-card-text>
        <div class="d-flex align-center">
          <v-icon color="primary" class="mr-2">mdi-cart</v-icon>
          <span class="text-subtitle-1 font-weight-medium">Shopping list</span>
        </div>

        <!-- Priority items -->
        <div v-if="priorityItems.length > 0" class="priority-items-container mt-2">
          <div
            v-for="item in priorityItems"
            :key="item.id"
            class="d-flex align-center gap-2 py-1"
          >
            <v-icon color="error" size="16">mdi-alert-circle</v-icon>
            <span class="text-body-2 text-truncate flex-grow-1" style="min-width: 0">{{ item.name }}</span>
          </div>
        </div>
        <div v-else class="text-body-2 text-medium-emphasis mt-1">
          No priority items
        </div>
      </v-card-text>
    </v-card>

    <!-- Top household jobs preview -->
    <JobsPreview />

    <!-- Family avatars -->
    <v-card rounded="lg" elevation="1">
      <v-card-text>
        <div class="text-subtitle-1 font-weight-medium mb-3">Family</div>
        <div class="d-flex gap-3 flex-wrap">
          <div
            v-for="member in family.members"
            :key="member.uid"
            class="d-flex flex-column align-center gap-1"
          >
            <FamilyAvatar :uid="member.uid" :size="44" />
            <span class="text-caption">{{ member.name }}</span>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.priority-items-container {
  max-height: 180px;
  overflow-y: auto;
}
</style>
