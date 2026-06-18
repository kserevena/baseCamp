import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection, collectionGroup, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  getDocs, serverTimestamp, query, where, writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase/config.js'
import { useFamilyStore } from '@/stores/family.js'

// Two real-time listeners are maintained:
//  1. unsubscribeJobs — subscribes to families/{familyId}/householdJobs (the job docs)
//  2. unsubscribeSubtasks — subscribes via collectionGroup('subtasks') filtered by
//     familyId. A collection-group query is required because each subtask lives under
//     its parent job (families/{familyId}/householdJobs/{jobId}/subtasks/{subtaskId}),
//     and we need to load all subtasks for the family without knowing job IDs upfront.
//
// The collection-group listener requires a top-level wildcard read rule in
// firestore.rules (/{path=**}/subtasks/{subtaskId}) because path-nested rules do
// NOT apply to collection-group queries.
//
// toggleSubtask is the ONLY action any family member (child included) can call.
// All other write actions are parent-only — the UI gates them; the rules enforce them.

export const useJobsStore = defineStore('jobs', () => {
  const familyStore = useFamilyStore()

  const jobs = ref([])
  const subtasks = ref([])

  let currentFamilyId = null
  let unsubscribeJobs = null
  let unsubscribeSubtasks = null

  // ── getters ────────────────────────────────────────────────────────────────

  const subtasksFor = computed(() => (jobId) =>
    subtasks.value
      .filter(s => s.jobId === jobId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  )

  const progressFor = computed(() => (jobId) => {
    const list = subtasksFor.value(jobId)
    return { done: list.filter(s => s.done).length, total: list.length }
  })

  // ── setup / teardown ───────────────────────────────────────────────────────

  function setup(familyId) {
    if (unsubscribeJobs) unsubscribeJobs()
    if (unsubscribeSubtasks) unsubscribeSubtasks()

    currentFamilyId = familyId

    unsubscribeJobs = onSnapshot(
      collection(db, 'families', familyId, 'householdJobs'),
      (snap) => {
        jobs.value = snap.docs.map(d => {
          const data = d.data()
          return {
            id:           d.id,
            title:        data.title ?? '',
            description:  data.description ?? null,
            category:     data.category ?? '',
            status:       data.status ?? 'suggested',
            priority:     data.priority ?? null,
            costEstimate: data.costEstimate ?? null,
            suggestedBy:  data.suggestedBy ?? null,
            assignedTo:   data.assignedTo ?? null,
            createdAt:    data.createdAt ?? null,
            updatedAt:    data.updatedAt ?? null,
          }
        })
      },
    )

    unsubscribeSubtasks = onSnapshot(
      query(collectionGroup(db, 'subtasks'), where('familyId', '==', familyId)),
      (snap) => {
        subtasks.value = snap.docs.map(d => {
          const data = d.data()
          return {
            id:         d.id,
            jobId:      data.jobId ?? null,
            familyId:   data.familyId ?? familyId,
            title:      data.title ?? '',
            done:       data.done ?? false,
            assignedTo: data.assignedTo ?? null,
            order:      data.order ?? 0,
            createdAt:  data.createdAt ?? null,
            updatedAt:  data.updatedAt ?? null,
          }
        })
      },
    )
  }

  function teardown() {
    if (unsubscribeJobs) unsubscribeJobs()
    if (unsubscribeSubtasks) unsubscribeSubtasks()
    unsubscribeJobs = null
    unsubscribeSubtasks = null
    currentFamilyId = null
    jobs.value = []
    subtasks.value = []
  }

  // ── job actions ────────────────────────────────────────────────────────────

  function addJob({ title, description = null, category = '' }) {
    if (!currentFamilyId) return
    addDoc(collection(db, 'families', currentFamilyId, 'householdJobs'), {
      title,
      description: description ?? null,
      category,
      status:       'suggested',
      priority:     null,
      costEstimate: null,
      suggestedBy:  familyStore.currentUser?.uid ?? null,
      assignedTo:   null,
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp(),
    })
  }

  function updateJob(jobId, fields) {
    if (!currentFamilyId) return
    updateDoc(doc(db, 'families', currentFamilyId, 'householdJobs', jobId), {
      ...fields,
      updatedAt: serverTimestamp(),
    })
  }

  async function deleteJob(jobId) {
    if (!currentFamilyId) return
    // Delete subtask docs first — the subtask rule reads the parent job doc to
    // resolve familyId; deleting the parent first would cause subtask deletes to fail.
    const subtasksSnap = await getDocs(
      collection(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks')
    )
    await Promise.all(subtasksSnap.docs.map(d =>
      deleteDoc(doc(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks', d.id))
    ))
    await deleteDoc(doc(db, 'families', currentFamilyId, 'householdJobs', jobId))
  }

  // ── subtask actions ────────────────────────────────────────────────────────

  function addSubtask(jobId, title) {
    if (!currentFamilyId) return
    const existing = subtasks.value.filter(s => s.jobId === jobId)
    const maxOrder = existing.reduce((m, s) => Math.max(m, s.order ?? 0), 0)
    addDoc(
      collection(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks'),
      {
        familyId:   currentFamilyId,
        jobId,
        title,
        done:       false,
        assignedTo: null,
        order:      maxOrder + 1,
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp(),
      }
    )
  }

  // toggleSubtask is the ONLY action available to non-parent members.
  // It only touches the `done` field (+updatedAt) to satisfy the security rule.
  // Optimistic: flip in local state immediately, fire Firestore write in background.
  function toggleSubtask(subtaskId) {
    const subtask = subtasks.value.find(s => s.id === subtaskId)
    if (!subtask) return
    const jobId = subtask.jobId
    if (!jobId || !currentFamilyId) return
    const newDone = !subtask.done
    subtask.done = newDone
    updateDoc(
      doc(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks', subtaskId),
      { done: newDone, updatedAt: serverTimestamp() }
    )
  }

  function updateSubtask(subtaskId, { title, assignedTo }) {
    const subtask = subtasks.value.find(s => s.id === subtaskId)
    if (!subtask || !currentFamilyId) return
    const jobId = subtask.jobId
    if (!jobId) return
    const update = {}
    if (title !== undefined) update.title = title
    if (assignedTo !== undefined) update.assignedTo = assignedTo
    update.updatedAt = serverTimestamp()
    updateDoc(
      doc(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks', subtaskId),
      update
    )
  }

  async function reorderSubtasks(jobId, orderedIds) {
    if (!currentFamilyId) return
    const batch = writeBatch(db)
    orderedIds.forEach((id, index) => {
      batch.update(
        doc(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks', id),
        { order: index + 1, updatedAt: serverTimestamp() }
      )
    })
    await batch.commit()
  }

  function deleteSubtask(subtaskId) {
    const subtask = subtasks.value.find(s => s.id === subtaskId)
    if (!subtask || !currentFamilyId) return
    const jobId = subtask.jobId
    if (!jobId) return
    subtasks.value = subtasks.value.filter(s => s.id !== subtaskId)
    deleteDoc(
      doc(db, 'families', currentFamilyId, 'householdJobs', jobId, 'subtasks', subtaskId)
    )
  }

  return {
    jobs,
    subtasks,
    subtasksFor,
    progressFor,
    setup,
    teardown,
    addJob,
    updateJob,
    deleteJob,
    addSubtask,
    toggleSubtask,
    updateSubtask,
    reorderSubtasks,
    deleteSubtask,
  }
})
