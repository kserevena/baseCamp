<script setup>
import { computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { useShoppingStore } from '@/stores/shopping.js'
import { useMealsStore } from '@/stores/meals.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'

const family = useFamilyStore()
const shopping = useShoppingStore()
const meals = useMealsStore()

const doneCount = computed(() => shopping.items.filter(i => i.done).length)
const totalCount = computed(() => shopping.items.length)

const topMeal = computed(() =>
  [...meals.meals].sort((a, b) => b.votes.length - a.votes.length)[0]
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
        <div class="d-flex align-center mb-2">
          <v-icon color="primary" class="mr-2">mdi-cart</v-icon>
          <span class="text-subtitle-1 font-weight-medium">Shopping list</span>
        </div>
        <v-progress-linear
          :model-value="totalCount ? (doneCount / totalCount) * 100 : 0"
          color="primary"
          rounded
          height="6"
          class="mb-1"
        />
        <span class="text-caption text-medium-emphasis">
          {{ doneCount }} of {{ totalCount }} items ticked
        </span>
      </v-card-text>
    </v-card>

    <!-- Meals summary -->
    <v-card rounded="lg" elevation="1" :to="'/meals'">
      <v-card-text>
        <div class="d-flex align-center mb-2">
          <v-icon color="primary" class="mr-2">mdi-silverware-fork-knife</v-icon>
          <span class="text-subtitle-1 font-weight-medium">Meal poll</span>
        </div>
        <div v-if="topMeal" class="d-flex align-center gap-2">
          <v-icon size="16" color="amber-darken-2">mdi-trophy</v-icon>
          <span class="text-body-2">{{ topMeal.name }}</span>
          <span class="text-caption text-medium-emphasis">({{ topMeal.votes.length }} votes)</span>
        </div>
      </v-card-text>
    </v-card>

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
.gap-4 { gap: 16px; }
.gap-3 { gap: 12px; }
.gap-2 { gap: 8px; }
.gap-1 { gap: 4px; }
</style>
