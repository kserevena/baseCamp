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

    it('puts priority items in their own leading section, alphabetically, ahead of every aisle', () => {
      const items = [
        { id: '1', name: 'Bacon', aisle: 'Meat', done: false },
        { id: '2', name: 'Steak', aisle: 'Meat', done: false, priority: true },
        { id: '3', name: 'Apples', aisle: 'Dairy', done: false, priority: true },
      ]
      const sections = buildPrintableSections(items, aisles)
      expect(sections[0]).toEqual({ heading: 'Priority', items: [
        { id: '3', name: 'Apples', aisle: 'Dairy', done: false, priority: true },
        { id: '2', name: 'Steak', aisle: 'Meat', done: false, priority: true },
      ] })
      // Priority items are pulled out of their aisle group, not duplicated into it.
      const meatSection = sections.find(s => s.heading === 'Meat')
      expect(meatSection.items.map(i => i.name)).toEqual(['Bacon'])
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

  describe('downloadShoppingListPdf', () => {
    it('saves under the filename derived from the list name', async () => {
      vi.resetModules()
      const saveSpy = vi.fn()
      vi.doMock('jspdf', () => ({
        jsPDF: vi.fn().mockImplementation(function () {
          return {
            setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(),
            text: vi.fn(), rect: vi.fn(), addPage: vi.fn(),
            internal: { pageSize: { getHeight: () => 800 } },
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
