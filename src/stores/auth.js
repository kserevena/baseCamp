import { defineStore } from 'pinia'
import { ref } from 'vue'
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { auth } from '@/firebase/config.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(null)
  const isMinor = ref(false)

  let resolveAuthReady
  const authReady = new Promise(resolve => { resolveAuthReady = resolve })

  function startAuthListener() {
    onAuthStateChanged(auth, firebaseUser => {
      user.value = firebaseUser
      if (firebaseUser) {
        // Restore from localStorage on page refresh — written during signInWithGoogle
        isMinor.value = localStorage.getItem(`isMinor_${firebaseUser.uid}`) === 'true'
      }
      resolveAuthReady()
    })
  }

  async function signInWithGoogle() {
    const provider = new GoogleAuthProvider()
    provider.addScope('https://www.googleapis.com/auth/profile.agerange.read')
    const result = await signInWithPopup(auth, provider)

    const accessToken = GoogleAuthProvider.credentialFromResult(result)?.accessToken
    try {
      const res = await fetch(
        'https://people.googleapis.com/v1/people/me?personFields=ageRanges',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      )
      const data = await res.json()
      isMinor.value = data.ageRanges?.[0]?.ageRange === 'LESS_THAN_EIGHTEEN'
    } catch {
      isMinor.value = false
    }

    localStorage.setItem(`isMinor_${result.user.uid}`, String(isMinor.value))
  }

  async function signOut() {
    if (user.value) localStorage.removeItem(`isMinor_${user.value.uid}`)
    await firebaseSignOut(auth)
    user.value = null
    isMinor.value = false
  }

  return { user, isMinor, authReady, startAuthListener, signInWithGoogle, signOut }
})
