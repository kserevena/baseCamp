import { defineStore } from 'pinia'
import { ref } from 'vue'
import { collection, onSnapshot, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore'
import { db } from '@/firebase/config.js'

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([])
  let unsubscribe = null

  function setup() {
    unsubscribe = onSnapshot(
      collection(db, 'meals'),
      (snap) => {
        meals.value = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      },
    )
  }

  function teardown() {
    if (unsubscribe) unsubscribe()
  }

  function toggleVote(mealId, uid) {
    const meal = meals.value.find(m => m.id === mealId)
    if (!meal) return
    const hasVoted = meal.votes.includes(uid)
    meal.votes = hasVoted
      ? meal.votes.filter(v => v !== uid)
      : [...meal.votes, uid]
    updateDoc(doc(db, 'meals', mealId), {
      votes: hasVoted ? arrayRemove(uid) : arrayUnion(uid),
    })
  }

  return { meals, setup, teardown, toggleVote }
})
