<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFamilyStore } from '@/stores/family.js'
import { useShoppingStore } from '@/stores/shopping.js'
import { useMealsStore } from '@/stores/meals.js'
import { seedIfEmpty } from '@/firebase/seed.js'

const route = useRoute()
const router = useRouter()

const family = useFamilyStore()
const shopping = useShoppingStore()
const meals = useMealsStore()

onMounted(async () => {
  try {
    await seedIfEmpty()
  } catch (err) {
    console.error('[BaseCamp] Seed failed:', err)
  }
  family.setup()
  shopping.setup()
  meals.setup()
})

onUnmounted(() => {
  family.teardown()
  shopping.teardown()
  meals.teardown()
})

const navItems = [
  { label: 'Home',     icon: 'mdi-home',                path: '/' },
  { label: 'Shopping', icon: 'mdi-cart',                path: '/shopping' },
  { label: 'Meals',    icon: 'mdi-silverware-fork-knife', path: '/meals' },
]

const activeTab = ref(route.path)

watch(() => route.path, path => { activeTab.value = path })

function navigate(path) {
  if (route.path !== path) router.push(path)
  activeTab.value = path
}
</script>

<template>
  <v-app>
    <v-main style="padding-bottom: 64px;">
      <router-view />
    </v-main>

    <v-bottom-navigation
      v-model="activeTab"
      color="primary"
      elevation="8"
      grow
    >
      <v-btn
        v-for="item in navItems"
        :key="item.path"
        :value="item.path"
        min-height="56"
        @click="navigate(item.path)"
      >
        <v-icon>{{ item.icon }}</v-icon>
        <span>{{ item.label }}</span>
      </v-btn>
    </v-bottom-navigation>
  </v-app>
</template>
