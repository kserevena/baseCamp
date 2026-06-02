import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFamilyStore = defineStore('family', () => {
  const currentUser = ref({
    uid: 'mock_dad',
    name: 'Dad',
    role: 'parent',
    colour: '#378ADD',
  })

  const members = ref([
    { uid: 'mock_dad',  name: 'Dad',  role: 'parent', colour: '#378ADD' },
    { uid: 'mock_mum',  name: 'Mum',  role: 'parent', colour: '#1D9E75' },
    { uid: 'mock_ella', name: 'Ella', role: 'child',  colour: '#D4537E' },
    { uid: 'mock_sam',  name: 'Sam',  role: 'child',  colour: '#EF9F27' },
  ])

  return { currentUser, members }
})
