import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '@/firebase/config.js'

const FAMILY_ID = 'family_1'

export const useFamilyStore = defineStore('family', () => {
  const currentUser = ref({
    uid: 'mock_dad',
    name: 'Dad',
    role: 'parent',
    colour: '#378ADD',
  })

  const members = ref([])

  let unsubscribe = null

  function setup() {
    unsubscribe = onSnapshot(
      collection(db, 'families', FAMILY_ID, 'members'),
      (snap) => {
        members.value = snap.docs.map(d => ({ uid: d.id, ...d.data() }))
      },
    )
  }

  function teardown() {
    if (unsubscribe) unsubscribe()
  }

  return { currentUser, members, setup, teardown }
})
