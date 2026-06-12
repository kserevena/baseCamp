export const isDev =
  import.meta.env.VITE_USE_EMULATOR === 'true' ||
  (import.meta.env.VITE_FIREBASE_PROJECT_ID ?? '').includes('dev')
