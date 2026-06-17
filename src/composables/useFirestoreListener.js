import { onSnapshot } from 'firebase/firestore'

export function useFirestoreListener() {
  const handles = new Set()

  function subscribe(ref, handler) {
    const rawUnsub = onSnapshot(ref, handler)
    handles.add(rawUnsub)
    return function unsubscribe() {
      if (!handles.has(rawUnsub)) return
      rawUnsub()
      handles.delete(rawUnsub)
    }
  }

  function unsubscribeAll() {
    for (const fn of handles) fn()
    handles.clear()
  }

  return { subscribe, unsubscribeAll }
}
