import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref, nextTick } from 'vue'
import { useKeyboardAwareSheet } from '@/composables/useKeyboardAwareSheet.js'

const CSS_VAR = '--test-sheet-bottom'

// Mount a minimal host component that uses the composable.
function makeSheetOpen() {
  const sheetOpen = ref(false)
  mount({
    setup() {
      useKeyboardAwareSheet(sheetOpen, CSS_VAR)
      return { sheetOpen }
    },
    template: '<div />',
  })
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
  })

  afterEach(() => {
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
})
