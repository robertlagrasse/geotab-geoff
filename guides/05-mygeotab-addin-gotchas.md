# MyGeotab Add-In Gotchas: Everything the Docs Don't Tell You

## What This Guide Covers

Building a MyGeotab Add-In that's externally hosted, uses a modern framework (React, Vue, etc.), and needs to authenticate with your own backend. The official docs cover the basics. This guide covers everything that broke when we actually built one.

## The Architecture

MyGeotab loads your Add-In inside an iframe. Your HTML page is fetched from your server and injected into the MyGeotab UI. Simple in theory. Here's what goes wrong.

## Gotcha 1: MyGeotab Strips the `<head>` Element

**The problem:** MyGeotab's iframe loader drops the entire `<head>` element from your HTML. This means:

- All `<style>` tags disappear
- All `<link rel="stylesheet">` tags disappear
- Any `<meta>` tags disappear
- Any `<script>` tags in the head disappear

**The symptom:** Your Add-In loads with zero CSS. Raw unstyled HTML. Everything works functionally, but it looks broken.

**The fix:** Inject CSS through JavaScript at runtime.

```javascript
// In your app's entry point, inject styles into the document
function injectStyles(css) {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}

// If using Vite, configure it to inline CSS into the JS bundle
// (see Gotcha 3 for the Vite config)
```

For Vite specifically, this is solved in the build config — see Gotcha 3 below.

**Why this matters:** This is the single biggest time sink in Add-In development. You'll think your code is broken when it's actually just unstyled. If you're seeing raw HTML with no CSS, this is why.

## Gotcha 2: Inline `<script>` Tags Don't Execute

**The problem:** MyGeotab doesn't execute inline `<script>` tags in your Add-In HTML. If your bundler outputs:

```html
<script type="module" src="./app.js"></script>
```

This won't run.

**The fix:** Your JavaScript must be an IIFE (Immediately Invoked Function Expression) that's referenced as a regular script, or better yet, loaded dynamically:

```html
<script>
  // This inline script WON'T execute in MyGeotab
</script>

<!-- Instead, reference an external IIFE bundle -->
<script src="https://your-host.com/addin.js"></script>
```

But even external `<script>` tags can be unreliable depending on the MyGeotab version. The most robust approach is to have a minimal HTML shell that dynamically loads your JS:

```html
<div id="geoff-addin-root"></div>
```

And register your Add-In's lifecycle methods on the global `window.geotab.addin` object, which MyGeotab calls directly.

## Gotcha 3: Build as IIFE, Not ES Module

**The problem:** Modern bundlers (Vite, webpack) output ES modules by default. ES modules require `type="module"` on the script tag, which MyGeotab doesn't support.

**The fix (Vite):**

```javascript
// vite.addin.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-addin',
    rollupOptions: {
      input: 'src/addin.jsx',
      output: {
        // IIFE format — no import/export, runs immediately
        format: 'iife',
        entryFileNames: 'addin.js',
        // Inline all CSS into the JS bundle (since <style> tags get stripped)
        inlineDynamicImports: true,
      },
    },
    // Don't split into chunks — everything in one file
    cssCodeSplit: false,
  },
});
```

The key settings:
- `format: 'iife'` — outputs a self-executing bundle, no module system
- `inlineDynamicImports: true` — everything in one file
- `cssCodeSplit: false` — CSS gets inlined into the JS

## Gotcha 4: The Add-In Lifecycle

MyGeotab calls three lifecycle methods on your Add-In object:

```javascript
window.geotab.addin.yourAddinName = () => {
  return {
    initialize(api, state, callback) {
      // Called once when the Add-In is first loaded
      // api = Geotab API object
      // state = saved state
      // callback = call when done initializing
      callback();
    },
    focus(api, state) {
      // Called every time the user navigates to your Add-In tab
      // This is where you mount your React app
    },
    blur(api, state) {
      // Called when the user navigates away
      // This is where you unmount/cleanup
    }
  };
};
```

**Key insight:** `initialize` is called once. `focus`/`blur` are called every time the user switches tabs. Mount your React app in `focus`, unmount in `blur`. Don't mount in `initialize` — the DOM element might not be visible yet.

```javascript
// addin.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import Dashboard from './components/dashboard/Dashboard';

let root = null;

window.geotab.addin.geoff = () => ({
  initialize(api, state, callback) {
    // Store api reference for later use
    window._geotabApi = api;
    callback();
  },

  focus(api, state) {
    const container = document.getElementById('geoff-addin-root');
    if (container && !root) {
      root = createRoot(container);
      root.render(<Dashboard />);
    }
  },

  blur(api, state) {
    if (root) {
      root.unmount();
      root = null;
    }
  },
});
```

## Gotcha 5: `api.getSession()` Is Callback-Based

**The problem:** The MyGeotab API object passed to your Add-In uses callbacks, not Promises. And `api.getSession()` is the only reliable way to get the user's session credentials.

```javascript
// This is how you get the session — callback style
api.getSession(function(session) {
  // session = { database, userName, sessionId, server }
  console.log(session);
});

// There's no promise version. There's no async/await version.
// You have to wrap it yourself.
```

**The fix:**

```javascript
function getSession(api) {
  return new Promise((resolve, reject) => {
    try {
      api.getSession(function(session) {
        resolve(session);
      });
    } catch (err) {
      reject(err);
    }
  });
}

// Now you can use it with async/await
const session = await getSession(api);
```

