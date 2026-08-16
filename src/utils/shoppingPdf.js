import { jsPDF } from 'jspdf'

const PAGE_MARGIN = 40
const CHECKBOX_SIZE = 12
const LINE_HEIGHT = 22
const HEADING_GAP = 16
const SECTION_GAP = 12
const STAR_OUTER_RADIUS = 6
const STAR_COLOR = [230, 160, 0]

// Priority items get their own leading section (alphabetical) as a
// quick-glance summary, AND stay in their aisle group at their standard
// position — unlike ShoppingList.vue's buildGroups, which pulls them out of
// the aisle group entirely. A star marker (drawn in buildShoppingListPdf)
// is what distinguishes a priority item wherever it appears, since it's no
// longer exclusive to the Priority section. Any item whose aisle isn't in
// `aisles` (e.g. stale data) falls into its own trailing group rather than
// being dropped. Exported (rather than kept private) so the grouping/
// ordering logic can be unit tested directly — jsPDF's drawing methods are
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
  const deltas = points.map((p, i) => {
    const prev = i === 0 ? points[points.length - 1] : points[i - 1]
    return [p[0] - prev[0], p[1] - prev[1]]
  })
  const start = points[points.length - 1]
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
    doc.text(section.heading, PAGE_MARGIN, y)
    doc.setFont(undefined, 'normal')
    y += HEADING_GAP

    for (const item of section.items) {
      ensureSpace(LINE_HEIGHT)
      const boxTop = y - CHECKBOX_SIZE + 2
      doc.rect(PAGE_MARGIN, boxTop, CHECKBOX_SIZE, CHECKBOX_SIZE)
      doc.setFontSize(12)
      const label = item.qty ? `${item.name} (${item.qty})` : item.name
      doc.text(label, PAGE_MARGIN + CHECKBOX_SIZE + 10, y)
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
