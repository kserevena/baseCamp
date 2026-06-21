import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useServiceWorkerUpdate } from '@/composables/useServiceWorkerUpdate.js'

const SNOOZE_MS = 30 * 60 * 1000

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

  it('returns bannerVisible, applyUpdate, and snooze', () => {
    const result = useServiceWorkerUpdate()
    expect(result).toHaveProperty('bannerVisible')
    expect(result).toHaveProperty('applyUpdate')
    expect(result).toHaveProperty('snooze')
    expect(typeof result.applyUpdate).toBe('function')
    expect(typeof result.snooze).toBe('function')
  })

  it('bannerVisible is false initially', () => {
    const { bannerVisible } = useServiceWorkerUpdate()
    expect(bannerVisible.value).toBe(false)
  })

  it('bannerVisible becomes true when a new worker reaches installed state', async () => {
    const { bannerVisible } = useServiceWorkerUpdate()
    await Promise.resolve()

    const newWorker = makeWorker('installing')
    mockRegistration.installing = newWorker
    registrationListeners['updatefound']()
    newWorker.state = 'installed'
    newWorker._emit('statechange')

    expect(bannerVisible.value).toBe(true)
  })

  it('does not set bannerVisible true on first install (no existing controller)', async () => {
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

    const { bannerVisible } = useServiceWorkerUpdate()
    await Promise.resolve()

    const newWorker = makeWorker('installing')
    mockRegistration.installing = newWorker
    registrationListeners['updatefound']()
    newWorker.state = 'installed'
    newWorker._emit('statechange')

    expect(bannerVisible.value).toBe(false)
  })

  it('bannerVisible becomes true immediately if registration.waiting is already set', async () => {
    mockRegistration.waiting = makeWorker('installed')

    const { bannerVisible } = useServiceWorkerUpdate()
    await Promise.resolve()

    expect(bannerVisible.value).toBe(true)
  })

  it('applyUpdate posts SKIP_WAITING to the waiting worker', async () => {
    const { bannerVisible, applyUpdate } = useServiceWorkerUpdate()
    await Promise.resolve()

    const newWorker = makeWorker('installing')
    mockRegistration.installing = newWorker
    registrationListeners['updatefound']()
    newWorker.state = 'installed'
    newWorker._emit('statechange')

    expect(bannerVisible.value).toBe(true)
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

  it('snooze hides the banner immediately', async () => {
    mockRegistration.waiting = makeWorker('installed')

    const { bannerVisible, snooze } = useServiceWorkerUpdate()
    await Promise.resolve()

    expect(bannerVisible.value).toBe(true)
    snooze()
    expect(bannerVisible.value).toBe(false)
  })

  it('banner reappears after 30 minutes', async () => {
    mockRegistration.waiting = makeWorker('installed')

    const { bannerVisible, snooze } = useServiceWorkerUpdate()
    await Promise.resolve()

    snooze()
    expect(bannerVisible.value).toBe(false)

    vi.advanceTimersByTime(SNOOZE_MS - 1)
    expect(bannerVisible.value).toBe(false)

    vi.advanceTimersByTime(1)
    expect(bannerVisible.value).toBe(true)
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

  it('returns no-op functions when serviceWorker is not supported', () => {
    Object.defineProperty(navigator, 'serviceWorker', { value: undefined, configurable: true })
    const { applyUpdate, snooze } = useServiceWorkerUpdate()
    expect(() => applyUpdate()).not.toThrow()
    expect(() => snooze()).not.toThrow()
  })
})
