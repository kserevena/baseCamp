import { jsPDF } from 'jspdf'

const PAGE_MARGIN = 40
const CHECKBOX_SIZE = 12
const LINE_HEIGHT = 22
const HEADING_GAP = 16
const SECTION_GAP = 12

// Mirrors ShoppingList.vue's buildGroups: priority items first (alphabetical),
// then the remaining unpurchased items grouped by aisle in aisle order. Any
// item whose aisle isn't in `aisles` (e.g. stale data) falls into its own
// trailing group rather than being dropped. Exported (rather than kept
// private) so the grouping/ordering logic can be unit tested directly —
// jsPDF's drawing methods are per-instance closures, not prototype methods,
// so they can't be spied on the way DOM APIs can.
export function buildPrintableSections(items, aisles) {
  const unpurchased = items.filter(i => !i.done)
  const priorityItems = unpurchased
    .filter(i => i.priority ?? false)
    .sort((a, b) => a.name.localeCompare(b.name))
  const rest = unpurchased.filter(i => !(i.priority ?? false))

  const groups = aisles.map(a => ({ heading: a.name, items: [] }))
  for (const item of rest) {
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

// Pure builder — returns a jsPDF document. Kept separate from the download
// side effect so it can be unit tested without touching the DOM.
export function buildShoppingListPdf(listName, items, aisles) {
  const sections = buildPrintableSections(items, aisles)
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
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
      doc.rect(PAGE_MARGIN, y - CHECKBOX_SIZE + 2, CHECKBOX_SIZE, CHECKBOX_SIZE)
      doc.setFontSize(12)
      const label = item.qty ? `${item.name} (${item.qty})` : item.name
      doc.text(label, PAGE_MARGIN + CHECKBOX_SIZE + 10, y)
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
