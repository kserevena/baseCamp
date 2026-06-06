// Polyfills required for Vuetify components in jsdom
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserver

// CSS.supports used by some Vuetify internals
if (!globalThis.CSS) {
  globalThis.CSS = { supports: () => false }
}

// visualViewport used by VOverlay (v-snackbar, v-menu, etc.)
if (!globalThis.visualViewport) {
  globalThis.visualViewport = {
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
    addEventListener: () => {},
    removeEventListener: () => {},
  }
}
