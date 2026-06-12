# Firebase context — src/firebase/

## Emulator

Emulator ports (defined in `firebase.json`):

| Service | Port |
|---|---|
| Auth | 9099 |
| Firestore | 8080 |
| Hosting | 5000 |
| Emulator UI | 4000 |

Set `VITE_USE_EMULATOR=true` in `.env` to connect the app to the local emulator. The connection is wired in `config.js` using `connectFirestoreEmulator` and `connectAuthEmulator`.

`seed.js` exports `seedIfEmpty()` — checks whether the emulator already has data and, if not, writes mock family members, shopping items, and meals. Call from the browser console or from test setup.

---

## App Check

`config.js` initialises Firebase App Check (reCAPTCHA v3) to ensure only the genuine app can call Firestore and Auth. It is **guarded**: App Check is skipped when `VITE_USE_EMULATOR=true` or when `VITE_RECAPTCHA_SITE_KEY` is unset, so the emulator flow and tests are unaffected.

Each environment has its own reCAPTCHA site key (from Firebase Console → Build → App Check): the dev key lives in `.env`, the prod key in `.env.prod`. Roll out per environment in **monitoring mode** first, then switch to **enforcement** in the console once metrics confirm legitimate traffic is passing — enforcement is reversible.
