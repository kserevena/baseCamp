import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useServiceWorkerUpdate } from '@/composables/useServiceWorkerUpdate.js'

describe('useServiceWorkerUpdate', () => {
  let mockRegistration
  let controllerChangeHandler
  let visibilityChangeHandler

  beforeEach(() => {
    vi.useFakeTimers()

    mockRegistration = { update: vi.fn() }

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        addEventListener: vi.fn((event, handler) => {
          if (event === 'controllerchange') controllerChangeHandler = handler
        }),
      },
      configurable: true,
    })

    Object.defineProperty(window, 'location', {
      value: { reload: vi.fn() },
      configurable: true,
    })

    vi.spyOn(document, 'addEventListener').mockImplementation((event, handler) => {
      if (event === 'visibilitychange') visibilityChangeHandler = handler
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('registers a controllerchange listener', () => {
    useServiceWorkerUpdate()
    expect(navigator.serviceWorker.addEventListener).toHaveBeenCalledWith('controllerchange', expect.any(Function))
  })

  it('reloads the page when controllerchange fires', () => {
    useServiceWorkerUpdate()
    controllerChangeHandler()
    expect(window.location.reload).toHaveBeenCalledOnce()
  })

  it('only reloads once even if controllerchange fires multiple times', () => {
    useServiceWorkerUpdate()
    controllerChangeHandler()
    controllerChangeHandler()
    expect(window.location.reload).toHaveBeenCalledOnce()
  })

  it('calls registration.update() when app becomes visible', async () => {
    useServiceWorkerUpdate()
    await Promise.resolve()
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    visibilityChangeHandler()
    expect(mockRegistration.update).toHaveBeenCalledOnce()
  })

  it('does not call registration.update() when app is hidden', async () => {
    useServiceWorkerUpdate()
    await Promise.resolve()
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    visibilityChangeHandler()
    expect(mockRegistration.update).not.toHaveBeenCalled()
  })

  it('calls registration.update() every hour', async () => {
    useServiceWorkerUpdate()
    await Promise.resolve()
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(mockRegistration.update).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(mockRegistration.update).toHaveBeenCalledTimes(2)
  })

  it('does nothing when serviceWorker is not supported', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    expect(() => useServiceWorkerUpdate()).not.toThrow()
  })
})
