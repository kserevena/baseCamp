import { describe, it, expect, vi } from 'vitest'
import { reactive } from 'vue'

let familyStore
vi.mock('@/stores/family.js', () => ({ useFamilyStore: () => familyStore }))

import { useUserRole } from '@/composables/useUserRole.js'

describe('useUserRole', () => {
  it('flags a parent', () => {
    familyStore = reactive({ currentUser: { role: 'parent' } })
    const { isParent, isChild } = useUserRole()
    expect(isParent.value).toBe(true)
    expect(isChild.value).toBe(false)
  })

  it('flags a child', () => {
    familyStore = reactive({ currentUser: { role: 'child' } })
    const { isParent, isChild } = useUserRole()
    expect(isParent.value).toBe(false)
    expect(isChild.value).toBe(true)
  })

  it('reports neither when there is no current user', () => {
    familyStore = reactive({ currentUser: null })
    const { isParent, isChild } = useUserRole()
    expect(isParent.value).toBe(false)
    expect(isChild.value).toBe(false)
  })
})
