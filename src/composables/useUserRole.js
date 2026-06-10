import { computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { ROLE_PARENT, ROLE_CHILD } from '@/constants/roles.js'

// Derives the current user's role from the family store. Use this instead of
// re-deriving `currentUser?.role === 'parent'` in each view/component.
export function useUserRole() {
  const family = useFamilyStore()
  const isParent = computed(() => family.currentUser?.role === ROLE_PARENT)
  const isChild = computed(() => family.currentUser?.role === ROLE_CHILD)
  return { isParent, isChild }
}
