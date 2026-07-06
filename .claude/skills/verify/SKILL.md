---
name: verify
description: Drive the real app (server + PWA) end-to-end through a browser, including passkey login, to verify a change actually works.
---

# Verifying this app end-to-end

The auth is WebAuthn passkeys only (no magic-link fallback yet), so a
plain HTTP client can't get past login. Use Playwright with a CDP
virtual authenticator instead — it's the standard way to drive
WebAuthn registration/login headlessly.

## One-time setup

```bash
cd /Users/eimerbaez/Documents/baez-finance-os
npm init -y --prefix /tmp/pw-verify   # or any scratch dir
npm install --prefix /tmp/pw-verify playwright
npx --prefix /tmp/pw-verify playwright install chromium
```

## Launching the stack

Always `cd` to the repo root explicitly before starting — running
`pnpm --filter` from any other cwd silently no-ops with "No projects
matched the filters", which looks like a hung server but isn't.

```bash
cd /Users/eimerbaez/Documents/baez-finance-os
pkill -f "src/index.ts"                      # kill any stray server — see gotcha below
find packages/server/data -type f -delete    # fresh sqlite (re-seeds on boot)
pnpm --filter @baez/server dev > /tmp/verify-server.log 2>&1 & disown
pnpm --filter @baez/app dev > /tmp/verify-app.log 2>&1 & disown
sleep 3
curl -s http://localhost:3000/api/health     # {"ok":true}
```

App: `http://localhost:5173`. Server: `http://localhost:3000`.
No `.env` needed for local dev — `config.ts` defaults `rpId` to
`localhost` and `origin` to `http://localhost:5173`.

**Gotcha — EADDRINUSE masquerading as "stale state":** `pkill -f
"tsx watch src/index.ts"` does NOT match the actual process (real
argv is `.../tsx/dist/cli.mjs watch src/index.ts`), so it silently
kills nothing. A second `pnpm dev` then crashes on port 3000 already
in use, but the *original* server (with whatever passkeys/data it
had) keeps running underneath, so requests still succeed and look
fine until you hit stale data (e.g. "already registered" on a passkey
you thought was fresh). Use `pkill -f "src/index.ts"` (no "tsx
watch" prefix) and verify with `ps aux | grep src/index.ts` that
exactly one process remains before trusting a "fresh" run.

## Logging in (WebAuthn virtual authenticator)

```js
const { chromium } = require("playwright");
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true },
});
await page.goto("http://localhost:5173/");
await page.click("text=Set up Eimer");   // first time on a fresh db
// or: await page.click("text=Log in with passkey");   // subsequent logins, same browser context
```

Seeded users are "Eimer" and "Ashley" (see `packages/server/src/db/seed.ts`) — no accounts, categories are seeded. The apostrophe in
"Eimer's passkey" is a curly `’`, not `'` — match on a text substring
before the apostrophe (`text=Set up Eimer`), not the full label.

A registered passkey lives in that browser context's virtual
authenticator + the server's sqlite db — both must be reset together.
Reusing "Log in with passkey" across a fresh `chromium.launch()` call
won't work; the new context has no stored credential. Keep
login+everything in one script/one browser session, or persist
`storageState`.

## Flows worth driving

- **Account creation**: Money tab → "Add an account" → fill name,
  pick a kind/currency chip, Save.
- **CSV import, global-+ entry**: tap the round `+` (`button[aria-label="Add"]`)
  → "Upload statement" → AccountPicker sheet → pick account →
  ImportStatement mode (file → mapping → balances → done).
- **CSV import, per-account entry**: Money tab → account row → `⋯`
  overflow (`<details><summary>`, click `summary` to open) → "Import
  a statement" → same ImportStatement mode.
- **Balance gate rejection** (invariant #3): submit an
  opening/closing balance that doesn't match the parsed rows' sum →
  expect the exact string "statement does not balance" rendered
  inline, no navigation to the done step, and no new transactions
  written (check the account's activity list count is unchanged
  after closing out).

## Selector gotchas

- `RecordCard`'s title button is `disabled` when the caller passes no
  `onClick` (true for Money's own `AccountCard` rows). A
  `getByRole('button', { name: /Chase Checking/ })` will match both
  that disabled background button *and* the picker sheet's enabled
  one — scope with `button:not([disabled]):has-text(...)`.
- The overflow menu is a native `<details>/<summary>` — `page.click("summary")`
  toggles it open, no separate "open menu" affordance to wait for.

## Cleanup

```bash
pkill -f "src/index.ts"; pkill -f "vite/bin/vite.js"
find packages/server/data -type f -delete
```
