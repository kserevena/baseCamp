import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useMealsStore = defineStore('meals', () => {
  const meals = ref([
    { id: 'm1', name: 'Pasta bolognese',  votes: ['mock_dad', 'mock_mum', 'mock_ella', 'mock_sam'] },
    { id: 'm2', name: 'Roast chicken',    votes: ['mock_mum', 'mock_dad'] },
    { id: 'm3', name: 'Bacon sandwiches', votes: ['mock_dad', 'mock_sam'] },
    { id: 'm4', name: 'Veggie stir fry',  votes: ['mock_ella'] },
  ])

  function toggleVote(mealId, uid) {
    const meal = meals.value.find(m => m.id === mealId)
    if (!meal) return
    const idx = meal.votes.indexOf(uid)
    if (idx >= 0) meal.votes.splice(idx, 1)
    else meal.votes.push(uid)
  }

  return { meals, toggleVote }
})
