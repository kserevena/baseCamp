# Taking screenshots in a cloud/remote session

There is no display server in cloud containers, and `cdn.playwright.dev` is blocked. Playwright and a pre-cached Chromium binary are available; Puppeteer is **not** installed.

## Key paths

| | Path |
|---|---|
| Playwright module | `/opt/node22/lib/node_modules/playwright` |
| Chromium binary | `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` |

## Setup steps

### 1. Environment

If `.env` is missing, create a minimal one pointing at the emulator (no real credentials needed):

```bash
cat > .env << 'EOF'
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_DOMAIN=demo-test.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=demo-test
VITE_FIREBASE_STORAGE_BUCKET=demo-test.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=000000000000
VITE_FIREBASE_APP_ID=1:000000000000:web:0000000000000000
VITE_USE_EMULATOR=true
EOF
```

### 2. Start services

```bash
firebase emulators:start --project demo-test --only firestore,auth > /tmp/emulator.log 2>&1 &
sleep 6
npm run dev -- --port 5173 > /tmp/vite.log 2>&1 &
sleep 4
```

### 3. Seed users

Always sign in with the password flow to get real tokens — never fabricate token values:

```bash
curl -s -X DELETE http://localhost:9099/emulator/v1/projects/demo-test/accounts \
  -H "Authorization: Bearer owner"
curl -s -X POST \
  "http://localhost:9099/identitytoolkit.googleapis.com/v1/projects/demo-test/accounts:batchCreate" \
  -H "Content-Type: application/json" -H "Authorization: Bearer owner" \
  -d '{"users":[{"localId":"<uid>","email":"<email>","rawPassword":"password123","emailVerified":true}]}'
```

### 4. Seed Firestore

Use `Authorization: Bearer owner` to bypass security rules:

```bash
BASE="http://localhost:8080/v1/projects/demo-test/databases/(default)/documents"
curl -s -X PATCH "$BASE/<collection>/<docId>" \
  -H "Authorization: Bearer owner" -H "Content-Type: application/json" \
  -d '{"fields":{"<field>":{"stringValue":"<value>"}}}'
```

### 5. Write and run the script

Write as a `.cjs` file and run with `node`. Key points:
- Use `domcontentloaded` (not `networkidle0`) — the Firestore WebSocket keeps the connection open indefinitely
- Sign in via the emulator REST API to get a real `idToken`/`refreshToken`, then inject into `localStorage` with `addInitScript` before navigating
- Use `waitForFunction` to confirm expected data is visible before screenshotting

```js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

async function signIn(email, password) {
  const res = await fetch(
    'http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key',
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }) }
  );
  return res.json(); // { localId, idToken, refreshToken, email, ... }
}

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu'],
});
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();

const auth = await signIn('<email>', 'password123');
await page.addInitScript((a) => {
  localStorage.setItem('firebase:authUser:fake-api-key:[DEFAULT]', JSON.stringify({
    uid: a.localId, email: a.email, emailVerified: true, isAnonymous: false,
    providerData: [{ providerId: 'password', uid: a.email, email: a.email }],
    stsTokenManager: { refreshToken: a.refreshToken, accessToken: a.idToken,
                       expirationTime: Date.now() + 3600000 },
    createdAt: String(Date.now()), lastLoginAt: String(Date.now()),
    apiKey: 'fake-api-key', appName: '[DEFAULT]',
  }));
  localStorage.setItem('isMinor', 'false');
}, auth);

await page.goto('http://localhost:5173/<route>', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.innerText.includes('<expected text>'), { timeout: 15000 });
await page.screenshot({ path: '/tmp/screenshot.png' });
await browser.close();
```

### 6. Adding screenshots to a PR

Screenshots belong in the PR, not in the repository. The GitHub MCP tools do not support binary asset uploads. Instead:
- Use `SendUserFile` to send the PNG files to the user's chat.
- In the PR description, write a clear prose description of what each screenshot shows and leave a labelled placeholder comment (`<!-- attach screenshot-name.png here -->`) at each insertion point.
- The user can then drag-and-drop the images from chat into the PR on GitHub.com.
- Never fabricate `github.com/user-attachments/assets/…` URLs — they are only valid after a real upload.
