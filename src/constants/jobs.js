// Household job statuses and priorities.
// These strings are the contract with Firestore documents and security rules
// — do not change the values without a schema migration.

// Ordered array of job status values (display order: suggested → done).
export const JOB_STATUSES = ['suggested', 'planned', 'in_progress', 'done']

// Human-readable labels for each status value.
export const JOB_STATUS_LABELS = {
  suggested:   'Suggested',
  planned:     'Planned',
  in_progress: 'In Progress',
  done:        'Done',
}

// Job priority values. null means no priority set.
export const JOB_PRIORITIES = ['high', 'medium', 'low']

// Vuetify colour token for each priority — the single source of truth for
// priority chip colours across the app (JobCard, JobsPreview). Fall back to
// 'grey' for an absent/unknown priority at the call site.
export const JOB_PRIORITY_COLOURS = {
  high:   'error',
  medium: 'warning',
  low:    'success',
}
