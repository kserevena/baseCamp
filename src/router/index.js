import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import ShoppingView from '@/views/ShoppingView.vue'
import MealsView from '@/views/MealsView.vue'

export default createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/',         component: HomeView },
    { path: '/shopping', component: ShoppingView },
    { path: '/meals',    component: MealsView },
  ],
})
