import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  collection, doc, updateDoc, query, where, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFirestoreListener } from '@/composables/useFirestoreListener.js'

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([])
  const listener = useFirestoreListener()

  function setup(familyId) {
    listener.unsubscribeAll()
    listener.subscribe(
      query(collection(db, 'meals'), where('familyId', '==', familyId)),
      (snap) => {
        meals.value = snap.docs.map(d => ({ votes: [], ...d.data(), id: d.id }))
      },
    )
  }

  function teardown() {
    listener.unsubscribeAll()
    meals.value = []
  }

  function toggleVote(mealId, uid) {
    const meal = meals.value.find(m => m.id === mealId)
    if (!meal) return
    if (!uid) return
    const votes = meal.votes ?? []
    const hasVoted = votes.includes(uid)
    meal.votes = hasVoted
      ? votes.filter(v => v !== uid)
      : [...votes, uid]
    updateDoc(doc(db, 'meals', mealId), {
      votes: hasVoted ? arrayRemove(uid) : arrayUnion(uid),
    })
  }

  return { meals, setup, teardown, toggleVote }
})
