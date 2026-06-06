/**
 * Integration tests for Firestore security rules.
 *
 * Requires the Firebase emulator to be running:
 *   firebase emulators:start --only firestore,auth
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing'
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  collection,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'

const RULES_PATH = resolve(process.cwd(), 'firestore.rules')

let testEnv

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'basecamp-test',
    firestore: {
      rules: readFileSync(RULES_PATH, 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

beforeEach(async () => {
  await testEnv.clearFirestore()
})

// Helper — seed a family and a member using admin (rules-bypassed) access
async function seedFamily(familyId, members, { createdBy = 'parent-uid' } = {}) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'families', familyId), {
      name: 'Test Family',
      inviteCode: 'ABCD2345',
      createdBy,
      createdAt: serverTimestamp(),
    })
    for (const m of members) {
      await setDoc(doc(db, 'families', familyId, 'members', m.uid), {
        name: m.name,
        role: m.role,
        colour: m.colour ?? '#fff',
      })
    }
  })
}

// Helper — seed an invite code → familyId mapping (rules-bypassed)
async function seedInviteCode(code, familyId) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'inviteCodes', code), { familyId })
  })
}

// Helper — seed a user→family mapping
async function seedUserMapping(uid, familyId) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users', uid), { familyId })
  })
}

describe('Firestore security rules', () => {
  describe('users collection', () => {
    it('allows a user to read their own document', async () => {
      await seedUserMapping('uid-1', 'fam-1')
      const ctx = testEnv.authenticatedContext('uid-1')
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'users', 'uid-1')))
    })

    it('denies reading another user\'s document', async () => {
      await seedUserMapping('uid-2', 'fam-1')
      const ctx = testEnv.authenticatedContext('uid-1')
      await assertFails(getDoc(doc(ctx.firestore(), 'users', 'uid-2')))
    })

    it('denies unauthenticated reads', async () => {
      await seedUserMapping('uid-1', 'fam-1')
      const ctx = testEnv.unauthenticatedContext()
      await assertFails(getDoc(doc(ctx.firestore(), 'users', 'uid-1')))
    })
  })

  describe('families collection', () => {
    beforeEach(async () => {
      await seedFamily('fam-1', [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        { uid: 'child-uid',  name: 'Child',  role: 'child' },
      ])
    })

    it('allows a family member to read the family document', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'families', 'fam-1')))
    })

    it('denies a non-member reading the family document', async () => {
      const ctx = testEnv.authenticatedContext('outsider-uid')
      await assertFails(getDoc(doc(ctx.firestore(), 'families', 'fam-1')))
    })

    it('denies an unauthenticated user reading the family document', async () => {
      const ctx = testEnv.unauthenticatedContext()
      await assertFails(getDoc(doc(ctx.firestore(), 'families', 'fam-1')))
    })

    it('allows a parent to update the family document', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'families', 'fam-1'), { name: 'Updated Name' })
      )
    })

    it('denies a child updating the family document', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'families', 'fam-1'), { name: 'Hacked Name' })
      )
    })

    it('allows a signed-in user to create a family stamped as their own', async () => {
      const ctx = testEnv.authenticatedContext('new-user-uid')
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), 'families', 'new-fam'), {
          name: 'New Family',
          inviteCode: 'XYZ99999',
          createdBy: 'new-user-uid',
          createdAt: serverTimestamp(),
        })
      )
    })

    it('denies creating a family stamped with someone else as creator', async () => {
      const ctx = testEnv.authenticatedContext('new-user-uid')
      await assertFails(
        setDoc(doc(ctx.firestore(), 'families', 'new-fam'), {
          name: 'New Family',
          inviteCode: 'XYZ99999',
          createdBy: 'victim-uid',
          createdAt: serverTimestamp(),
        })
      )
    })
  })

  describe('families/members subcollection', () => {
    beforeEach(async () => {
      await seedFamily('fam-1', [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        { uid: 'child-uid',  name: 'Child',  role: 'child' },
      ], { createdBy: 'parent-uid' })
      // A valid invite code for fam-1 that joiners must present.
      await seedInviteCode('ABCD2345', 'fam-1')
    })

    it('allows a member to read the members list', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'parent-uid')))
    })

    it('denies a non-member reading the members list', async () => {
      const ctx = testEnv.authenticatedContext('outsider-uid')
      await assertFails(getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'parent-uid')))
    })

    it('allows a user to join as a child when presenting a valid invite code', async () => {
      const ctx = testEnv.authenticatedContext('joining-uid')
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'joining-uid'), {
          name: 'New Member', role: 'child', colour: '#abc', inviteCode: 'ABCD2345',
        })
      )
    })

    it('denies joining without an invite code (cross-family insertion)', async () => {
      const ctx = testEnv.authenticatedContext('attacker-uid')
      await assertFails(
        setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'attacker-uid'), {
          name: 'Attacker', role: 'child', colour: '#000',
        })
      )
    })

    it('denies joining with an invalid invite code', async () => {
      const ctx = testEnv.authenticatedContext('attacker-uid')
      await assertFails(
        setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'attacker-uid'), {
          name: 'Attacker', role: 'child', colour: '#000', inviteCode: 'WRONGCOD',
        })
      )
    })

    it('denies self-promotion to parent via the join flow (privilege escalation)', async () => {
      const ctx = testEnv.authenticatedContext('attacker-uid')
      await assertFails(
        setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'attacker-uid'), {
          name: 'Attacker', role: 'parent', colour: '#000', inviteCode: 'ABCD2345',
        })
      )
    })

    it('denies an existing child escalating their own role to parent', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'child-uid'), {
          role: 'parent',
        })
      )
    })

    it('allows the family creator to seat themselves as parent', async () => {
      // A brand-new family whose creator has not yet been seeded as a member.
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'families', 'fam-new'), {
          name: 'Fresh Family', createdBy: 'founder-uid', createdAt: serverTimestamp(),
        })
      })
      const ctx = testEnv.authenticatedContext('founder-uid')
      await assertSucceeds(
        setDoc(doc(ctx.firestore(), 'families', 'fam-new', 'members', 'founder-uid'), {
          name: 'Founder', role: 'parent', colour: '#abc',
        })
      )
    })

    it('denies a non-creator seating themselves as parent', async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'families', 'fam-new'), {
          name: 'Fresh Family', createdBy: 'founder-uid', createdAt: serverTimestamp(),
        })
      })
      const ctx = testEnv.authenticatedContext('attacker-uid')
      await assertFails(
        setDoc(doc(ctx.firestore(), 'families', 'fam-new', 'members', 'attacker-uid'), {
          name: 'Attacker', role: 'parent', colour: '#000',
        })
      )
    })

    it('denies a child writing another member\'s document', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'members', 'parent-uid'), {
          name: 'Overwritten', role: 'child', colour: '#000',
        })
      )
    })
  })

  describe('inviteCodes collection', () => {
    beforeEach(async () => {
      await seedInviteCode('ABCD2345', 'fam-1')
    })

    it('allows a signed-in user to get a single invite code directly', async () => {
      const ctx = testEnv.authenticatedContext('anyone-uid')
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'inviteCodes', 'ABCD2345')))
    })

    it('denies enumerating the invite codes collection (no list access)', async () => {
      const ctx = testEnv.authenticatedContext('attacker-uid')
      await assertFails(getDocs(collection(ctx.firestore(), 'inviteCodes')))
    })

    it('denies an unauthenticated user reading an invite code', async () => {
      const ctx = testEnv.unauthenticatedContext()
      await assertFails(getDoc(doc(ctx.firestore(), 'inviteCodes', 'ABCD2345')))
    })
  })

  describe('shoppingLists collection', () => {
    beforeEach(async () => {
      await seedFamily('fam-1', [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        { uid: 'child-uid',  name: 'Child',  role: 'child' },
      ])
      // Seed a shopping list owned by the family
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1'), {
          familyId: 'fam-1',
          weekOf: '2026-06-02',
        })
      })
    })

    it('allows a family member to read the shopping list', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1')))
    })

    it('denies a non-member reading the shopping list', async () => {
      const ctx = testEnv.authenticatedContext('outsider-uid')
      await assertFails(getDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1')))
    })

    it('allows a family member to add a shopping item', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertSucceeds(
        addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'Milk', qty: '2 pints', aisle: 'Dairy',
          aisleOrder: 1, done: false, addedBy: 'child-uid', fromMeal: null,
        })
      )
    })

    it('denies a non-member adding a shopping item', async () => {
      const ctx = testEnv.authenticatedContext('outsider-uid')
      await assertFails(
        addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'Milk', qty: '2 pints', aisle: 'Dairy',
          aisleOrder: 1, done: false, addedBy: 'outsider-uid', fromMeal: null,
        })
      )
    })
  })

  describe('meals collection', () => {
    beforeEach(async () => {
      await seedFamily('fam-1', [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        { uid: 'child-uid',  name: 'Child',  role: 'child' },
      ])
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'meals', 'meal-1'), {
          familyId: 'fam-1', name: 'Pasta', votes: [], ingredients: [],
        })
      })
    })

    it('allows a family member to read meals', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertSucceeds(getDoc(doc(ctx.firestore(), 'meals', 'meal-1')))
    })

    it('allows a parent to delete a meal', async () => {
      const { deleteDoc } = await import('firebase/firestore')
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'meals', 'meal-1')))
    })

    it('denies a child deleting a meal', async () => {
      const { deleteDoc } = await import('firebase/firestore')
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(deleteDoc(doc(ctx.firestore(), 'meals', 'meal-1')))
    })

    it('denies a non-member reading meals', async () => {
      const ctx = testEnv.authenticatedContext('outsider-uid')
      await assertFails(getDoc(doc(ctx.firestore(), 'meals', 'meal-1')))
    })
  })
})
