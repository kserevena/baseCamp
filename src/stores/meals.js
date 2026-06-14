import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  collection, doc, onSnapshot, updateDoc, query, where, arrayUnion, arrayRemove,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([])
  let unsubscribe = null

  function setup(familyId) {
    if (unsubscribe) unsubscribe()
    unsubscribe = onSnapshot(
      query(collection(db, 'meals'), where('familyId', '==', familyId)),
      (snap) => {
        meals.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      },
    )
  }

  function teardown() {
    if (unsubscribe) unsubscribe()
    unsubscribe = null
    meals.value = []
  }

  function toggleVote(mealId, uid) {
    const meal = meals.value.find(m => m.id === mealId)
    if (!meal) return
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
