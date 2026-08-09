<script setup>
import { ref, computed, watch } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { useWishListStore } from '@/stores/wishList.js'
import { useUserRole } from '@/composables/useUserRole.js'
import { WISH_ITEM_NAME_MAX_LENGTH } from '@/constants/wishList.js'
import { normaliseHttpUrl } from '@/utils/url.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'
import WishListItem from '@/components/WishListItem.vue'

const family = useFamilyStore()
const store = useWishListStore()
const { isParent } = useUserRole()

// ── whose list is being viewed ──────────────────────────────────────────────

// Local view state only — it never touches Firestore. Defaults to your own list
// and follows currentUser once the members snapshot arrives (familyId becomes
// non-null before the member documents load, so currentUser starts null).
const selectedUid = ref(family.currentUser?.uid ?? null)

watch(
  () => family.currentUser?.uid,
  (uid) => {
    if (uid && selectedUid.value === null) selectedUid.value = uid
  },
  { immediate: true },
)

// A member removed from the family while being viewed falls back to your list.
watch(
  () => family.members,
  (members) => {
    if (selectedUid.value && !members.some(m => m.uid === selectedUid.value)) {
      selectedUid.value = family.currentUser?.uid ?? null
    }
  },
  { deep: true },
)

const isOwnList = computed(() => selectedUid.value === family.currentUser?.uid)
// You manage your own list; parents can also manage anyone's. Mirrors the
// wishListItems security rules — the UI hides what the rules would reject.
const canWrite = computed(() => isOwnList.value || isParent.value)
const selectedName = computed(() =>
  family.members.find(m => m.uid === selectedUid.value)?.name ?? ''
)

// ── item sections ───────────────────────────────────────────────────────────

const visibleItems = computed(() =>
  selectedUid.value ? store.itemsFor(selectedUid.value) : []
)
const activeItems = computed(() => visibleItems.value.filter(i => !i.done))
const doneItems = computed(() => visibleItems.value.filter(i => i.done))

const doneCollapsed = ref(true)

// ── add / edit dialog ───────────────────────────────────────────────────────

// A v-dialog (not a v-bottom-sheet) so none of the Android keyboard handling in
// useKeyboardAwareSheet applies — v-dialog is centred and unaffected (#49/#109).
const itemDialog = ref(false)
const editingId = ref(null)
const formName = ref('')
const formNote = ref('')
const formLink = ref('')
const nameError = ref('')
const linkError = ref('')

function openAdd() {
  editingId.value = null
  formName.value = ''
  formNote.value = ''
  formLink.value = ''
  nameError.value = ''
  linkError.value = ''
  itemDialog.value = true
}

function openEdit(item) {
  editingId.value = item.id
  formName.value = item.name
  formNote.value = item.note ?? ''
  formLink.value = item.link ?? ''
  nameError.value = ''
  linkError.value = ''
  itemDialog.value = true
}

// Fire-and-forget per the offline convention: validate synchronously, write
// without awaiting, close the dialog immediately.
function submitItem() {
  const name = formName.value.trim()
  if (!name) {
    nameError.value = 'Name is required'
    return
  }
  if (name.length > WISH_ITEM_NAME_MAX_LENGTH) {
    nameError.value = `Name must be ${WISH_ITEM_NAME_MAX_LENGTH} characters or fewer`
    return
  }
  const note = formNote.value.trim() || null

  // A link is stored as an href. normaliseHttpUrl adds https:// to a schemeless
  // entry (otherwise it resolves relative to /wish-lists) and rejects anything
  // that is not a web address.
  let link = null
  if (formLink.value.trim()) {
    link = normaliseHttpUrl(formLink.value)
    if (!link) {
      linkError.value = 'Enter a web address, e.g. https://example.com'
      return
    }
  }

  if (editingId.value) {
    store.updateItem(editingId.value, { name, note, link })
  } else {
    store.addItem({ ownerUid: selectedUid.value, name, note, link })
  }
  itemDialog.value = false
}
</script>

