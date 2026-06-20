import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ShoppingView from '@/views/ShoppingView.vue'
import PocketMoneyView from '@/views/PocketMoneyView.vue'
import JobsView from '@/views/JobsView.vue'
import LoginView from '@/views/LoginView.vue'
import SetupView from '@/views/SetupView.vue'
import { useAuthStore } from '@/stores/auth.js'
import { useFamilyStore } from '@/stores/family.js'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',             component: HomeView },
    { path: '/shopping',     component: ShoppingView },
    { path: '/pocket-money', component: PocketMoneyView },
    { path: '/jobs',         component: JobsView },
    { path: '/login',        component: LoginView,  meta: { public: true, hideNav: true } },
    { path: '/setup',        component: SetupView,  meta: { public: true, hideNav: true } },
  ],
})

router.beforeEach(async (to) => {
  const authStore = useAuthStore()
  const familyStore = useFamilyStore()

  await authStore.authReady

  if (to.meta.public) return true
  if (!authStore.user) return '/login'

  if (familyStore.familyId === null) {
    await familyStore.resolveFamily(authStore.user.uid)
  }

  if (familyStore.familyId === null && to.path !== '/setup') return '/setup'
  return true
})

export default router
