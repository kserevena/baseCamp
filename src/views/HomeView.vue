<script setup>
import { computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { useShoppingStore } from '@/stores/shopping.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'

const family = useFamilyStore()
const shopping = useShoppingStore()

const lastActiveList = computed(() => {
  if (!family.familyId) return null
  const savedId = localStorage.getItem(`lastActiveListId_${family.familyId}`)
  if (!savedId) return null
  return shopping.lists.find(l => l.id === savedId) ?? null
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
        <div v-if="lastActiveList" class="text-body-2 text-medium-emphasis mt-1">
          {{ lastActiveList.name }}
        </div>
      </v-card-text>
    </v-card>

    <!-- Family avatars -->
    <v-card rounded="lg" elevation="1">
      <v-card-text>
        <div class="text-subtitle-1 font-weight-medium mb-3">Family members</div>
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
