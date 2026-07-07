# WhatsApp Sender (worker)

Sends the academy's WhatsApp messages (score cards, reminders) automatically.
Runs on an always-on Windows PC; the website calls it over a private tunnel.

> ⚠️ **Ban risk.** This automates a real WhatsApp number (unofficial) — Meta can
> ban it anytime. Use a **dedicated prepaid SIM**, never the academy's main
> number. Don't mass-blast; for notices everyone should see, use the app's
> **Admin → Announcements** (WhatsApp Community) — that needs no worker.

---

## Setup (for staff) — do once

**Before you start**
- The PC needs **Google Chrome** (get it at **google.com/chrome**).
- Have the **academy WhatsApp phone** (the dedicated SIM) nearby.
- Have the **secret code** (ask whoever set up the website).

**Steps**
1. Copy the **`wa-worker`** folder onto the PC (Desktop is fine).
2. Open it → double-click **`setup-client.bat`** → wait while it installs.
3. When it asks, paste the **secret** and press **Enter**.
4. A **QR code** opens. On the phone: **WhatsApp → Settings → Linked Devices → Link a Device → scan it.**
5. Wait for **connected**. ✅ Done — messages now send by themselves.

**Keep it working**
- Leave the PC **switched on** (don't shut it down).
- Stop it sleeping: **Settings → Power → Sleep → Never.**

---

## If it stops working — redo
1. Double-click **`clean-uninstall.bat`** → confirm.
2. Double-click **`setup-client.bat`**.

Usually **no typing and no re-scan** — it remembers the secret and the phone link.

## Change the WhatsApp phone
From the website, no need to touch the PC:
**Admin → Settings → Link WhatsApp → Disconnect & re-link → scan the new phone.**

## Check if it's working
Website → **Admin → Settings → Link WhatsApp**. **Green = working.**

---
---

## How it works (for developers)

```
[Next.js on Vercel]  --HTTPS + bearer secret-->  [this worker, 24/7 PC]  -->  WhatsApp Web
```

- **`server.mjs`** — the worker: drives WhatsApp Web via whatsapp-web.js + Chrome, exposes a tiny HTTP API.
- **`tunnel.mjs`** — starts a Cloudflare quick tunnel and **self-registers** its public URL to the app (`POST /api/worker/register-url`, bearer `WA_WORKER_SECRET`) on boot + every 5 min. The app reads the live URL from `app_settings.wa_worker_url` (falling back to the `WA_WORKER_URL` env). So the ephemeral tunnel URL can change on every reboot with **no Vercel edit**.
- **`setup-client.bat`** — one-run installer: Node (if absent) + cloudflared + deps + Chrome + a Startup shortcut (`run.bat`) + opens the QR. Secret saved to gitignored `wa-secret.txt` so it never re-prompts.
- **`clean-uninstall.bat`** — wipes generated files for a fresh `setup-client` run; keeps `.wwebjs_auth` (no re-scan) + `wa-secret.txt` (no re-type).
- **`run.bat` / `run-tunnel.bat`** — autostart targets (auto-restart loops); launched by the Startup shortcut.

### Chrome
whatsapp-web.js needs a real Chrome; modern puppeteer does **not** download one on `npm install`. `setup-client.bat` prefers an **installed Google Chrome** (writes `CHROME_PATH` to `.env`); if none, it downloads puppeteer's pinned Chrome-for-Testing (`node node_modules/puppeteer/install.mjs`). A half-downloaded `~/.cache/puppeteer` (folder present, `.exe` missing) blocks reinstalls — setup wipes it and retries. Do **not** use `npx --yes puppeteer browsers install chrome` — it pulls a newer puppeteer with a mismatched Chrome build.

### API
| Method | Path       | Auth          | Body                       | Returns |
|--------|------------|---------------|----------------------------|---------|
| GET    | `/health`  | none          | —                          | `{ ready }` |
| POST   | `/send`    | Bearer secret | `{ to:"+60…", text:"…" }`  | `{ status:"sent", providerMessageId }` / failed |
| GET    | `/qr.json` | Bearer secret | —                          | `{ ready, dataUrl }` |
| POST   | `/logout`  | Bearer secret | —                          | exits → supervisor restarts → fresh QR (super-admin "Disconnect & re-link") |

Test once READY:
```bash
curl -X POST http://localhost:8787/send -H "Authorization: Bearer YOUR_SECRET" \
  -H "Content-Type: application/json" -d '{"to":"+60123456789","text":"test"}'
```

The official, ban-free path is the Meta Cloud API — still wired in the app; set the `WHATSAPP_*` env vars instead of the worker ones to switch to it.
