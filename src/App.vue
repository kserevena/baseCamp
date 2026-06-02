<script setup>
import { ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

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
