// Shared by ShoppingList.vue (on-screen drag order) and shoppingPdf.js
// (PDF export) so the two can't silently drift apart again — see the aisle
// PDF export missing sortOrder before this was extracted.
//
// Items without a sortOrder (null/undefined) sort after all explicitly
// ordered items, then fall back to alphabetical within that group.
export function compareShoppingItems(a, b) {
  return (a.sortOrder ?? Infinity) !== (b.sortOrder ?? Infinity)
    ? (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity)
    : a.name.localeCompare(b.name)
}
