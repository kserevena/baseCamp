import { ref } from 'vue'

export function useServiceWorkerUpdate() {
  const updateAvailable = ref(false)
  let waitingWorker = null

  if (!navigator.serviceWorker) return { updateAvailable, applyUpdate: () => {} }

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

  return { updateAvailable, applyUpdate }
}
