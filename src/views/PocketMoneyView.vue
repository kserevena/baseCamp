<script setup>
import { ref, computed } from 'vue'
import { useFamilyStore } from '@/stores/family.js'
import { usePocketMoneyStore } from '@/stores/pocketMoney.js'
import { useUserRole } from '@/composables/useUserRole.js'
import { formatGBP } from '@/utils/currency.js'
import { formatDate } from '@/utils/date.js'
import { ROLE_CHILD } from '@/constants/roles.js'
import FamilyAvatar from '@/components/FamilyAvatar.vue'

const family = useFamilyStore()
const store = usePocketMoneyStore()

const { isParent } = useUserRole()
const children = computed(() => family.members.filter(m => m.role === ROLE_CHILD))

// ── shared helpers ──────────────────────────────────────────────────────────

function formatBalance(n) {
  return n === null ? 'Not set up' : formatGBP(n)
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// ── child detail sheet (parent) ─────────────────────────────────────────────

const detailSheet = ref(false)
const selectedChild = ref(null)

function openDetail(child) {
  selectedChild.value = child
  detailSheet.value = true
  // Online-only reconciliation; offline/contention failures are expected and non-fatal
  // (displayBalance already shows pending payments locally).
  store.flushPendingPayments(child.uid).catch(() => {})
}

// ── settings dialog ─────────────────────────────────────────────────────────

const settingsDialog = ref(false)
const settingsStarting = ref(0)
const settingsWeekly = ref(0)
const settingsPayDay = ref(5)
const settingsError = ref('')

// Round user-entered pounds to whole pence before storing.
function round2dp(n) {
  return Math.round(n * 100) / 100
}

function openSettings() {
  const snap = store.snapshots.find(s => s.uid === selectedChild.value?.uid)
  settingsStarting.value = snap?.balance ?? 0
  settingsWeekly.value = snap?.weeklyAmount ?? 0
  settingsPayDay.value = snap?.paymentDay ?? 5
  settingsError.value = ''
  settingsDialog.value = true
}

function saveSettings() {
  const weekly = parseFloat(settingsWeekly.value)
  const starting = parseFloat(settingsStarting.value)
  if (!Number.isFinite(weekly) || weekly < 0) {
    settingsError.value = 'Enter a valid weekly amount'
    return
  }
  if (isNewConfig.value && (!Number.isFinite(starting) || starting < 0)) {
    settingsError.value = 'Enter a valid starting amount'
    return
  }
  settingsError.value = ''
  // Optimistic write: close immediately and let Firestore sync in the background,
  // so saving works offline. The snapshot listener updates the UI from the local cache.
  store.saveConfig(selectedChild.value.uid, {
    startingAmount: round2dp(starting),
    weeklyAmount: round2dp(weekly),
    paymentDay: settingsPayDay.value,
  }).catch(() => {})
  settingsDialog.value = false
}

const isNewConfig = computed(() =>
  !store.snapshots.find(s => s.uid === selectedChild.value?.uid)
)

// ── withdrawal dialog ────────────────────────────────────────────────────────

const withdrawalDialog = ref(false)
const withdrawalAmount = ref('')
const withdrawalNote = ref('')
const withdrawalError = ref('')

function openWithdrawal() {
  withdrawalAmount.value = ''
  withdrawalNote.value = ''
  withdrawalError.value = ''
  withdrawalDialog.value = true
}

function confirmWithdrawal() {
  const amount = parseFloat(withdrawalAmount.value)
  if (!Number.isFinite(amount) || amount <= 0) {
    withdrawalError.value = 'Enter a valid amount'
    return
  }
  withdrawalError.value = ''
  // Optimistic write: close immediately, sync in the background (offline-safe).
  const childUid = selectedChild.value.uid
  const write = store.recordWithdrawal(childUid, {
    amount: round2dp(amount),
    note: withdrawalNote.value.trim() || null,
  })
  if (historyExpanded.value && store.transactionsUid === childUid) {
    write.then(() => store.loadTransactions(childUid)).catch(() => {})
  } else {
    write.catch(() => {})
  }
  withdrawalDialog.value = false
}

// ── transaction history ──────────────────────────────────────────────────────

const historyExpanded = ref(false)

async function toggleHistory(uid) {
  if (!historyExpanded.value || store.transactionsUid !== uid) {
    await store.loadTransactions(uid)
    historyExpanded.value = true
  } else {
    historyExpanded.value = false
  }
}

// ── child self-view ──────────────────────────────────────────────────────────

const childHistoryExpanded = ref(false)

async function toggleChildHistory() {
  if (!childHistoryExpanded.value) {
    await store.loadTransactions(family.currentUser.uid)
    childHistoryExpanded.value = true
  } else {
    childHistoryExpanded.value = false
  }
}

const childPendingAmount = computed(() => {
  const uid = family.currentUser?.uid
  if (!uid) return 0
  const snap = store.snapshots.find(s => s.uid === uid)
  if (!snap) return 0
  const lastUpdated = snap.lastUpdated?.toDate?.() ?? new Date()
  const dates = store.pendingPaymentDates(lastUpdated, snap.paymentDay ?? 0)
  return dates.length * (snap.weeklyAmount ?? 0)
})
</script>

<template>
  <div class="pa-4">
    <div class="text-h6 font-weight-bold mt-2 mb-4">Pocket Money</div>

    <!-- ── Parent view ───────────────────────────────────────────────────── -->
    <template v-if="isParent">
      <v-card v-if="children.length === 0" rounded="lg" elevation="1">
        <v-card-text class="text-medium-emphasis text-body-2">
          No children in your family yet.
        </v-card-text>
      </v-card>

      <v-list v-else rounded lines="two">
        <v-list-item
          v-for="child in children"
          :key="child.uid"
          :title="child.name"
          :subtitle="formatBalance(store.displayBalance(child.uid))"
          rounded="lg"
          class="mb-2"
          @click="openDetail(child)"
        >
          <template #prepend>
            <FamilyAvatar :uid="child.uid" :size="40" class="mr-3" />
          </template>
          <template #append>
            <v-icon color="medium-emphasis">mdi-chevron-right</v-icon>
          </template>
        </v-list-item>
      </v-list>

      <!-- Child detail bottom sheet -->
      <v-bottom-sheet v-model="detailSheet" max-width="600">
        <v-card v-if="selectedChild" rounded="t-xl">
          <v-card-title class="pt-4 pb-1 d-flex align-center gap-3">
            <FamilyAvatar :uid="selectedChild.uid" :size="36" />
            {{ selectedChild.name }}
          </v-card-title>

          <v-card-text>
            <div class="text-h4 font-weight-bold mb-1">
              {{ formatBalance(store.displayBalance(selectedChild.uid)) }}
            </div>
            <div class="text-caption text-medium-emphasis mb-4">Current balance</div>

            <div class="d-flex gap-2 flex-wrap mb-4">
              <v-btn
                variant="outlined"
                prepend-icon="mdi-cog-outline"
                @click="openSettings"
              >
                Settings
              </v-btn>
              <v-btn
                variant="tonal"
                color="error"
                prepend-icon="mdi-cash-minus"
                :disabled="store.displayBalance(selectedChild.uid) === null"
                @click="openWithdrawal"
              >
                Record withdrawal
              </v-btn>
            </div>

            <v-btn
              variant="text"
              size="small"
              :loading="store.loading"
              :prepend-icon="historyExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="toggleHistory(selectedChild.uid)"
            >
              {{ historyExpanded ? 'Hide' : 'View' }} history
            </v-btn>

            <template v-if="historyExpanded && store.transactionsUid === selectedChild.uid">
              <div v-if="store.transactions.length === 0" class="text-caption text-medium-emphasis mt-2">
                No transactions in the last 90 days.
              </div>
              <v-list v-else density="compact" class="mt-1 pa-0">
                <v-list-item
                  v-for="txn in store.transactions"
                  :key="txn.id"
                  :subtitle="formatDate(txn.date)"
                  class="px-0"
                >
                  <template #prepend>
                    <v-icon
                      :color="txn.type === 'payment' ? 'success' : 'error'"
                      size="18"
                      class="mr-2"
                    >
                      {{ txn.type === 'payment' ? 'mdi-arrow-down-circle' : 'mdi-arrow-up-circle' }}
                    </v-icon>
                  </template>
                  <template #title>
                    <span :class="txn.type === 'payment' ? 'text-success' : 'text-error'">
                      {{ (txn.type === 'payment' ? '+' : '-') + formatGBP(txn.amount) }}
                    </span>
                    <span v-if="txn.note" class="text-caption text-medium-emphasis ml-2">
                      {{ txn.note }}
                    </span>
                  </template>
                </v-list-item>
              </v-list>
            </template>
          </v-card-text>

          <v-card-actions class="pb-4 px-4">
            <v-spacer />
            <v-btn variant="text" @click="detailSheet = false">Close</v-btn>
          </v-card-actions>
        </v-card>
      </v-bottom-sheet>

      <!-- Settings dialog -->
      <v-dialog v-model="settingsDialog" max-width="400">
        <v-card rounded="lg">
          <v-card-title class="pt-4">
            Pocket money settings
          </v-card-title>
          <v-card-subtitle v-if="selectedChild" class="pb-0">
            {{ selectedChild.name }}
          </v-card-subtitle>

          <v-card-text class="pt-3">
            <v-text-field
              v-if="isNewConfig"
              v-model="settingsStarting"
              label="Starting amount (£)"
              type="number"
              min="0"
              step="0.01"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <v-text-field
              v-model="settingsWeekly"
              label="Weekly amount (£)"
              type="number"
              min="0"
              step="0.01"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <div class="text-body-2 mb-2">Payment day</div>
            <v-chip-group
              v-model="settingsPayDay"
              mandatory
              selected-class="text-primary"
            >
              <v-chip
                v-for="(name, idx) in DAY_NAMES"
                :key="idx"
                :value="idx"
                size="small"
              >
                {{ name }}
              </v-chip>
            </v-chip-group>
            <v-alert
              v-if="settingsError"
              type="error"
              density="compact"
              class="mt-3"
            >
              {{ settingsError }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="pb-4 px-4">
            <v-spacer />
            <v-btn variant="text" @click="settingsDialog = false">
              Cancel
            </v-btn>
            <v-btn
              color="primary"
              variant="tonal"
              @click="saveSettings"
            >
              Save
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>

      <!-- Withdrawal dialog -->
      <v-dialog v-model="withdrawalDialog" max-width="400">
        <v-card rounded="lg">
          <v-card-title class="pt-4">Record withdrawal</v-card-title>
          <v-card-subtitle v-if="selectedChild" class="pb-0">{{ selectedChild.name }}</v-card-subtitle>

          <v-card-text class="pt-3">
            <v-text-field
              v-model="withdrawalAmount"
              label="Amount (£)"
              type="number"
              min="0.01"
              step="0.01"
              variant="outlined"
              density="comfortable"
              class="mb-3"
            />
            <v-text-field
              v-model="withdrawalNote"
              label="Note (optional)"
              variant="outlined"
              density="comfortable"
            />
            <v-alert
              v-if="withdrawalError"
              type="error"
              density="compact"
              class="mt-3"
            >
              {{ withdrawalError }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="pb-4 px-4">
            <v-spacer />
            <v-btn variant="text" @click="withdrawalDialog = false">
              Cancel
            </v-btn>
            <v-btn
              color="error"
              variant="tonal"
              @click="confirmWithdrawal"
            >
              Confirm
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-dialog>
    </template>

    <!-- ── Child self-view ───────────────────────────────────────────────── -->
    <template v-else>
      <v-card rounded="lg" elevation="1">
        <v-card-text>
          <div class="text-body-2 text-medium-emphasis mb-1">Your balance</div>
          <div class="text-h3 font-weight-bold mb-2">
            {{ formatBalance(store.displayBalance(family.currentUser?.uid)) }}
          </div>

          <v-chip
            v-if="childPendingAmount > 0"
            color="success"
            size="small"
            class="mb-3"
          >
            +{{ formatGBP(childPendingAmount) }} pending
          </v-chip>

          <div>
            <v-btn
              variant="text"
              size="small"
              :loading="store.loading"
              :prepend-icon="childHistoryExpanded ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              @click="toggleChildHistory"
            >
              {{ childHistoryExpanded ? 'Hide' : 'View' }} history
            </v-btn>
          </div>

          <template v-if="childHistoryExpanded">
            <div v-if="store.transactions.length === 0" class="text-caption text-medium-emphasis mt-2">
              No transactions in the last 90 days.
            </div>
            <v-list v-else density="compact" class="mt-1 pa-0">
              <v-list-item
                v-for="txn in store.transactions"
                :key="txn.id"
                :subtitle="formatDate(txn.date)"
                class="px-0"
              >
                <template #prepend>
                  <v-icon
                    :color="txn.type === 'payment' ? 'success' : 'error'"
                    size="18"
                    class="mr-2"
                  >
                    {{ txn.type === 'payment' ? 'mdi-arrow-down-circle' : 'mdi-arrow-up-circle' }}
                  </v-icon>
                </template>
                <template #title>
                  <span :class="txn.type === 'payment' ? 'text-success' : 'text-error'">
                    {{ (txn.type === 'payment' ? '+' : '-') + formatGBP(txn.amount) }}
                  </span>
                  <span v-if="txn.note" class="text-caption text-medium-emphasis ml-2">
                    {{ txn.note }}
                  </span>
                </template>
              </v-list-item>
            </v-list>
          </template>
        </v-card-text>
      </v-card>
    </template>
  </div>
</template>

