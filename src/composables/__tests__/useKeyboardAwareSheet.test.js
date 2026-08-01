import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { useKeyboardAwareSheet } from '@/composables/useKeyboardAwareSheet.js'

const CSS_VAR = '--test-sheet-bottom'

let mountedWrappers = []

// Mount a minimal host component that uses the composable. Tracked and
// unmounted in afterEach so its document-level focusin listener doesn't
// linger (and double-apply scroll corrections) in later tests.
function makeSheetOpen() {
  const sheetOpen = ref(false)
  const wrapper = mount({
    setup() {
      useKeyboardAwareSheet(sheetOpen, CSS_VAR)
      return { sheetOpen }
    },
    template: '<div />',
  })
  mountedWrappers.push(wrapper)
  return sheetOpen
}

describe('useKeyboardAwareSheet', () => {
  let mockVp

  beforeEach(() => {
    mockVp = {
      height: 851,
      offsetTop: 0,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    Object.defineProperty(window, 'visualViewport', {
      value: mockVp, writable: true, configurable: true,
    })
    Object.defineProperty(window, 'innerHeight', {
      value: 851, writable: true, configurable: true,
    })
    mountedWrappers = []
  })

  afterEach(() => {
    mountedWrappers.forEach(w => w.unmount())
    document.documentElement.style.removeProperty(CSS_VAR)
  })

  it('registers a visualViewport resize listener when the sheet opens', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()
    expect(mockVp.addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('sets the CSS var to 0px immediately on open when no keyboard is up', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('0px')
  })

  it('updates the CSS var to the keyboard height when the viewport shrinks', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    // Keyboard appears: visual viewport shrinks by 340 px
    mockVp.height = 511
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    resizeCb()

    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('340px')
  })

  it('accounts for visualViewport.offsetTop in the keyboard height calculation', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    // URL bar is visible (offsetTop=20) and keyboard is up; visible area = 491 px
    mockVp.height = 491
    mockVp.offsetTop = 20
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    resizeCb()

    // keyboard = 851 - 491 - 20 = 340 px
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('340px')
  })

  it('clamps the CSS var to 0px when the visual viewport is larger than the window', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    mockVp.height = 900 // edge case: vv.height > innerHeight, no keyboard
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    resizeCb()

    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('0px')
  })

  it('resets the CSS var to 0px and removes the listener when the sheet closes', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    // Keyboard appears
    mockVp.height = 511
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    resizeCb()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('340px')

    sheetOpen.value = false
    await nextTick()

    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('0px')
    expect(mockVp.removeEventListener).toHaveBeenCalledWith('resize', resizeCb)
  })

  it('does not throw and defaults to 0px when window.visualViewport is unavailable', async () => {
    Object.defineProperty(window, 'visualViewport', {
      value: null, writable: true, configurable: true,
    })
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('0px')
  })

  it('registers a focusin listener when the sheet opens and removes it on close', async () => {
    const addSpy = vi.spyOn(document, 'addEventListener')
    const removeSpy = vi.spyOn(document, 'removeEventListener')

    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()
    expect(addSpy).toHaveBeenCalledWith('focusin', expect.any(Function))

    sheetOpen.value = false
    await nextTick()
    expect(removeSpy).toHaveBeenCalledWith('focusin', expect.any(Function))

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  // Field visibility is judged against window.visualViewport (which shrinks
  // for the Android keyboard), not window.innerHeight (which doesn't) — see
  // the composable's top comment / issue #162. These helpers build a real
  // scrollable ancestor + field so we can assert on the resulting scrollTop
  // rather than trusting a browser API (scrollIntoView) that gets this wrong.
  function makeScrollContainer(initialScrollTop = 100) {
    const container = document.createElement('div')
    container.style.overflowY = 'auto'
    Object.defineProperty(container, 'scrollHeight', { value: 2000, configurable: true })
    Object.defineProperty(container, 'clientHeight', { value: 600, configurable: true })
    container.scrollTop = initialScrollTop
    document.body.appendChild(container)
    return container
  }

  function makeField(container, { top, bottom }) {
    const input = document.createElement('input')
    input.getBoundingClientRect = () => ({ top, bottom, left: 0, right: 0, width: 100, height: bottom - top, x: 0, y: top })
    container.appendChild(input)
    return input
  }

  it('scrolls the container up when a focused field is above the visible viewport', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    const container = makeScrollContainer(100)
    const input = makeField(container, { top: -50, bottom: 6 })

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    // visibleTop (0) - rect.top (-50) + margin (12) = 62
    expect(container.scrollTop).toBe(38)
    document.body.removeChild(container)
  })

  it('scrolls the container down when a focused field is hidden below the keyboard', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()
    mockVp.height = 511 // keyboard up: visible bottom = 511

    const container = makeScrollContainer(100)
    const input = makeField(container, { top: 550, bottom: 606 })

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    // rect.bottom (606) - visibleBottom (511) + margin (12) = 107
    expect(container.scrollTop).toBe(207)
    document.body.removeChild(container)
  })

  it('does not scroll when the focused field is already fully visible', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    const container = makeScrollContainer(100)
    const input = makeField(container, { top: 100, bottom: 156 })

    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    expect(container.scrollTop).toBe(100)
    document.body.removeChild(container)
  })

  it('does not scroll on focusin for non-field targets', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    const container = makeScrollContainer(100)
    const div = document.createElement('div')
    div.tabIndex = -1
    container.appendChild(div)

    div.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))

    expect(container.scrollTop).toBe(100)
    document.body.removeChild(container)
  })

  it('re-corrects the currently focused field on subsequent viewport resizes', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    const container = makeScrollContainer(100)
    const input = makeField(container, { top: 550, bottom: 606 })
    input.focus()

    mockVp.height = 511
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    resizeCb()

    expect(container.scrollTop).toBe(207)
    document.body.removeChild(container)
  })

  it('does not throw on resize when no field is focused', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    mockVp.height = 511
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    expect(resizeCb).not.toThrow()
  })

  it('does not throw when a focused field has no scrollable ancestor', async () => {
    const sheetOpen = makeSheetOpen()
    sheetOpen.value = true
    await nextTick()

    const input = document.createElement('input')
    input.getBoundingClientRect = () => ({ top: -50, bottom: 6, left: 0, right: 0, width: 100, height: 56, x: 0, y: -50 })
    document.body.appendChild(input)

    expect(() => input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))).not.toThrow()
    document.body.removeChild(input)
  })

  it('removes the listener and resets the CSS var when the host component unmounts while the sheet is open', async () => {
    const sheetOpen = ref(false)
    const wrapper = mount({
      setup() {
        useKeyboardAwareSheet(sheetOpen, CSS_VAR)
        return { sheetOpen }
      },
      template: '<div />',
    })

    sheetOpen.value = true
    await nextTick()

    // Keyboard up
    mockVp.height = 511
    const [, resizeCb] = mockVp.addEventListener.mock.calls.find(([e]) => e === 'resize')
    resizeCb()
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('340px')

    // Navigate away — component unmounts while sheet is still open
    wrapper.unmount()
    await nextTick()

    expect(mockVp.removeEventListener).toHaveBeenCalledWith('resize', resizeCb)
    expect(document.documentElement.style.getPropertyValue(CSS_VAR)).toBe('0px')
  })
})
