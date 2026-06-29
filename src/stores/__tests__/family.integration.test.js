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
  deleteDoc,
  collection,
  collectionGroup,
  addDoc,
  query,
  where,
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
          name: 'Weekly shop',
          createdAt: serverTimestamp(),
          createdBy: 'parent-uid',
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

    it('allows a parent to add a shopping item', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(
        addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'Milk', qty: '2 pints', aisle: 'Dairy',
          aisleOrder: 1, done: false, addedBy: 'parent-uid', fromMeal: null,
        })
      )
    })

    it('denies a child adding a shopping item', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
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

    it('allows a parent to tick off a shopping item', async () => {
      let itemRef
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        itemRef = await addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'Eggs', qty: '6', aisle: 'Dairy', aisleOrder: 1, done: false, addedBy: 'parent-uid', fromMeal: null,
        })
      })
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { done: true }))
    })

    it('denies a child ticking off a shopping item', async () => {
      let itemRef
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        itemRef = await addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'Eggs', qty: '6', aisle: 'Dairy', aisleOrder: 1, done: false, addedBy: 'parent-uid', fromMeal: null,
        })
      })
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { done: true }))
    })

    it('allows a parent to create a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(
        addDoc(collection(ctx.firestore(), 'shoppingLists'), {
          familyId: 'fam-1', name: 'New list', createdAt: serverTimestamp(), createdBy: 'parent-uid',
        })
      )
    })

    it('denies a child creating a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        addDoc(collection(ctx.firestore(), 'shoppingLists'), {
          familyId: 'fam-1', name: 'Child list', createdAt: serverTimestamp(), createdBy: 'child-uid',
        })
      )
    })

    it('denies a child updating the aisles field on a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1'), { aisles: [] })
      )
    })

    it('denies a child updating the name field on a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1'), { name: 'Hacked' })
      )
    })

    it('allows a parent to update the aisles field on a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1'), {
          aisles: [{ name: 'Produce', order: 1 }],
        })
      )
    })

    it('allows a parent to update the name of a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(
        updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1'), { name: 'Big shop' })
      )
    })

    it('denies a child deleting a shopping list', async () => {
      const ctx = testEnv.authenticatedContext('child-uid')
      await assertFails(
        deleteDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1'))
      )
    })

    it('allows a parent to add an item with a name of exactly 80 characters', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(
        addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'A'.repeat(80), qty: '', aisle: 'Dairy',
          aisleOrder: 1, done: false, addedBy: 'parent-uid', fromMeal: null,
        })
      )
    })

    it('denies a parent adding an item with a name longer than 80 characters', async () => {
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertFails(
        addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'A'.repeat(81), qty: '', aisle: 'Dairy',
          aisleOrder: 1, done: false, addedBy: 'parent-uid', fromMeal: null,
        })
      )
    })

    it('allows a parent to delete an item regardless of name length', async () => {
      let itemRef
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        itemRef = await addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
          name: 'A'.repeat(81), qty: '', aisle: 'Dairy', aisleOrder: 1, done: false, addedBy: 'parent-uid', fromMeal: null,
        })
      })
      const ctx = testEnv.authenticatedContext('parent-uid')
      await assertSucceeds(deleteDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id)))
    })

    describe('priority field', () => {
      let itemRef

      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          itemRef = await addDoc(collection(ctx.firestore(), 'shoppingLists', 'list-1', 'items'), {
            name: 'Milk', qty: '2 pints', aisle: 'Dairy', aisleOrder: 1, done: false,
            addedBy: 'parent-uid', priority: false,
          })
        })
      })

      it('allows a parent to set priority: true', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { priority: true })
        )
      })

      it('denies a child setting priority: true', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { priority: true })
        )
      })

      it('denies a child setting priority: false', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { priority: false })
        )
      })

      it('denies a child updating done', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { done: true })
        )
      })

      it('denies an outsider setting priority', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id), { priority: true })
        )
      })

      it('allows a family member to read an item that has the priority field', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'shoppingLists', 'list-1', 'items', itemRef.id))
        )
      })
    })
  })

  describe('pocketMoney subcollection', () => {
    async function seedPocketMoneyDoc(familyId, childUid, data = {}) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'families', familyId, 'pocketMoney', childUid), {
          weeklyAmount: 5, paymentDay: 5, balance: 10, lastUpdated: serverTimestamp(), ...data,
        })
      })
    }

    async function seedTransaction(familyId, childUid, txnId) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'families', familyId, 'pocketMoney', childUid, 'transactions', txnId),
          { type: 'payment', amount: 5, recordedBy: null, note: null },
        )
      })
    }

    beforeEach(async () => {
      await seedFamily('fam-1', [
        { uid: 'parent-uid',  name: 'Parent',  role: 'parent' },
        { uid: 'child-uid',   name: 'Child',   role: 'child' },
        { uid: 'child2-uid',  name: 'Child 2', role: 'child' },
      ])
      await seedPocketMoneyDoc('fam-1', 'child-uid')
      await seedPocketMoneyDoc('fam-1', 'child2-uid')
      await seedTransaction('fam-1', 'child-uid', 'txn-1')
    })

    describe('pocketMoney/{childUid} reads', () => {
      it('allows a parent to read any child pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })

      it('allows a child to read their own pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })

      it('denies a child reading another child\'s pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child2-uid'))
        )
      })

      it('denies a non-member reading any pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })

      it('denies an unauthenticated user reading any pocket money doc', async () => {
        const ctx = testEnv.unauthenticatedContext()
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })
    })

    describe('pocketMoney/{childUid} writes', () => {
      it('allows a parent to create a pocket money doc for a child', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'new-child-uid'), {
            weeklyAmount: 5, paymentDay: 4, balance: 20, lastUpdated: serverTimestamp(),
          })
        )
      })

      it('allows a parent to update a child\'s pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'), {
            weeklyAmount: 10,
          })
        )
      })

      it('denies a child writing their own pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'), {
            balance: 9999,
          })
        )
      })

      it('denies a child writing another child\'s pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child2-uid'), {
            balance: 0,
          })
        )
      })

      it('denies a non-member writing any pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'), {
            weeklyAmount: 5, paymentDay: 5, balance: 0, lastUpdated: serverTimestamp(),
          })
        )
      })
    })

    describe('pocketMoney/{childUid}/transactions reads', () => {
      it('allows a parent to read any child\'s transactions', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions', 'txn-1'))
        )
      })

      it('allows a child to read their own transactions', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions', 'txn-1'))
        )
      })

      it('denies a child reading another child\'s transactions', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child2-uid', 'transactions', 'txn-2'),
            { type: 'payment', amount: 5, recordedBy: null, note: null },
          )
        })
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child2-uid', 'transactions', 'txn-2'))
        )
      })

      it('denies a non-member reading transactions', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions', 'txn-1'))
        )
      })
    })

    describe('pocketMoney/{childUid}/transactions writes', () => {
      it('allows a parent to write a transaction', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions'),
            { type: 'payment', amount: 5, recordedBy: null, note: null },
          )
        )
      })

      it('denies a child writing a transaction', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions'),
            { type: 'payment', amount: 5, recordedBy: null, note: null },
          )
        )
      })

      it('denies a non-member writing a transaction', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions'),
            { type: 'payment', amount: 5, recordedBy: null, note: null },
          )
        )
      })
    })

    describe('pocketMoney child self-create and unauthenticated', () => {
      it('denies a child creating their OWN pocket money doc', async () => {
        // Self-create is a write; only parents may write. A child must not be able to
        // seed their own balance even though they can read it.
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'), {
            weeklyAmount: 5, paymentDay: 5, balance: 9999, lastUpdated: serverTimestamp(),
          })
        )
      })

      it('denies an unauthenticated user writing a pocket money doc', async () => {
        const ctx = testEnv.unauthenticatedContext()
        await assertFails(
          setDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'), {
            weeklyAmount: 5, paymentDay: 5, balance: 0, lastUpdated: serverTimestamp(),
          })
        )
      })

      it('denies an unauthenticated user writing a transaction', async () => {
        const ctx = testEnv.unauthenticatedContext()
        await assertFails(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions'),
            { type: 'payment', amount: 5, recordedBy: null, note: null },
          )
        )
      })
    })

    describe('pocketMoney deletes', () => {
      it('allows a parent to delete a pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })

      it('allows a parent to delete a transaction', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions', 'txn-1'))
        )
      })

      it('denies a child deleting their own pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })

      it('denies a child deleting their own transaction', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid', 'transactions', 'txn-1'))
        )
      })

      it('denies a non-member deleting a pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })
    })

    describe('pocketMoney list / enumeration', () => {
      it('allows a parent to list the pocketMoney collection', async () => {
        // The parent store listener subscribes to the whole collection, so list must work.
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          getDocs(collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney'))
        )
      })

      it('denies a child listing the pocketMoney collection', async () => {
        // A child may only GET their own doc — listing would expose siblings' balances.
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          getDocs(collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney'))
        )
      })

      it('denies a non-member listing the pocketMoney collection', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          getDocs(collection(ctx.firestore(), 'families', 'fam-1', 'pocketMoney'))
        )
      })
    })

    describe('pocketMoney cross-family isolation', () => {
      // A parent of one family must not reach into another family's pocket money.
      beforeEach(async () => {
        await seedFamily('fam-2', [
          { uid: 'parent2-uid', name: 'Parent 2', role: 'parent' },
        ], { createdBy: 'parent2-uid' })
      })

      it('denies a parent of another family reading a child pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('parent2-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'))
        )
      })

      it('denies a parent of another family writing a child pocket money doc', async () => {
        const ctx = testEnv.authenticatedContext('parent2-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'pocketMoney', 'child-uid'), {
            balance: 9999,
          })
        )
      })
    })
  })

  describe('householdJobs subcollection', () => {
    // ── seed helpers ──────────────────────────────────────────────────────────

    async function seedJob(familyId, jobId, data = {}) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'families', familyId, 'householdJobs', jobId),
          {
            title:        'Fix the fence',
            description:  null,
            category:     'Garden',
            status:       'suggested',
            priority:     null,
            costEstimate: null,
            suggestedBy:  'parent-uid',
            assignedTo:   null,
            createdAt:    serverTimestamp(),
            updatedAt:    serverTimestamp(),
            ...data,
          }
        )
      })
    }

    async function seedSubtask(familyId, jobId, subtaskId, data = {}) {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'families', familyId, 'householdJobs', jobId, 'subtasks', subtaskId),
          {
            familyId,
            jobId,
            title:      'Do the thing',
            done:       false,
            assignedTo: null,
            order:      1,
            createdAt:  serverTimestamp(),
            updatedAt:  serverTimestamp(),
            ...data,
          }
        )
      })
    }

    beforeEach(async () => {
      await seedFamily('fam-1', [
        { uid: 'parent-uid', name: 'Parent', role: 'parent' },
        { uid: 'child-uid',  name: 'Child',  role: 'child' },
      ])
      await seedJob('fam-1', 'job-1')
      await seedSubtask('fam-1', 'job-1', 'st-1')
    })

    // ── householdJobs reads ───────────────────────────────────────────────────

    describe('householdJobs reads', () => {
      it('allows a family member to read a job', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'))
        )
      })

      it('denies a non-member reading a job', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'))
        )
      })

      it('denies an unauthenticated user reading a job', async () => {
        const ctx = testEnv.unauthenticatedContext()
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'))
        )
      })

      it('cross-family: member of fam-2 cannot read fam-1 jobs', async () => {
        await seedFamily('fam-2', [
          { uid: 'other-uid', name: 'Other', role: 'parent' },
        ])
        const ctx = testEnv.authenticatedContext('other-uid')
        await assertFails(
          getDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'))
        )
      })
    })

    // ── householdJobs creates ─────────────────────────────────────────────────

    describe('householdJobs creates', () => {
      it('allows a member to create a job with status=suggested stamped as themselves', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          addDoc(collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs'), {
            title: 'New job', description: null, category: 'Garden',
            status: 'suggested', priority: null, costEstimate: null,
            suggestedBy: 'child-uid', assignedTo: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a child creating a job with priority set', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          addDoc(collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs'), {
            title: 'Sneaky job', description: null, category: 'Garden',
            status: 'suggested', priority: 'high', costEstimate: null,
            suggestedBy: 'child-uid', assignedTo: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a child creating a job with assignedTo set', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          addDoc(collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs'), {
            title: 'Assigned job', description: null, category: 'Garden',
            status: 'suggested', priority: null, costEstimate: null,
            suggestedBy: 'child-uid', assignedTo: 'parent-uid',
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
        )
      })

      it('allows a parent to create a job with priority and assignedTo set', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          addDoc(collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs'), {
            title: 'Parent job', description: null, category: 'Maintenance',
            status: 'suggested', priority: 'high', costEstimate: 200,
            suggestedBy: 'parent-uid', assignedTo: 'child-uid',
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a non-member creating a job', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          addDoc(collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs'), {
            title: 'Injected', description: null, category: '',
            status: 'suggested', priority: null, costEstimate: null,
            suggestedBy: 'outsider-uid', assignedTo: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies stamping suggestedBy as someone else', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          addDoc(collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs'), {
            title: 'Fake job', description: null, category: '',
            status: 'suggested', priority: null, costEstimate: null,
            suggestedBy: 'parent-uid', assignedTo: null,
            createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
          })
        )
      })
    })

    // ── householdJobs updates ─────────────────────────────────────────────────

    describe('householdJobs updates', () => {
      it('allows a parent to fully update a job', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'), {
            status: 'planned', priority: 'high', assignedTo: 'child-uid',
            updatedAt: serverTimestamp(),
          })
        )
      })

      it('allows a child to edit title/description of their own still-suggested job', async () => {
        await seedJob('fam-1', 'job-child', { suggestedBy: 'child-uid', status: 'suggested' })
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-child'), {
            title: 'Updated title', updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a child editing the title/description of another user\'s job', async () => {
        // job-1 is suggestedBy: parent-uid
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'), {
            title: 'Hacked', updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a child changing status on their own suggested job', async () => {
        await seedJob('fam-1', 'job-child', { suggestedBy: 'child-uid', status: 'suggested' })
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-child'), {
            status: 'planned', updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a child changing priority on their own suggested job', async () => {
        await seedJob('fam-1', 'job-child', { suggestedBy: 'child-uid', status: 'suggested' })
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-child'), {
            priority: 'high', updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a child editing a job that is no longer in suggested status', async () => {
        await seedJob('fam-1', 'job-child2', { suggestedBy: 'child-uid', status: 'planned' })
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-child2'), {
            title: 'Should fail', updatedAt: serverTimestamp(),
          })
        )
      })

      it('denies a non-member updating a job', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          updateDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'), {
            title: 'Outsider edit', updatedAt: serverTimestamp(),
          })
        )
      })
    })

    // ── householdJobs deletes ─────────────────────────────────────────────────

    describe('householdJobs deletes', () => {
      it('allows a parent to delete a job', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'))
        )
      })

      it('denies a child deleting a job', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          deleteDoc(doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1'))
        )
      })
    })

    // ── subtask reads ─────────────────────────────────────────────────────────

    describe('subtask reads', () => {
      it('allows a family member to read a subtask', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          getDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1')
          )
        )
      })

      it('denies a non-member reading a subtask', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          getDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1')
          )
        )
      })

      it('allows a family member to query subtasks via collectionGroup', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          getDocs(query(collectionGroup(ctx.firestore(), 'subtasks'), where('familyId', '==', 'fam-1')))
        )
      })

      it('denies a non-member querying subtasks via collectionGroup', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          getDocs(query(collectionGroup(ctx.firestore(), 'subtasks'), where('familyId', '==', 'fam-1')))
        )
      })

      it('cross-family collectionGroup: member of fam-2 cannot query fam-1 subtasks', async () => {
        await seedFamily('fam-2', [
          { uid: 'other-uid', name: 'Other', role: 'parent' },
        ])
        // Seed a fam-2 subtask so collectionGroup doesn't return empty
        await seedJob('fam-2', 'job-fam2')
        await seedSubtask('fam-2', 'job-fam2', 'st-fam2')

        const ctx = testEnv.authenticatedContext('other-uid')
        // Querying fam-1 subtasks as a member of fam-2 should fail
        await assertFails(
          getDocs(query(collectionGroup(ctx.firestore(), 'subtasks'), where('familyId', '==', 'fam-1')))
        )
      })
    })

    // ── subtask creates ───────────────────────────────────────────────────────

    describe('subtask creates', () => {
      it('allows a parent to create a subtask with correct familyId and jobId', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks'),
            {
              familyId: 'fam-1', jobId: 'job-1',
              title: 'New subtask', done: false, assignedTo: null,
              order: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }
          )
        )
      })

      it('denies a member (child) creating a subtask', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks'),
            {
              familyId: 'fam-1', jobId: 'job-1',
              title: 'Sneaky subtask', done: false, assignedTo: null,
              order: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }
          )
        )
      })

      it('denies creating a subtask with mismatched familyId', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertFails(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks'),
            {
              familyId: 'fam-WRONG', jobId: 'job-1',
              title: 'Bad familyId', done: false, assignedTo: null,
              order: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }
          )
        )
      })

      it('denies creating a subtask with mismatched jobId', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertFails(
          addDoc(
            collection(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks'),
            {
              familyId: 'fam-1', jobId: 'job-WRONG',
              title: 'Bad jobId', done: false, assignedTo: null,
              order: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
            }
          )
        )
      })
    })

    // ── subtask updates ───────────────────────────────────────────────────────

    describe('subtask updates', () => {
      it('allows a parent to fully update a subtask (title, assignedTo, order)', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          updateDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1'),
            { title: 'New title', assignedTo: 'child-uid', order: 5, updatedAt: serverTimestamp() }
          )
        )
      })

      it('allows any family member to toggle done (+updatedAt only)', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertSucceeds(
          updateDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1'),
            { done: true, updatedAt: serverTimestamp() }
          )
        )
      })

      it('denies a member changing title', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1'),
            { title: 'Sneaky rename', updatedAt: serverTimestamp() }
          )
        )
      })

      it('denies a member changing assignedTo', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1'),
            { assignedTo: 'child-uid', updatedAt: serverTimestamp() }
          )
        )
      })

      it('denies a member changing order', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          updateDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1'),
            { order: 99, updatedAt: serverTimestamp() }
          )
        )
      })

      it('denies a non-member updating a subtask', async () => {
        const ctx = testEnv.authenticatedContext('outsider-uid')
        await assertFails(
          updateDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1'),
            { done: true, updatedAt: serverTimestamp() }
          )
        )
      })
    })

    // ── subtask deletes ───────────────────────────────────────────────────────

    describe('subtask deletes', () => {
      it('allows a parent to delete a subtask', async () => {
        const ctx = testEnv.authenticatedContext('parent-uid')
        await assertSucceeds(
          deleteDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1')
          )
        )
      })

      it('denies a member (child) deleting a subtask', async () => {
        const ctx = testEnv.authenticatedContext('child-uid')
        await assertFails(
          deleteDoc(
            doc(ctx.firestore(), 'families', 'fam-1', 'householdJobs', 'job-1', 'subtasks', 'st-1')
          )
        )
      })
    })
  })
})
