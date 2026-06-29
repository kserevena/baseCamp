import { ref } from 'vue'

/**
 * Manages form dialog state and lifecycle for add/edit operations.
 * Provides dialog visibility, form data management, and submit/cancel handlers.
 * @param {Object} initialData - Initial form data template (used for reset)
 * @param {Function} onSubmit - Async callback receiving form data; dialog closes on success
 * @returns {Object} { isOpen, formData, openForm, submitForm, closeForm }
 */
export function useFormDialog(initialData, onSubmit) {
  const isOpen = ref(false)
  const formData = ref(structuredClone(initialData))

  /**
   * Open dialog with optional pre-filled data. If no data provided, uses initialData.
   * @param {Object} [dataToEdit] - Data to populate form fields
   */
  const openForm = (dataToEdit) => {
    if (dataToEdit) {
      formData.value = structuredClone(dataToEdit)
    } else {
      formData.value = structuredClone(initialData)
    }
    isOpen.value = true
  }

  /**
   * Close dialog and reset form to initialData.
   */
  const closeForm = () => {
    isOpen.value = false
    formData.value = structuredClone(initialData)
  }

  /**
   * Submit form data via onSubmit callback, then close dialog.
   * If submission throws, dialog remains open for correction.
   */
  const submitForm = async () => {
    try {
      await onSubmit(formData.value)
      closeForm()
    } catch (error) {
      // Keep dialog open, suppress error so form can be corrected
    }
  }

  return {
    isOpen,
    formData,
    openForm,
    submitForm,
    closeForm,
  }
}
