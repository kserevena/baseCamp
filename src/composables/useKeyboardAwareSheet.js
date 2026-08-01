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
// focused field can end up scrolled out above the keyboard (#162).
//
// Element.scrollIntoView() is NOT sufficient here — it judges visibility
// against window.innerHeight (the layout viewport), which does not shrink
// when the Android keyboard appears; only window.visualViewport does. So a
// field that's actually hidden behind the keyboard can still look "already
// visible" to scrollIntoView, which then does nothing. We instead measure
// the field against window.visualViewport directly (the same measurement
// `sync` already trusts for the CSS var below) and adjust the scrollable
// card's scrollTop ourselves, both on focus and on every viewport resize
// (the keyboard's height is still animating when the focus event fires).
export function useKeyboardAwareSheet(sheetOpen, cssVar) {
  function findScrollableAncestor(el) {
    let node = el.parentElement
    while (node) {
      if (node.scrollHeight > node.clientHeight && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) {
        return node
      }
      node = node.parentElement
    }
    return null
  }

  function keepFieldVisible(field) {
    if (field?.tagName !== 'INPUT' && field?.tagName !== 'TEXTAREA') return
    const vv = window.visualViewport
    if (!vv) return
    const scrollParent = findScrollableAncestor(field)
    if (!scrollParent) return

    const visibleTop = vv.offsetTop
    const visibleBottom = vv.offsetTop + vv.height
    const rect = field.getBoundingClientRect()
    const margin = 12 // breathing room above the keyboard / below the sheet header

    if (rect.bottom > visibleBottom) {
      scrollParent.scrollTop += rect.bottom - visibleBottom + margin
    } else if (rect.top < visibleTop) {
      scrollParent.scrollTop -= visibleTop - rect.top + margin
    }
  }

  function sync() {
    const vv = window.visualViewport
    const h = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0
    document.documentElement.style.setProperty(cssVar, `${h}px`)
    keepFieldVisible(document.activeElement)
  }

  function onFocusIn(event) {
    keepFieldVisible(event.target)
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
