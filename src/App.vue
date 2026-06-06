<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFamilyStore } from '@/stores/family.js'
import { useAuthStore } from '@/stores/auth.js'
import { useShoppingStore } from '@/stores/shopping.js'
import { useMealsStore } from '@/stores/meals.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'

const route = useRoute()
const router = useRouter()

const family = useFamilyStore()
const auth = useAuthStore()
const shopping = useShoppingStore()
const meals = useMealsStore()

const userMenu = ref(false)

watch(() => family.familyId, (id, prevId) => {
  if (id) {
    shopping.setup(id)
    meals.setup(id)
  } else if (prevId) {
    shopping.teardown()
    meals.teardown()
  }
})

onUnmounted(() => {
  family.teardown()
  shopping.teardown()
  meals.teardown()
})

async function signOut() {
  userMenu.value = false
  await auth.signOut()
  family.teardown()
  router.push('/login')
}

const navItems = [
  { label: 'Home',     icon: 'mdi-home',                 path: '/' },
  { label: 'Shopping', icon: 'mdi-cart',                 path: '/shopping' },
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
    <v-app-bar v-if="!route.meta.hideNav" flat color="surface" border="b">
      <v-app-bar-title class="text-primary font-weight-bold">BaseCamp</v-app-bar-title>
      <template #append>
        <v-menu v-model="userMenu" location="bottom end">
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" icon variant="text" min-width="44" min-height="44" class="mr-1">
              <FamilyAvatar
                v-if="family.currentUser"
                :uid="family.currentUser.uid"
                :size="32"
              />
              <v-icon v-else>mdi-account-circle</v-icon>
            </v-btn>
          </template>
          <v-list>
            <v-list-item
              v-if="family.currentUser"
              :title="family.currentUser.name"
              :subtitle="auth.user?.email"
              class="py-2"
            />
            <v-divider v-if="family.currentUser" />
            <v-list-item
              prepend-icon="mdi-logout"
              title="Sign out"
              min-height="48"
              @click="signOut"
            />
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>

    <v-main :style="route.meta.hideNav ? '' : 'padding-bottom: 64px;'">
      <router-view />
    </v-main>

    <v-bottom-navigation
      v-if="!route.meta.hideNav"
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
