export function useServiceWorkerUpdate() {
  if (!navigator.serviceWorker) return
  let refreshing = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true
      window.location.reload()
    }
  })
  navigator.serviceWorker.ready.then(registration => {
    setInterval(() => registration.update(), 60 * 60 * 1000)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) registration.update()
    })
  })
}
