<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useFamilyStore } from '@/stores/family.js'
import { useAuthStore } from '@/stores/auth.js'

const router = useRouter()
const family = useFamilyStore()
const authStore = useAuthStore()

const subtitle = computed(() =>
  authStore.isMinor
    ? 'Ask a parent for an invite code to join your family'
    : 'Set up your family to get started'
)

const familyName = ref('')
const inviteCode = ref('')
const creating = ref(false)
const joining = ref(false)
const createError = ref(null)
const joinError = ref(null)

async function createFamily() {
  if (!familyName.value.trim()) return
  creating.value = true
  createError.value = null
  try {
    await family.createFamily(familyName.value.trim())
    router.push('/')
  } catch (err) {
    createError.value = 'Could not create family. Please try again.'
    console.error(err)
  } finally {
    creating.value = false
  }
}

async function joinFamily() {
  const code = inviteCode.value.trim().toUpperCase()
  if (code.length !== 8) {
    joinError.value = 'Enter an 8-character invite code.'
    return
  }
  joining.value = true
  joinError.value = null
  try {
    const found = await family.joinFamily(code)
    if (!found) {
      joinError.value = 'No family found with that code.'
      return
    }
    router.push('/')
  } catch (err) {
    joinError.value = 'Could not join family. Please try again.'
    console.error(err)
  } finally {
    joining.value = false
  }
}
</script>

<template>
  <div style="min-height: 100svh;">
    <v-container style="max-width: 480px;" class="py-8">
      <div class="text-center mb-8">
        <div class="text-h5 font-weight-bold text-primary mb-1">Welcome to BaseCamp</div>
        <div class="text-body-2 text-medium-emphasis">{{ subtitle }}</div>
      </div>

      <!-- Create a family -->
      <v-card v-if="!authStore.isMinor" class="mb-4" variant="outlined">
        <v-card-title class="text-subtitle-1 font-weight-bold pt-4 px-4">Create a family</v-card-title>
        <v-card-text class="px-4 pb-4">
          <v-text-field
            v-model="familyName"
            label="Family name"
            placeholder="e.g. The Smiths"
            variant="outlined"
            density="comfortable"
            :error-messages="createError ? [createError] : []"
            @keyup.enter="createFamily"
          />
          <v-btn
            color="primary"
            block
            min-height="48"
            :loading="creating"
            :disabled="!familyName.trim()"
            @click="createFamily"
          >
            Create family
          </v-btn>
        </v-card-text>
      </v-card>

      <!-- Join a family -->
      <v-card variant="outlined">
        <v-card-title class="text-subtitle-1 font-weight-bold pt-4 px-4">Join a family</v-card-title>
        <v-card-text class="px-4 pb-4">
          <v-text-field
            v-model="inviteCode"
            label="Invite code"
            placeholder="8-character code"
            variant="outlined"
            density="comfortable"
            maxlength="8"
            :error-messages="joinError ? [joinError] : []"
            @keyup.enter="joinFamily"
          />
          <v-btn
            color="primary"
            block
            min-height="48"
            variant="tonal"
            :loading="joining"
            :disabled="inviteCode.trim().length !== 8"
            @click="joinFamily"
          >
            Join family
          </v-btn>
        </v-card-text>
      </v-card>
    </v-container>
  </div>
</template>
