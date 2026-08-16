import { describe, it, expect, vi } from 'vitest'
import { buildPrintableSections, pdfFilenameFor, buildShoppingListPdf } from '@/utils/shoppingPdf.js'

const aisles = [
  { name: 'Dairy', order: 1 },
  { name: 'Meat', order: 2 },
]

describe('shoppingPdf', () => {
  // buildPrintableSections carries all the grouping/ordering/filtering logic —
  // it's a pure function, unlike jsPDF's drawing calls (per-instance closures,
  // not prototype methods, so they can't be spied on), so it's tested directly
  // rather than by inspecting rendered PDF output.
  describe('buildPrintableSections', () => {
    it('excludes done items', () => {
      const items = [
        { id: '1', name: 'Milk', aisle: 'Dairy', done: false },
        { id: '2', name: 'Bread', aisle: 'Dairy', done: true },
      ]
      const sections = buildPrintableSections(items, aisles)
      const names = sections.flatMap(s => s.items.map(i => i.name))
      expect(names).toEqual(['Milk'])
    })

    it('groups by aisle in aisle order and sorts items alphabetically within a group', () => {
      const items = [
        { id: '1', name: 'Yoghurt', aisle: 'Dairy', done: false },
        { id: '2', name: 'Milk', aisle: 'Dairy', done: false },
        { id: '3', name: 'Bacon', aisle: 'Meat', done: false },
      ]
      const sections = buildPrintableSections(items, aisles)
      expect(sections.map(s => s.heading)).toEqual(['Dairy', 'Meat'])
      expect(sections[0].items.map(i => i.name)).toEqual(['Milk', 'Yoghurt'])
    })

    it('keeps priority items in their standard aisle group rather than a leading section', () => {
      const items = [
        { id: '1', name: 'Bacon', aisle: 'Meat', done: false },
        { id: '2', name: 'Steak', aisle: 'Meat', done: false, priority: true },
        { id: '3', name: 'Apples', aisle: 'Dairy', done: false, priority: true },
      ]
      const sections = buildPrintableSections(items, aisles)
      expect(sections.map(s => s.heading)).toEqual(['Dairy', 'Meat'])
      const meatSection = sections.find(s => s.heading === 'Meat')
      // Same alphabetical sort as any other aisle group — priority isn't
      // pulled out here, so it sorts on name like everything else.
      expect(meatSection.items.map(i => i.name)).toEqual(['Bacon', 'Steak'])
    })

    it('collects items under their own aisle name, appended after the known aisles, when absent from the supplied aisle list', () => {
      const items = [{ id: '1', name: 'Mystery item', aisle: 'Frozen', done: false }]
      const sections = buildPrintableSections(items, aisles)
      expect(sections.map(s => s.heading)).toEqual(['Frozen'])
    })

    it('matches aisle names case-insensitively', () => {
      const items = [{ id: '1', name: 'Milk', aisle: 'dairy', done: false }]
      const sections = buildPrintableSections(items, aisles)
      expect(sections).toEqual([{ heading: 'Dairy', items: [items[0]] }])
    })

    it('omits aisle sections that end up with no unpurchased items', () => {
      const items = [{ id: '1', name: 'Milk', aisle: 'Dairy', done: false }]
      const sections = buildPrintableSections(items, aisles)
      expect(sections.map(s => s.heading)).toEqual(['Dairy'])
    })

    it('returns an empty array when every item is done', () => {
      const items = [{ id: '1', name: 'Milk', aisle: 'Dairy', done: true }]
      expect(buildPrintableSections(items, aisles)).toEqual([])
    })
  })

  describe('pdfFilenameFor', () => {
    it('slugifies the list name', () => {
      expect(pdfFilenameFor('Weekend Shop!!')).toBe('weekend-shop.pdf')
    })

    it('falls back to a default name when blank', () => {
      expect(pdfFilenameFor('')).toBe('shopping-list.pdf')
      expect(pdfFilenameFor('   ')).toBe('shopping-list.pdf')
      expect(pdfFilenameFor(undefined)).toBe('shopping-list.pdf')
    })

    it('strips leading/trailing separators produced by punctuation at the edges', () => {
      expect(pdfFilenameFor('  !Weekly Shop!  ')).toBe('weekly-shop.pdf')
    })
  })

  describe('buildShoppingListPdf', () => {
    it('returns a jsPDF document', () => {
      const doc = buildShoppingListPdf('Weekly shop', [], aisles)
      expect(typeof doc.save).toBe('function')
      expect(typeof doc.output).toBe('function')
    })

    it('does not throw and produces a single page when there are no unpurchased items', () => {
      const items = [{ id: '1', name: 'Milk', aisle: 'Dairy', done: true }]
      const doc = buildShoppingListPdf('Weekly shop', items, aisles)
      expect(doc.internal.getNumberOfPages()).toBe(1)
    })

    it('overflows onto additional pages once enough items are printed', () => {
      const manyItems = Array.from({ length: 80 }, (_, i) => ({
        id: `i${i}`, name: `Item ${i}`, aisle: 'Dairy', done: false,
      }))
      const doc = buildShoppingListPdf('Big shop', manyItems, aisles)
      expect(doc.internal.getNumberOfPages()).toBeGreaterThan(1)
    })
  })

  describe('priority star marker', () => {
    // jsPDF's standard fonts can't render a Unicode star glyph (WinAnsiEncoding
    // has no U+2605), so the star is drawn as a filled vector polygon via
    // lines()/setFillColor() rather than text() — verified here by mocking the
    // 'jspdf' module and recording those calls, since jsPDF's real drawing
    // methods are per-instance closures that can't be spied on directly.
    it('draws one star per priority item, right-aligned near the page edge', async () => {
      vi.resetModules()
      const linesCalls = []
      const fillColorCalls = []
      vi.doMock('jspdf', () => ({
        jsPDF: vi.fn().mockImplementation(function () {
          return {
            setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(),
            text: vi.fn(), rect: vi.fn(), addPage: vi.fn(),
            setFillColor: (...args) => fillColorCalls.push(args),
            lines: (...args) => linesCalls.push(args),
            internal: { pageSize: { getHeight: () => 800, getWidth: () => 595 } },
            save: vi.fn(),
          }
        }),
      }))
      const { buildShoppingListPdf: build } = await import('@/utils/shoppingPdf.js')
      const items = [
        { id: '1', name: 'Milk', aisle: 'Dairy', done: false },
        { id: '2', name: 'Steak', aisle: 'Meat', done: false, priority: true },
      ]
      try {
        build('Weekly shop', items, aisles)
        // Steak is starred in its Meat aisle group; Milk never is.
        expect(linesCalls.length).toBe(1)
        expect(fillColorCalls.length).toBe(1)
        const pageWidth = 595
        const margin = 40
        for (const call of linesCalls) {
          const startX = call[1]
          // The star's rightmost point sits at pageWidth - margin; the drawn
          // start point (one of the star's own vertices) should be within one
          // star-width of that edge.
          expect(startX).toBeGreaterThan(pageWidth - margin - 12)
          expect(startX).toBeLessThanOrEqual(pageWidth - margin)
        }
      } finally {
        vi.doUnmock('jspdf')
        vi.resetModules()
      }
    })

    it('draws no star when there are no priority items', async () => {
      vi.resetModules()
      const linesCalls = []
      vi.doMock('jspdf', () => ({
        jsPDF: vi.fn().mockImplementation(function () {
          return {
            setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(),
            text: vi.fn(), rect: vi.fn(), addPage: vi.fn(),
            setFillColor: vi.fn(),
            lines: (...args) => linesCalls.push(args),
            internal: { pageSize: { getHeight: () => 800, getWidth: () => 595 } },
            save: vi.fn(),
          }
        }),
      }))
      const { buildShoppingListPdf: build } = await import('@/utils/shoppingPdf.js')
      const items = [{ id: '1', name: 'Milk', aisle: 'Dairy', done: false }]
      try {
        build('Weekly shop', items, aisles)
        expect(linesCalls.length).toBe(0)
      } finally {
        vi.doUnmock('jspdf')
        vi.resetModules()
      }
    })
  })

  describe('downloadShoppingListPdf', () => {
    it('saves under the filename derived from the list name', async () => {
      vi.resetModules()
      const saveSpy = vi.fn()
      vi.doMock('jspdf', () => ({
        jsPDF: vi.fn().mockImplementation(function () {
          return {
            setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(),
            text: vi.fn(), rect: vi.fn(), addPage: vi.fn(),
            internal: { pageSize: { getHeight: () => 800, getWidth: () => 595 } },
            save: saveSpy,
          }
        }),
      }))
      const { downloadShoppingListPdf: download } = await import('@/utils/shoppingPdf.js')
      const items = [{ id: '1', name: 'Milk', aisle: 'Dairy', done: false }]
      download('Weekend Shop!!', items, aisles)
      expect(saveSpy).toHaveBeenCalledWith('weekend-shop.pdf')
      vi.doUnmock('jspdf')
      vi.resetModules()
    })
  })
})
