<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.js'

const router = useRouter()
const auth = useAuthStore()

const loading = ref(false)
const error = ref(null)

async function signIn() {
  loading.value = true
  error.value = null
  try {
    await auth.signInWithGoogle()
    router.push('/')
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      error.value = 'Sign-in failed. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="fill-height d-flex align-center justify-center" style="min-height: 100svh;">
    <v-container style="max-width: 400px;">
      <div class="text-center mb-10">
        <div class="text-h4 font-weight-bold text-primary mb-2">BaseCamp</div>
        <div class="text-body-2 text-medium-emphasis">Family organiser</div>
      </div>

      <v-btn
        color="primary"
        size="large"
        block
        min-height="56"
        :loading="loading"
        prepend-icon="mdi-google"
        @click="signIn"
      >
        Sign in with Google
      </v-btn>

      <v-snackbar :model-value="!!error" color="error" timeout="4000" @update:model-value="error = null">
        {{ error }}
      </v-snackbar>
    </v-container>
  </div>
</template>