**Important:** Other methods on the API object (like `api.call()`) may or may not work depending on the context. `getSession()` is the one you can count on.

## Gotcha 6: Custom Authentication Flow

**The problem:** MyGeotab provides a session (database, userName, sessionId), but your backend uses Firebase (or Auth0, or whatever). You need to exchange the Geotab session for your backend's auth token.

**The flow:**

```
MyGeotab Add-In
    │
    ├─ 1. api.getSession() → { database, userName, sessionId, server }
    │
    ├─ 2. POST to your backend: /geotabAuth with session credentials
    │
    │   Backend:
    │   ├─ 3. Verify session by calling Geotab API directly (JSONRPC)
    │   ├─ 4. Generate deterministic UID from database:userName
    │   └─ 5. Mint Firebase custom token with claims
    │
    └─ 6. signInWithCustomToken(token) → Firebase authenticated
```

**Backend verification (the key part):**

You CANNOT use the mg-api-js SDK for session-based auth. The SDK expects username + password. For session verification, use direct JSONRPC:

```javascript
// Verify a Geotab session via direct JSONRPC call
async function verifyGeotabSession(database, userName, sessionId, server) {
  const response = await fetch(`https://${server}/apiv1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      method: 'GetSystemTimeUtc',
      params: {
        credentials: { database, userName, sessionId },
      },
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error('Invalid session');
  }
  return true; // Session is valid
}
```

**Why `GetSystemTimeUtc`?** It's the lightest-weight Geotab API call. We're not interested in the result — we just need to confirm the session is valid. If the call succeeds, the session is real.

**Deterministic UID generation:**

```javascript
import { createHash } from 'crypto';

// Same database:userName always produces the same UID
const raw = `${database}:${userName}`.toLowerCase();
const uid = 'geotab_' + createHash('sha256').update(raw).digest('hex').slice(0, 28);
```

This ensures that the same Geotab user always maps to the same Firebase user, regardless of which session they use.

**Server-side validation:**

```javascript
// Validate server param — must end with .geotab.com
if (!server.endsWith('.geotab.com')) {
  throw new Error('Invalid server');
}
```

Always validate the server parameter. A malicious client could point you at a fake Geotab server to steal credentials.

## Gotcha 7: Firestore Listeners Must Wait for Auth

**The problem:** If your Add-In uses Firestore real-time listeners, they must be set up AFTER Firebase authentication completes. If you set them up before auth, they'll fail silently or return empty results (depending on your security rules).

```javascript
// WRONG — listener set up before auth
useEffect(() => {
  const unsub = onSnapshot(collection(db, 'sessions'), (snap) => {
    // This will fail or return nothing
  });
  return unsub;
}, []);

// RIGHT — listener waits for auth
useEffect(() => {
  if (!user) return; // Wait for auth
  const unsub = onSnapshot(collection(db, 'sessions'), (snap) => {
    // Now this works
  });
  return unsub;
}, [user]);
```

## Gotcha 8: IAM Permissions for Custom Tokens

**The problem:** If your Cloud Function mints Firebase custom tokens with `admin.auth().createCustomToken()`, the Cloud Functions service account needs the `iam.serviceAccounts.signBlob` permission.

**The fix:**

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT \
  --member="serviceAccount:YOUR_PROJECT@appspot.gserviceaccount.com" \
  --role="roles/iam.serviceAccountTokenCreator"
```

Without this, `createCustomToken()` fails with a cryptic error about missing permissions. The error message doesn't mention `signBlob` or token creation — it just says "permission denied."

## Gotcha 9: Add-In Registration

Your Add-In needs to be registered in MyGeotab's configuration. The `configuration.json`:

```json
{
  "name": "Your Add-In Name",
  "supportEmail": "you@example.com",
  "version": "1.0.0",
  "items": [{
    "url": "https://your-host.com/addin.html",
    "path": "ActivityLink/",
    "menuName": {
      "en": "Your Add-In"
    },
    "icon": "https://your-host.com/icon.svg"
  }]
}
```

**Externally hosted** means MyGeotab fetches your HTML from your URL on every page load. No deployment to Geotab's servers. Changes are instant — just update your hosted files.

## The Complete Build Pipeline

```
app/src/addin.jsx          ← React entry point with lifecycle
        │
  vite build (addin config) → dist-addin/addin.js (IIFE, CSS inlined)
        │
  post-build script         → dist/addin.html (loads addin.js)
        │
  firebase deploy --only hosting
        │
  MyGeotab loads addin.html → iframe → your React app
```

## Summary of Gotchas

| # | Gotcha | Symptom | Fix |
|---|--------|---------|-----|
| 1 | `<head>` stripped | No CSS | Inject via JS |
| 2 | Inline scripts don't execute | App doesn't load | External IIFE |
| 3 | ES modules unsupported | Script error | Build as IIFE |
| 4 | Lifecycle timing | App mounts wrong | Mount in `focus`, unmount in `blur` |
| 5 | Callback-based API | Can't use async/await | Promise wrapper |
| 6 | Session ≠ your auth | Need token exchange | JSONRPC verify + custom token |
| 7 | Listeners before auth | Empty data | Wait for auth state |
| 8 | Missing IAM role | createCustomToken fails | `serviceAccountTokenCreator` |

Every one of these cost us time. None of them are documented in the official Add-In guide. Save yourself the debugging.