<template>
  <div class="wish-list-view">
    <!-- ── header ── -->
    <div class="d-flex align-center mb-3">
      <span class="text-h6 font-weight-bold flex-grow-1">Wish Lists</span>
    </div>

    <!-- ── member selector ── -->
    <div class="d-flex gap-3 flex-wrap mb-4">
      <div
        v-for="member in family.members"
        :key="member.uid"
        class="d-flex flex-column align-center gap-1 member-picker"
        :class="{ 'member-selected': member.uid === selectedUid }"
        role="button"
        :aria-pressed="member.uid === selectedUid"
        @click="selectedUid = member.uid"
      >
        <v-badge
          :model-value="store.activeCountFor(member.uid) > 0"
          :content="store.activeCountFor(member.uid)"
          color="primary"
          offset-x="2"
          offset-y="2"
        >
          <FamilyAvatar :uid="member.uid" :size="44" />
        </v-badge>
        <span class="text-caption">{{ member.name }}</span>
      </div>
    </div>

    <!-- ── empty state ── -->
    <div v-if="visibleItems.length === 0" class="text-center text-medium-emphasis py-8">
      <v-icon size="48" class="mb-2">mdi-gift-outline</v-icon>
      <p class="text-body-1">
        {{ isOwnList ? 'Nothing on your wish list yet' : `${selectedName} hasn't added anything yet` }}
      </p>
      <p v-if="canWrite" class="text-body-2">Tap + to add the first thing</p>
    </div>

    <!-- ── outstanding wishes ── -->
    <v-card v-if="activeItems.length > 0" rounded="lg" elevation="1" class="mb-3">
      <v-list density="comfortable">
        <WishListItem
          v-for="item in activeItems"
          :key="item.id"
          :item="item"
          :can-write="canWrite"
          @edit="openEdit(item)"
          @delete="store.deleteItem(item.id)"
        />
      </v-list>
    </v-card>

    <!-- ── ticked off ── -->
    <div v-if="doneItems.length > 0" class="mb-3">
      <div
        class="d-flex align-center mb-1 cursor-pointer text-medium-emphasis"
        @click="doneCollapsed = !doneCollapsed"
      >
        <v-icon size="18" class="mr-1">
          {{ doneCollapsed ? 'mdi-chevron-right' : 'mdi-chevron-down' }}
        </v-icon>
        <span class="text-subtitle-2 font-weight-medium">Ticked off</span>
        <v-chip size="x-small" class="ml-1" variant="tonal" color="grey">
          {{ doneItems.length }}
        </v-chip>
      </div>

      <v-card v-if="!doneCollapsed" rounded="lg" elevation="1">
        <v-list density="comfortable">
          <WishListItem
            v-for="item in doneItems"
            :key="item.id"
            :item="item"
            :can-write="canWrite"
            @edit="openEdit(item)"
            @delete="store.deleteItem(item.id)"
          />
        </v-list>
      </v-card>
    </div>

    <!-- ── Add FAB — same positioning as ShoppingView/JobsView. Shown only when
         the viewer may write to the list on screen (own list, or any list for
         a parent). ── -->
    <v-btn
      v-if="canWrite && selectedUid"
      icon
      color="primary"
      size="56"
      elevation="4"
      class="fab"
      aria-label="Add wish"
      @click="openAdd"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>

    <!-- ── Add / edit dialog ── -->
    <v-dialog v-model="itemDialog" max-width="480">
      <v-card>
        <v-card-title>
          {{ editingId ? 'Edit item' : (isOwnList ? 'Add to your wish list' : `Add to ${selectedName}'s list`) }}
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="formName"
            label="What do you want? *"
            variant="outlined"
            density="compact"
            :error-messages="nameError"
            :counter="WISH_ITEM_NAME_MAX_LENGTH"
            class="mb-2"
            autofocus
            @input="nameError = ''"
            @keyup.enter="submitItem"
          />
          <v-textarea
            v-model="formNote"
            label="Note (optional)"
            variant="outlined"
            density="compact"
            rows="2"
            auto-grow
            class="mb-2"
          />
          <v-text-field
            v-model="formLink"
            label="Link (optional)"
            variant="outlined"
            density="compact"
            type="url"
            :error-messages="linkError"
            @input="linkError = ''"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="itemDialog = false">Cancel</v-btn>
          <v-btn color="primary" variant="flat" @click="submitItem">
            {{ editingId ? 'Save' : 'Add' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<style scoped>
.wish-list-view {
  position: relative;
  min-height: calc(100vh - 64px);
  padding: 12px;
  /* Clear the fixed FAB (bottom: 80px + 56px tall) so the last items stay
     visible and tappable above it. Mirrors ShoppingView/JobsView (#19). */
  padding-bottom: calc(152px + env(safe-area-inset-bottom));
}

.member-picker {
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 12px;
  min-width: 60px;
}

.member-selected {
  background-color: rgba(var(--v-theme-primary), 0.12);
}
</style>
