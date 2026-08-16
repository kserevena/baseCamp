import { jsPDF } from 'jspdf'
import { compareShoppingItems } from '@/utils/shoppingItemOrder.js'

const PAGE_MARGIN = 40
const CHECKBOX_SIZE = 12
const LINE_HEIGHT = 22
const HEADING_GAP = 16
const SECTION_GAP = 12
const STAR_OUTER_RADIUS = 6
const STAR_COLOR = [230, 160, 0]
const COLUMN_GAP = 24
const COLUMN_COUNT = 2
// Reserved so a priority item's star never collides with wrapped text —
// applied to every item's wrap width, not just starred ones, so a
// multi-line item sits at the same width whether or not it's starred.
const STAR_GUTTER = STAR_OUTER_RADIUS * 2 + 6

// Priority items stay in their aisle group at their standard position —
// matching ShoppingList.vue's buildGroups. A star marker (drawn in
// buildShoppingListPdf) is what distinguishes a priority item within its
// aisle. Any item whose aisle isn't in `aisles` (e.g. stale data) falls
// into its own trailing group rather than being dropped. Exported (rather
// than kept private) so the grouping/ordering logic can be unit tested
// directly — jsPDF's drawing methods are per-instance closures, not
// prototype methods, so they can't be spied on the way DOM APIs can.
export function buildPrintableSections(items, aisles) {
  const unpurchased = items.filter(i => !i.done)

  const groups = aisles.map(a => ({ heading: a.name, items: [] }))
  for (const item of unpurchased) {
    let group = groups.find(g => g.heading.toLowerCase() === (item.aisle ?? '').toLowerCase())
    if (!group) {
      group = { heading: item.aisle || 'Other', items: [] }
      groups.push(group)
    }
    group.items.push(item)
  }
  for (const group of groups) group.items.sort(compareShoppingItems)

  return groups.filter(group => group.items.length > 0)
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
  doc.text(listName || 'Shopping list', PAGE_MARGIN, y)
  doc.setFont(undefined, 'normal')

  doc.setFontSize(10)
  doc.setTextColor(120)
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(today, PAGE_MARGIN, y + 16)
  doc.setTextColor(0)
  y += 40

  if (sections.length === 0) {
    doc.setFontSize(12)
    doc.text('Nothing left to buy — the list is all done!', PAGE_MARGIN, y)
    return doc
  }

  // Items flow down the left column, then the right column, then a new
  // page — a "snaking" newspaper-style layout — so the a4 page's width
  // isn't wasted on a single narrow list.
  const columnWidth = (pageWidth - 2 * PAGE_MARGIN - COLUMN_GAP * (COLUMN_COUNT - 1)) / COLUMN_COUNT
  let column = 0
  let columnX = PAGE_MARGIN
  let columnTop = y
  // Set while drawing a section's items, cleared between sections — lets
  // ensureSpace repeat the heading when a column/page break lands mid-section,
  // so continuation items are never left under an implied heading two
  // columns back.
  let currentHeadingLines = null

  function drawHeadingLines(lines) {
    doc.setFontSize(13)
    doc.setFont(undefined, 'bold')
    lines.forEach((line, i) => doc.text(line, columnX, y + i * LINE_HEIGHT))
    doc.setFont(undefined, 'normal')
    y += HEADING_GAP + LINE_HEIGHT * (lines.length - 1)
  }

  function ensureSpace(needed) {
    if (y + needed > pageHeight - PAGE_MARGIN) {
      if (column < COLUMN_COUNT - 1) {
        column += 1
        columnX = PAGE_MARGIN + column * (columnWidth + COLUMN_GAP)
      } else {
        doc.addPage()
        column = 0
        columnX = PAGE_MARGIN
        columnTop = PAGE_MARGIN
      }
      y = columnTop
      if (currentHeadingLines) drawHeadingLines(currentHeadingLines)
    }
  }

  for (const section of sections) {
    currentHeadingLines = null
    doc.setFontSize(13)
    const headingLines = doc.splitTextToSize(section.heading, columnWidth)
    ensureSpace(HEADING_GAP + LINE_HEIGHT * headingLines.length)
    drawHeadingLines(headingLines)
    currentHeadingLines = headingLines

    for (const item of section.items) {
      doc.setFontSize(12)
      const label = item.qty ? `${item.name} (${item.qty})` : item.name
      const maxLabelWidth = columnWidth - CHECKBOX_SIZE - 10 - STAR_GUTTER
      const lines = doc.splitTextToSize(label, maxLabelWidth)
      ensureSpace(LINE_HEIGHT * lines.length)
      const boxTop = y - CHECKBOX_SIZE + 2
      doc.rect(columnX, boxTop, CHECKBOX_SIZE, CHECKBOX_SIZE)
      lines.forEach((line, i) => doc.text(line, columnX + CHECKBOX_SIZE + 10, y + i * LINE_HEIGHT))
      if (item.priority ?? false) {
        const starCenterY = boxTop + CHECKBOX_SIZE / 2
        drawPriorityStar(doc, columnX + columnWidth - STAR_OUTER_RADIUS, starCenterY)
      }
      y += LINE_HEIGHT * lines.length
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
