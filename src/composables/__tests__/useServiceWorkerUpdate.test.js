import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useServiceWorkerUpdate } from '@/composables/useServiceWorkerUpdate.js'

describe('useServiceWorkerUpdate', () => {
  let mockRegistration
  let registrationListeners
  let controllerChangeHandler
  let visibilityChangeHandler
  let mockController

  function makeWorker(initialState = 'installing') {
    const listeners = {}
    return {
      state: initialState,
      postMessage: vi.fn(),
      addEventListener: vi.fn((event, handler) => {
        listeners[event] = handler
      }),
      _emit: (event) => listeners[event]?.(),
    }
  }

  beforeEach(() => {
    vi.useFakeTimers()

    registrationListeners = {}
    mockController = {}
    mockRegistration = {
      update: vi.fn(),
      waiting: null,
      installing: null,
      addEventListener: vi.fn((event, handler) => {
        registrationListeners[event] = handler
      }),
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        controller: mockController,
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

  it('returns updateAvailable ref and applyUpdate function', () => {
    const result = useServiceWorkerUpdate()
    expect(result).toHaveProperty('updateAvailable')
    expect(result).toHaveProperty('applyUpdate')
    expect(typeof result.applyUpdate).toBe('function')
  })

  it('updateAvailable is false initially', () => {
    const { updateAvailable } = useServiceWorkerUpdate()
    expect(updateAvailable.value).toBe(false)
  })

  it('sets updateAvailable true when a new worker reaches installed state', async () => {
    const { updateAvailable } = useServiceWorkerUpdate()
    await Promise.resolve()

    const newWorker = makeWorker('installing')
    mockRegistration.installing = newWorker
    registrationListeners['updatefound']()

    newWorker.state = 'installed'
    newWorker._emit('statechange')

    expect(updateAvailable.value).toBe(true)
  })

  it('does not set updateAvailable true on first install (no existing controller)', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        ready: Promise.resolve(mockRegistration),
        controller: null,
        addEventListener: vi.fn((event, handler) => {
          if (event === 'controllerchange') controllerChangeHandler = handler
        }),
      },
      configurable: true,
    })

    const { updateAvailable } = useServiceWorkerUpdate()
    await Promise.resolve()

    const newWorker = makeWorker('installing')
    mockRegistration.installing = newWorker
    registrationListeners['updatefound']()

    newWorker.state = 'installed'
    newWorker._emit('statechange')

    expect(updateAvailable.value).toBe(false)
  })

  it('sets updateAvailable true immediately if registration.waiting is already set', async () => {
    const waitingWorker = makeWorker('installed')
    mockRegistration.waiting = waitingWorker

    const { updateAvailable } = useServiceWorkerUpdate()
    await Promise.resolve()

    expect(updateAvailable.value).toBe(true)
  })

  it('applyUpdate posts SKIP_WAITING to the waiting worker', async () => {
    const { updateAvailable, applyUpdate } = useServiceWorkerUpdate()
    await Promise.resolve()

    const newWorker = makeWorker('installing')
    mockRegistration.installing = newWorker
    registrationListeners['updatefound']()
    newWorker.state = 'installed'
    newWorker._emit('statechange')

    expect(updateAvailable.value).toBe(true)
    applyUpdate()
    expect(newWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
  })

  it('applyUpdate posts SKIP_WAITING to an already-waiting worker', async () => {
    const waitingWorker = makeWorker('installed')
    mockRegistration.waiting = waitingWorker

    const { applyUpdate } = useServiceWorkerUpdate()
    await Promise.resolve()

    applyUpdate()
    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
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

  it('returns a no-op applyUpdate when serviceWorker is not supported', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    const { applyUpdate } = useServiceWorkerUpdate()
    expect(() => applyUpdate()).not.toThrow()
  })
})
