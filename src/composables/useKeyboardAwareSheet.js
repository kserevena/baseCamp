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
// Keeping a focused field itself visible above the keyboard while a sheet
// scrolls internally (#162) is deliberately NOT handled here — two JS
// approaches (Element.scrollIntoView(), then a manual visualViewport-based
// scrollTop correction) both proved unreliable on real Android devices. The
// robust fix is structural instead: sheets with tall, scrollable content put
// their text fields in a fixed header outside the scrolling region (see
// ShoppingView.vue's Add item sheet), so there is nothing for the keyboard
// to scroll them behind in the first place.
export function useKeyboardAwareSheet(sheetOpen, cssVar) {
  function sync() {
    const vv = window.visualViewport
    const h = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
    document.documentElement.style.setProperty(cssVar, `${h}px`)
  }

  watch(sheetOpen, (open) => {
    if (open) {
      sync()
      window.visualViewport?.addEventListener('resize', sync)
    } else {
      window.visualViewport?.removeEventListener('resize', sync)
      document.documentElement.style.setProperty(cssVar, '0px')
    }
  })

  // Guard against navigating away while a sheet is open: Vue stops the watch
  // but does not fire the else-branch, leaving the raw DOM listener alive.
  onUnmounted(() => {
    window.visualViewport?.removeEventListener('resize', sync)
    document.documentElement.style.setProperty(cssVar, '0px')
  })
}
