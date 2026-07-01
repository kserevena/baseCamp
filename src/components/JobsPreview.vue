<script setup>
import { computed } from 'vue'
import { useJobsStore } from '@/stores/jobs.js'

const jobsStore = useJobsStore()

// Priority chip colours — mirror JobCard.vue so the two views stay consistent.
const priorityColor = {
  high: 'error',
  medium: 'warning',
  low: 'success',
}

// Up to 3 highest-priority active jobs, plus a count of any beyond that.
const topJobs = computed(() => jobsStore.activeJobsByPriority.slice(0, 3))
const overflow = computed(() => jobsStore.activeJobsByPriority.length - topJobs.value.length)
</script>

<template>
  <!-- Whole card links to the full jobs view, mirroring the shopping summary card -->
  <v-card rounded="lg" elevation="1" :to="'/jobs'">
    <v-card-text>
      <div class="d-flex align-center">
        <v-icon color="primary" class="mr-2">mdi-clipboard-check-outline</v-icon>
        <span class="text-subtitle-1 font-weight-medium">Household jobs</span>
        <v-spacer />
        <v-chip
          v-if="overflow > 0"
          size="x-small"
          variant="tonal"
          color="grey"
        >
          +{{ overflow }}
        </v-chip>
      </div>

      <!-- Top jobs -->
      <div v-if="topJobs.length > 0" class="mt-2 d-flex flex-column gap-1">
        <div
          v-for="job in topJobs"
          :key="job.id"
          class="d-flex align-center gap-2"
        >
          <span class="text-body-2 text-truncate flex-grow-1" style="min-width: 0">{{ job.title }}</span>
          <v-chip
            v-if="job.priority"
            size="x-small"
            :color="priorityColor[job.priority] ?? 'grey'"
            variant="tonal"
          >
            {{ job.priority }}
          </v-chip>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="text-body-2 text-medium-emphasis mt-1">
        No jobs yet
      </div>
    </v-card-text>
  </v-card>
</template>
