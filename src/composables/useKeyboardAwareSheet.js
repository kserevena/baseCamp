import { watch, onUnmounted } from 'vue'

// On Android, dismissing the virtual keyboard causes the visual viewport to
// snap back to full height, but a Vuetify v-bottom-sheet's overlay content
// (anchored via align-self:flex-end) can be left below the visible screen
// edge. This composable tracks the keyboard height while the sheet is open
// and stores it as a CSS custom property on :root; the sheet's content-class
// CSS rule uses that variable as margin-bottom to keep the sheet visible.
// See issues #49 and #109 for background. v-dialog is NOT affected (it uses
// centered positioning rather than bottom-anchored).
//
// It also keeps whichever field is being edited in view: on a tall sheet
// (many aisle/supermarket chips) the card scrolls internally, and the
// browser's own scroll-into-view heuristics can leave the focused field
// scrolled out above the keyboard (#162). We re-run scrollIntoView on the
// active field both on focus and on every viewport resize, since the
// keyboard's height is still animating when the focus event first fires.
export function useKeyboardAwareSheet(sheetOpen, cssVar) {
  function scrollFocusedFieldIntoView() {
    const active = document.activeElement
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }

  function sync() {
    const vv = window.visualViewport
    const h = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
    document.documentElement.style.setProperty(cssVar, `${h}px`)
    scrollFocusedFieldIntoView()
  }

  function onFocusIn(event) {
    if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') {
      event.target.scrollIntoView({ block: 'nearest' })
    }
  }

  watch(sheetOpen, (open) => {
    if (open) {
      sync()
      window.visualViewport?.addEventListener('resize', sync)
      document.addEventListener('focusin', onFocusIn)
    } else {
      window.visualViewport?.removeEventListener('resize', sync)
      document.removeEventListener('focusin', onFocusIn)
      document.documentElement.style.setProperty(cssVar, '0px')
    }
  })

  // Guard against navigating away while a sheet is open: Vue stops the watch
  // but does not fire the else-branch, leaving the raw DOM listener alive.
  onUnmounted(() => {
    window.visualViewport?.removeEventListener('resize', sync)
    document.removeEventListener('focusin', onFocusIn)
    document.documentElement.style.setProperty(cssVar, '0px')
  })
}
