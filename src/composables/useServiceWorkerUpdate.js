import { ref, computed } from 'vue'

const SNOOZE_MS = 30 * 60 * 1000

export function useServiceWorkerUpdate() {
  const updateAvailable = ref(false)
  const snoozed = ref(false)
  const bannerVisible = computed(() => updateAvailable.value && !snoozed.value)
  let waitingWorker = null

  if (!navigator.serviceWorker) return { bannerVisible, applyUpdate: () => {}, snooze: () => {} }

  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })

  navigator.serviceWorker.ready.then(registration => {
    if (registration.waiting) {
      waitingWorker = registration.waiting
      updateAvailable.value = true
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          waitingWorker = newWorker
          updateAvailable.value = true
        }
      })
    })

    setInterval(() => registration.update(), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update()
    })
  })

  function applyUpdate() {
    waitingWorker?.postMessage({ type: 'SKIP_WAITING' })
  }

  function snooze() {
    snoozed.value = true
    setTimeout(() => { snoozed.value = false }, SNOOZE_MS)
  }

  return { bannerVisible, applyUpdate, snooze }
}
