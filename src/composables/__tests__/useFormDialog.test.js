import { describe, it, expect, vi } from 'vitest'
import { useFormDialog } from '../useFormDialog.js'

describe('useFormDialog', () => {
  it('initializes with closed dialog and initial data', () => {
    const initial = { title: '', description: '' }
    const { isOpen, formData } = useFormDialog(initial, vi.fn())

    expect(isOpen.value).toBe(false)
    expect(formData.value).toEqual(initial)
  })

  it('opens dialog without data, using initialData', async () => {
    const initial = { title: '', description: '' }
    const { isOpen, formData, openForm } = useFormDialog(initial, vi.fn())

    openForm()

    expect(isOpen.value).toBe(true)
    expect(formData.value).toEqual(initial)
  })

  it('opens dialog with pre-filled data', async () => {
    const initial = { title: '', description: '' }
    const dataToEdit = { title: 'Test', description: 'A test' }
    const { isOpen, formData, openForm } = useFormDialog(initial, vi.fn())

    openForm(dataToEdit)

    expect(isOpen.value).toBe(true)
    expect(formData.value).toEqual(dataToEdit)
  })

  it('modifies form data without affecting initial template', () => {
    const initial = { title: '', description: '' }
    const { formData, openForm } = useFormDialog(initial, vi.fn())

    openForm()
    formData.value.title = 'Modified'

    expect(formData.value.title).toBe('Modified')
    expect(initial.title).toBe('')
  })

  it('calls onSubmit with form data', async () => {
    const initial = { title: '', description: '' }
    const onSubmit = vi.fn()
    const { formData, openForm, submitForm } = useFormDialog(initial, onSubmit)

    openForm()
    formData.value.title = 'New Title'
    formData.value.description = 'New Description'

    await submitForm()

    expect(onSubmit).toHaveBeenCalledWith({
      title: 'New Title',
      description: 'New Description',
    })
  })

  it('closes dialog and resets form after successful submit', async () => {
    const initial = { title: '', description: '' }
    const onSubmit = vi.fn()
    const { isOpen, formData, openForm, submitForm } = useFormDialog(initial, onSubmit)

    openForm()
    formData.value.title = 'New Title'

    await submitForm()

    expect(isOpen.value).toBe(false)
    expect(formData.value).toEqual(initial)
  })

  it('keeps dialog open if onSubmit throws', async () => {
    const initial = { title: '', description: '' }
    const error = new Error('Validation failed')
    const onSubmit = vi.fn().mockRejectedValue(error)
    const { isOpen, formData, openForm, submitForm } = useFormDialog(initial, onSubmit)

    openForm()
    formData.value.title = 'New Title'

    try {
      await submitForm()
    } catch (e) {
      // Ignore the rejection
    }

    expect(isOpen.value).toBe(true)
    expect(formData.value.title).toBe('New Title')
  })

  it('closes dialog and resets on closeForm', () => {
    const initial = { title: '', description: '' }
    const { isOpen, formData, openForm, closeForm } = useFormDialog(initial, vi.fn())

    openForm()
    formData.value.title = 'Modified'

    closeForm()

    expect(isOpen.value).toBe(false)
    expect(formData.value).toEqual(initial)
  })

  it('handles complex nested objects without mutation', () => {
    const initial = { title: '', nested: { prop: 'value' } }
    const { formData, openForm } = useFormDialog(initial, vi.fn())

    openForm()
    formData.value.nested.prop = 'modified'

    expect(formData.value.nested.prop).toBe('modified')
    expect(initial.nested.prop).toBe('value')
  })
})
