import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, doc, getDoc, setDoc, onSnapshot, serverTimestamp,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useAuthStore } from '@/stores/auth.js'

const COLOUR_PALETTE = ['#378ADD', '#1D9E75', '#D4537E', '#EF9F27', '#7C5CBF', '#E06C4E']

// 8-character code from a cryptographically secure source. The alphabet omits
// easily confused characters (I, O, 0, 1) and has 32 entries, which divides 256
// evenly so there is no modulo bias.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const INVITE_CODE_LENGTH = 8

function generateInviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH))
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')
}


export const useFamilyStore = defineStore('family', () => {
  const authStore = useAuthStore()

  const familyId = ref(null)
  const members = ref([])

  const currentUser = computed(() =>
    members.value.find(m => m.uid === authStore.user?.uid) ?? null
  )

  let unsubscribe = null

  function setup(id) {
    if (unsubscribe) unsubscribe()
    unsubscribe = onSnapshot(
      collection(db, 'families', id, 'members'),
      (snap) => {
        members.value = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      },
    )
  }

  function teardown() {
    if (unsubscribe) unsubscribe()
    unsubscribe = null
    familyId.value = null
    members.value = []
  }

  async function resolveFamily(uid) {
    if (familyId.value !== null) return
    const userDoc = await getDoc(doc(db, 'users', uid))
    if (userDoc.exists()) {
      const id = userDoc.data().familyId
      familyId.value = id
      setup(id)
    }
  }

  async function createFamily(name) {
    const uid = authStore.user.uid
    const displayName = authStore.user.displayName || 'Parent'
    const id = doc(collection(db, 'families')).id
    const inviteCode = generateInviteCode()
    const colour = COLOUR_PALETTE[0]

    await setDoc(doc(db, 'families', id), { name, createdAt: serverTimestamp(), inviteCode, createdBy: uid })
    await setDoc(doc(db, 'families', id, 'members', uid), { name: displayName, role: 'parent', colour })
    await setDoc(doc(db, 'users', uid), { familyId: id })
    await setDoc(doc(db, 'inviteCodes', inviteCode), { familyId: id })

    familyId.value = id
    setup(id)
  }

  async function joinFamily(code) {
    const uid = authStore.user.uid
    const displayName = authStore.user.displayName || 'Member'

    // Direct read — no family membership required
    const codeDoc = await getDoc(doc(db, 'inviteCodes', code))
    if (!codeDoc.exists()) return false

    const id = codeDoc.data().familyId
    const colour = COLOUR_PALETTE[Math.floor(Math.random() * COLOUR_PALETTE.length)]

    // inviteCode is stored on the member doc so the security rule can verify the
    // joining user actually holds a valid code for this family.
    await setDoc(doc(db, 'families', id, 'members', uid), { name: displayName, role: 'child', colour, inviteCode: code })
    await setDoc(doc(db, 'users', uid), { familyId: id })

    familyId.value = id
    setup(id)
    return true
  }

  return { familyId, members, currentUser, setup, teardown, resolveFamily, createFamily, joinFamily }
})
