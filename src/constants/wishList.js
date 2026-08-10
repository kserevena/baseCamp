// Length caps for wish list item fields.
// Each must stay in sync with the matching size() check in firestore.rules —
// the store subscribes to the whole family collection unfiltered, so an
// oversized field is downloaded by every family device.
export const WISH_ITEM_NAME_MAX_LENGTH = 80
export const WISH_ITEM_NOTE_MAX_LENGTH = 300
export const WISH_ITEM_LINK_MAX_LENGTH = 500
