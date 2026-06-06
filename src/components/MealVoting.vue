<script setup>
import { computed } from 'vue'
import { useMealsStore } from '@/stores/meals.js'
import { useFamilyStore } from '@/stores/family.js'
import FamilyAvatar from './FamilyAvatar.vue'

const mealsStore = useMealsStore()
const familyStore = useFamilyStore()

const currentUid = computed(() => familyStore.currentUser?.uid ?? '')
const currentColour = computed(() => familyStore.currentUser?.colour ?? '#9E9E9E')

function hasVoted(meal) {
  return meal.votes.includes(currentUid.value)
}
</script>

<template>
  <div class="d-flex flex-column gap-3 pa-3">
    <v-card
      v-for="meal in mealsStore.meals"
      :key="meal.id"
      rounded="lg"
      elevation="1"
    >
      <v-card-text class="pb-2">
        <div class="d-flex align-center justify-space-between">
          <span class="text-body-1 font-weight-medium">{{ meal.name }}</span>
          <v-btn
            :color="hasVoted(meal) ? currentColour : 'grey-lighten-1'"
            :variant="hasVoted(meal) ? 'flat' : 'tonal'"
            icon
            size="40"
            @click="mealsStore.toggleVote(meal.id, currentUid)"
          >
            <v-icon>mdi-thumb-up</v-icon>
          </v-btn>
        </div>

        <div class="d-flex align-center mt-2 gap-1">
          <FamilyAvatar
            v-for="uid in meal.votes"
            :key="uid"
            :uid="uid"
            :size="28"
          />
          <span class="text-caption text-medium-emphasis ml-1">
            {{ meal.votes.length }} {{ meal.votes.length === 1 ? 'vote' : 'votes' }}
          </span>
        </div>
      </v-card-text>
    </v-card>
  </div>
</template>

<style scoped>
.gap-3 {
  gap: 12px;
}
.gap-1 {
  gap: 4px;
}
</style>
