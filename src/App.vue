<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFamilyStore } from '@/stores/family.js'
import { useAuthStore } from '@/stores/auth.js'
import { useShoppingStore } from '@/stores/shopping.js'
import { usePocketMoneyStore } from '@/stores/pocketMoney.js'
import { useJobsStore } from '@/stores/jobs.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'
import { useServiceWorkerUpdate } from '@/composables/useServiceWorkerUpdate.js'
import { isDev } from '@/utils/env.js'

const route = useRoute()
const router = useRouter()

const family = useFamilyStore()
const auth = useAuthStore()
const shopping = useShoppingStore()
const pocketMoney = usePocketMoneyStore()
const jobs = useJobsStore()

const userMenu = ref(false)
const { updateAvailable, applyUpdate } = useServiceWorkerUpdate()

watch(() => family.familyId, (id, prevId) => {
  if (id) {
    shopping.setup(id)
    jobs.setup(id)
  } else if (prevId) {
    shopping.teardown()
    jobs.teardown()
  }
})

// pocketMoney.setup needs the user's role, which arrives via the members onSnapshot
// (asynchronously after familyId becomes non-null). Watch currentUser instead.
watch(
  () => family.currentUser,
  (user, prev) => {
    if (user && family.familyId) {
      pocketMoney.setup(family.familyId, user)
    } else if (!user && prev) {
      pocketMoney.teardown()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  family.teardown()
  shopping.teardown()
  pocketMoney.teardown()
  jobs.teardown()
})

async function signOut() {
  userMenu.value = false
  await auth.signOut()
  family.teardown()
  router.push('/login')
}

const navItems = [
  { label: 'Home',     icon: 'mdi-home',                    path: '/' },
  { label: 'Shopping', icon: 'mdi-cart',                    path: '/shopping' },
  { label: 'Money',    icon: 'mdi-piggy-bank-outline',      path: '/pocket-money' },
  { label: 'Jobs',     icon: 'mdi-clipboard-check-outline', path: '/jobs' },
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
      <v-app-bar-title>
        <span class="text-primary font-weight-bold">BaseCamp</span>
        <v-chip v-if="isDev" color="warning" size="x-small" label class="ml-2">DEV</v-chip>
      </v-app-bar-title>
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
      elevation="5"
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

    <v-snackbar v-model="updateAvailable" timeout="-1">
      A new version is available
      <template #actions>
        <v-btn color="primary" variant="text" @click="applyUpdate">Update</v-btn>
        <v-btn variant="text" @click="updateAvailable = false">Later</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>
