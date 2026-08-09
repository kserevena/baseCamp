import { describe, it, expect, vi } from 'vitest'
import { reactive } from 'vue'

// useUserRole imports the family store, which imports src/firebase/config.js —
// that calls getAuth() at module scope and throws without a .env (CI has none).
// The family store mock below happens to prevent that today; mocking the config
// module keeps it true if useUserRole ever imports anything else.
vi.mock('@/firebase/config.js', () => ({ auth: {}, db: {} }))

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
