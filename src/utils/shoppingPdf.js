import { jsPDF } from 'jspdf'

const PAGE_MARGIN = 40
const CHECKBOX_SIZE = 12
const LINE_HEIGHT = 22
const HEADING_GAP = 16
const SECTION_GAP = 12
const STAR_OUTER_RADIUS = 6
const STAR_COLOR = [230, 160, 0]

// jsPDF's standard fonts (Helvetica etc.) only support WinAnsiEncoding —
// Latin-1 (code points 0-255) plus ~27 extra typographic punctuation marks
// jsPDF maps onto it (curly quotes, en/em dash, ellipsis, €, ™, ...). A
// single character outside that set — an emoji, most non-Latin scripts —
// doesn't just fail to render itself: jsPDF flips the *entire* string into
// a 2-byte Unicode encoding meant for embedded TrueType fonts, which the
// standard fonts can't read, silently corrupting every character in the
// string rather than just the unsupported one (same underlying encoding
// limit as the star glyph handled by drawPriorityStar below). List and item
// names are free user text, so anything unrepresentable is swapped for '?'
// before it reaches text() — that degrades gracefully instead of mangling
// an otherwise-representable name.
const WINANSI_EXTRAS = new Set([
  0x0152, 0x0153, 0x0160, 0x0161, 0x0178, 0x017d, 0x017e, 0x0192, 0x02c6,
  0x02dc, 0x2013, 0x2014, 0x2018, 0x2019, 0x201a, 0x201c, 0x201d, 0x201e,
  0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2039, 0x203a, 0x20ac, 0x2122,
])

export function sanitizeForPdf(text) {
  return Array.from(String(text))
    .map((ch) => {
      const code = ch.codePointAt(0)
      return code <= 0xff || WINANSI_EXTRAS.has(code) ? ch : '?'
    })
    .join('')
}

// Priority items get their own leading section (alphabetical) as a
// quick-glance summary, AND stay in their aisle group at their standard
// position — matching ShoppingList.vue's buildGroups, which has always kept
// priority items in both places (its priorityItems computed and buildGroups
// draw from the same !done items independently; nothing pulls one out of
// the other). A star marker (drawn in buildShoppingListPdf) is what
// distinguishes a priority item wherever it appears, since it's not
// exclusive to the Priority section. Any item whose aisle isn't in `aisles`
// (e.g. stale data) falls into its own trailing group rather than being
// dropped. Exported (rather than kept private) so the grouping/ordering
// logic can be unit tested directly — jsPDF's drawing methods are
// per-instance closures, not prototype methods, so they can't be spied on
// the way DOM APIs can.
export function buildPrintableSections(items, aisles) {
  const unpurchased = items.filter(i => !i.done)
  const priorityItems = unpurchased
    .filter(i => i.priority ?? false)
    .sort((a, b) => a.name.localeCompare(b.name))

  const groups = aisles.map(a => ({ heading: a.name, items: [] }))
  for (const item of unpurchased) {
    let group = groups.find(g => g.heading.toLowerCase() === (item.aisle ?? '').toLowerCase())
    if (!group) {
      group = { heading: item.aisle || 'Other', items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  for (const group of groups) group.items.sort((a, b) => a.name.localeCompare(b.name))

  const sections = []
  if (priorityItems.length > 0) sections.push({ heading: 'Priority', items: priorityItems })
  for (const group of groups) {
    if (group.items.length > 0) sections.push(group)
  }
  return sections
}

// jsPDF's standard fonts use WinAnsiEncoding, which has no glyph for a star
// character (U+2605) — passing it to text() silently mangles it into
// unrelated bytes rather than throwing. A star is drawn as a filled vector
// polygon instead, centred at (cx, cy).
function drawPriorityStar(doc, cx, cy) {
  const outer = STAR_OUTER_RADIUS
  const inner = outer * 0.382 // classic 5-point star inner/outer ratio
  const points = []
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
  }
  // Start the path at the last vertex and draw deltas to every other vertex;
  // closed:true below draws the final segment back to the start, so that
  // last vertex itself is deliberately omitted from the deltas — including
  // it would walk the pen back to the start explicitly, making the
  // auto-close a redundant zero-length no-op.
  const start = points[points.length - 1]
  const deltas = points.slice(0, -1).map((p, i) => {
    const prev = i === 0 ? start : points[i - 1]
    return [p[0] - prev[0], p[1] - prev[1]]
  })
  doc.setFillColor(...STAR_COLOR)
  doc.lines(deltas, start[0], start[1], [1, 1], 'F', true)
}

// Pure builder — returns a jsPDF document. Kept separate from the download
// side effect so it can be unit tested without touching the DOM.
export function buildShoppingListPdf(listName, items, aisles) {
  const sections = buildPrintableSections(items, aisles)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  let y = PAGE_MARGIN

  doc.setFontSize(18)
  doc.setFont(undefined, 'bold')
  doc.text(sanitizeForPdf(listName || 'Shopping list'), PAGE_MARGIN, y)
  doc.setFont(undefined, 'normal')

  doc.setFontSize(10)
  doc.setTextColor(120)
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(today, PAGE_MARGIN, y + 16)
  doc.setTextColor(0)
  y += 40

  function ensureSpace(needed) {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      doc.addPage()
      y = PAGE_MARGIN
    }
  }

  if (sections.length === 0) {
    doc.setFontSize(12)
    doc.text('Nothing left to buy — the list is all done!', PAGE_MARGIN, y)
    return doc
  }

  for (const section of sections) {
    ensureSpace(HEADING_GAP + LINE_HEIGHT)
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    doc.text(sanitizeForPdf(section.heading), PAGE_MARGIN, y)
    doc.setFont(undefined, 'normal')
    y += HEADING_GAP

    for (const item of section.items) {
      ensureSpace(LINE_HEIGHT)
      const boxTop = y - CHECKBOX_SIZE + 2
      doc.rect(PAGE_MARGIN, boxTop, CHECKBOX_SIZE, CHECKBOX_SIZE)
      doc.setFontSize(12)
      const label = item.qty ? `${item.name} (${item.qty})` : item.name
      doc.text(sanitizeForPdf(label), PAGE_MARGIN + CHECKBOX_SIZE + 10, y)
      if (item.priority ?? false) {
        const starCenterY = boxTop + CHECKBOX_SIZE / 2
        drawPriorityStar(doc, pageWidth - PAGE_MARGIN - STAR_OUTER_RADIUS, starCenterY)
      }
      y += LINE_HEIGHT
    }
    y += SECTION_GAP
  }

  return doc
}

export function pdfFilenameFor(listName) {
  const slug = (listName || 'shopping-list').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'shopping-list'}.pdf`
}

export function downloadShoppingListPdf(listName, items, aisles) {
  const doc = buildShoppingListPdf(listName, items, aisles)
  doc.save(pdfFilenameFor(listName))
}
