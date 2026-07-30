<script setup>
import { computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { useShoppingStore } from '@/stores/shopping.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'
import JobsPreview from '@/components/JobsPreview.vue'

const family = useFamilyStore()
const shopping = useShoppingStore()

// Mirrors what ShoppingView actually shows: once a family has supermarkets
// (issue #137 Part B), the meaningful "which view was I last in" state is the
// selected supermarket (store.selectedSupermarketId, restored from
// localStorage in shopping.js's setup()), not the underlying list — most
// families only ever have one list. Pre-migration families with no
// supermarkets yet fall back to the active list's name, as before.
const shoppingSummary = computed(() => {
  if (!shopping.activeListId) return null
  if (shopping.supermarkets.length > 0) {
    return shopping.selectedSupermarket?.name ?? 'All items'
  }
  return shopping.lists.find(l => l.id === shopping.activeListId)?.name ?? null
})
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
        <div v-if="shoppingSummary" class="text-body-2 text-medium-emphasis mt-1">
          {{ shoppingSummary }}
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
